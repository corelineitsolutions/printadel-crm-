import Leave, { LeaveType, LeaveStatus } from "../models/Leave";
import Attendance, { AttendanceStatus } from "../models/Attendance";
import User, { UserRole } from "../models/User";
import LeaveBalance from "../models/LeaveBalance";
import { createNotification } from "./notification.service";
import { NotificationType } from "../models/Notification";
import { sendEmail } from "../config/email";
import Setting from "../models/Setting";
import { getISTStartOfDay, getISTDate } from "../utils/date.utils";
import { DEFAULT_HOLIDAYS_WITH_NAMES } from "../utils/holiday.utils";


/**
 * Leave Service
 * Handles all leave-related business logic
 */

interface ApplyLeaveData {
  userId: string;
  leaveType: LeaveType;
  startDate: Date;
  endDate: Date;
  days: number;
  isHalfDay?: boolean;
  reason: string;
}

interface UpdateLeaveStatusData {
  leaveId: string;
  status: LeaveStatus;
  approvedBy: string;
  rejectionReason?: string;
}

interface GetLeavesFilters {
  userId?: string;
  status?: LeaveStatus;
  leaveType?: LeaveType;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

const DEFAULT_LEAVE_ALLOCATION = { sickLeave: 12, casualLeave: 12, vacationLeave: 15 };
const LEAVE_ALLOCATION_KEYS = ["sickLeave", "casualLeave", "vacationLeave"] as const;
const USED_FIELD_BY_TYPE: Record<string, string> = {
  SICK: "sickLeaveUsed",
  CASUAL: "casualLeaveUsed",
  VACATION: "vacationLeaveUsed",
};

export function parseHolidayDates(value?: string | null): Set<string> {
  if (!value) return new Set();
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((entry: string) => String(entry).split("|")[0].trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

export const leaveService = {
  /**
   * Annual leave quotas configured in Settings → Leave Policy
   */
  async getLeaveAllocation() {
    const settings = await Setting.find({ key: { $in: [...LEAVE_ALLOCATION_KEYS] } });
    const allocation = { ...DEFAULT_LEAVE_ALLOCATION };
    for (const s of settings) {
      const value = Number(s.value);
      if (s.value !== "" && Number.isFinite(value) && value >= 0) {
        allocation[s.key as keyof typeof allocation] = value;
      }
    }
    return allocation;
  },

  async createLeaveBalance(userId: any, year: number) {
    const allocation = await this.getLeaveAllocation();
    return LeaveBalance.create({ userId, year, ...allocation });
  },

  /**
   * Push the configured quotas to every employee's balance for the given year.
   * Used days are kept as they are.
   */
  async applyLeaveAllocationToYear(year: number) {
    const allocation = await this.getLeaveAllocation();
    await LeaveBalance.updateMany({ year }, { $set: allocation });
  },

  /**
   * Recount the days of pending/approved leaves that overlap holidays that were added or removed,
   * and correct the used balance of approved leaves by the difference.
   */
  async recalculateLeavesForHolidayChange(oldValue?: string | null, newValue?: string | null) {
    const oldDates = parseHolidayDates(oldValue);
    const newDates = parseHolidayDates(newValue);
    const changed = [
      ...[...oldDates].filter((d) => !newDates.has(d)),
      ...[...newDates].filter((d) => !oldDates.has(d)),
    ].sort();
    if (changed.length === 0) return;

    const rangeStart = new Date(`${changed[0]}T00:00:00+05:30`);
    const rangeEnd = new Date(`${changed[changed.length - 1]}T23:59:59+05:30`);

    const leaves = await Leave.find({
      status: { $in: [LeaveStatus.PENDING, LeaveStatus.APPROVED] },
      isHalfDay: { $ne: true },
      startDate: { $lte: rangeEnd },
      endDate: { $gte: rangeStart },
    });

    for (const leave of leaves) {
      const newDays = await this.calculateWorkingDays(new Date(leave.startDate), new Date(leave.endDate));
      const diff = newDays - (leave.days || 0);
      if (diff === 0) continue;

      leave.days = newDays;
      await leave.save();

      const usedField = USED_FIELD_BY_TYPE[leave.leaveType];
      if (leave.status === LeaveStatus.APPROVED && usedField) {
        await LeaveBalance.findOneAndUpdate(
          { userId: leave.userId, year: getISTDate(new Date(leave.startDate)).getFullYear() },
          { $inc: { [usedField]: diff } }
        );
      }
    }
  },

  /**
   * Helper: Count actual working days between two dates (excluding Sundays and Holidays)
   */
  async calculateWorkingDays(start: Date, end: Date): Promise<number> {
    const holidaySet = await this.loadHolidays();
    let count = 0;
    const cur = new Date(start);
    const stop = new Date(end);

    while (cur <= stop) {
      const istCur = getISTDate(cur);
      const dayOfWeek = istCur.getDay(); // 0 is Sunday
      const isSunday = dayOfWeek === 0;

      // Format date for holiday check (YYYY-MM-DD)
      const yr = istCur.getFullYear();
      const mo = String(istCur.getMonth() + 1).padStart(2, "0");
      const da = String(istCur.getDate()).padStart(2, "0");
      const dateStr = `${yr}-${mo}-${da}`;

      if (!isSunday && !holidaySet.has(dateStr)) {
        count++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  },

  /**
   * Helper: Load Company Holidays from settings
   */
  async loadHolidays(): Promise<Set<string>> {
    try {
      const setting = await Setting.findOne({ key: "COMPANY_HOLIDAYS" });
      return parseHolidayDates(setting?.value || JSON.stringify(DEFAULT_HOLIDAYS_WITH_NAMES));
    } catch (err) {
      console.warn("Could not load COMPANY_HOLIDAYS for leave balance check:", err);
    }
    return new Set();
  },

  /**
   * Apply for leave
   */
  async applyLeave(data: ApplyLeaveData) {
    const { userId, leaveType, startDate, endDate, isHalfDay, reason } = data;

    // Validate dates
    if (new Date(startDate) > new Date(endDate)) {
      throw new Error("Start date cannot be after end date");
    }

    // Prevent leave requests from crossing years.
    const startYear = new Date(startDate).getFullYear();
    const endYear = new Date(endDate).getFullYear();
    if (startYear !== endYear) {
      throw new Error(`Leave requests cannot span across two different years. Please submit one request for ${startYear} and another for ${endYear}.`);
    }

    // Check for overlapping leaves
    const overlappingLeaves = await Leave.find({
      userId,
      status: { $ne: LeaveStatus.REJECTED },
      $or: [
        { startDate: { $lte: new Date(endDate) }, endDate: { $gte: new Date(startDate) } },
      ],
    });

    // Valid overlap: Only allow if BOTH the existing leave AND the new request are half-days on the SAME date.
    // If there's an existing full-day leave, or if we already have 2 half-days, or if the new one is full-day... reject.
    if (overlappingLeaves.length > 0) {
      // Allow overlap ONLY if the new request and the existing request are both single-day half-days on the exact same date
      const isExactSameDay = new Date(startDate).getTime() === new Date(endDate).getTime();
      const hasOneHalfDayOverlap = overlappingLeaves.length === 1 && overlappingLeaves[0].isHalfDay;
      const overlapIsSameDay = hasOneHalfDayOverlap && new Date(overlappingLeaves[0].startDate).getTime() === new Date(overlappingLeaves[0].endDate).getTime();
      
      if (!(isHalfDay && isExactSameDay && hasOneHalfDayOverlap && overlapIsSameDay)) {
        throw new Error("Leave dates conflict with existing approved or pending leaves");
      }
    }

    // Calculate days: Only count actual working days (excluding Sundays and Holidays)
    const days = isHalfDay
      ? 0.5
      : await this.calculateWorkingDays(new Date(startDate), new Date(endDate));

    if (days <= 0 && !isHalfDay) {
        throw new Error("No working days found in the selected leave period (e.g. all days are Sundays or Holidays).");
    }

    // Check leave balance
    const currentYear = getISTDate(new Date()).getFullYear();
    let leaveBalance = await LeaveBalance.findOne({
      userId,
      year: currentYear,
    });

    // Create balance if doesn't exist
    if (!leaveBalance) {
      leaveBalance = await this.createLeaveBalance(userId, currentYear);
    }

    // Check if user has sufficient balance
    const balanceFieldMap: Record<string, string> = {
      SICK: "sickLeave",
      CASUAL: "casualLeave",
      VACATION: "vacationLeave",
    };
    const usedFieldMap: Record<string, string> = {
      SICK: "sickLeaveUsed",
      CASUAL: "casualLeaveUsed",
      VACATION: "vacationLeaveUsed",
    };

    const balanceField = balanceFieldMap[leaveType];
    const usedField = usedFieldMap[leaveType];

    // Account for PENDING leaves in balance check (Prevention of Overdraft)
    const pendingLeaves = await Leave.find({
        userId,
        status: LeaveStatus.PENDING,
        leaveType
    });
    const pendingDays = pendingLeaves.reduce((sum, l) => sum + (l.days || 0), 0);
    
    const availableBalance =
      (leaveBalance as any)[balanceField] - (leaveBalance as any)[usedField] - pendingDays;

    if (leaveType !== "UNPAID" && leaveType !== "WORK_FROM_HOME") {
      if (availableBalance < days) {
        throw new Error(
          `Insufficient ${leaveType.toLowerCase()} leave balance. Available: ${availableBalance} days`
        );
      }
    }

    // Create leave request
    const leave = await Leave.create({
      userId,
      leaveType,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      days,
      isHalfDay: isHalfDay || false,
      reason,
      status: LeaveStatus.PENDING,
    });

    // Populate user
    const populatedLeave = await Leave.findById(leave._id).populate("user", "id fullName email employeeId managerId");

    // Notify manager if exists
    if (populatedLeave && populatedLeave.user?.managerId) {
      const manager = await User.findById(populatedLeave.user.managerId);

      await createNotification({
        userId: populatedLeave.user.managerId.toString(),
        type: NotificationType.LEAVE_REQUEST,
        title: "New Leave Request",
        message: `${populatedLeave.user.fullName} is requesting ${leave.days} days of ${leave.leaveType.toLowerCase()} leave.`,
        link: `/leave`, // Admins/Managers see pending tab
      });

      if (manager && manager.email) {
        await sendEmail({
          to: manager.email,
          subject: "New Leave Request",
          html: `<p>Hello ${manager.fullName},</p>
                   <p><strong>${populatedLeave.user.fullName}</strong> has requested <strong>${leave.days}</strong> days of ${leave.leaveType.toLowerCase()} leave from ${new Date(leave.startDate).toDateString()} to ${new Date(leave.endDate).toDateString()}.</p>
                   <p>Reason: ${leave.reason}</p>
                   <p>Please log in to the CRM to approve or reject the leave.</p>`,
        });
      }
    }

    return populatedLeave;
  },

  /**
   * Get leaves with filters and pagination
   */
  async getLeaves(filters: GetLeavesFilters, requestingUserId: string, userUserRole: UserRole) {
    const {
      userId,
      status,
      leaveType,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = filters;

    const skip = (page - 1) * limit;

    // Build where clause based on role
    const where: any = {};

    // Employees can only see their own leaves
    if (userUserRole === "EMPLOYEE") {
      where.userId = requestingUserId;
    }
    // Managers can see their team's leaves
    else if (userUserRole === "MANAGER") {
        // Expand visibility to anyone in the manager's department
        const manager = await User.findById(requestingUserId).select("department");
        const teamMembers = await User.find({ 
            $or: [
                { managerId: requestingUserId },
                { department: manager?.department }
            ]
        }).select("_id");
        
        where.userId = {
          $in: [requestingUserId, ...teamMembers.map((m) => m._id)],
        };
    }
    // Admins can filter by userId if provided
    else if (userUserRole === "ADMIN" && userId) {
      where.userId = userId;
    }

    // Apply other filters
    if (status) where.status = status;
    if (leaveType) where.leaveType = leaveType;
    if (startDate || endDate) {
      where.$and = [];
      if (startDate) where.$and.push({ endDate: { $gte: new Date(startDate) } });
      if (endDate) where.$and.push({ startDate: { $lte: new Date(endDate) } });
    }

    const [leaves, total] = await Promise.all([
      Leave.find(where)
        .populate("user", "id fullName email employeeId designation department")
        .populate("approver", "id fullName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Leave.countDocuments(where),
    ]);

    return {
      leaves,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get leave by ID
   */
  async getLeaveById(leaveId: string, requestingUserId: string, userUserRole: UserRole) {
    const leave = await Leave.findById(leaveId)
      .populate("user", "id fullName email employeeId designation department")
      .populate("approver", "id fullName");

    if (!leave) {
      throw new Error("Leave not found");
    }

    // Check permissions
    if (userUserRole === "EMPLOYEE" && leave.userId.toString() !== requestingUserId) {
      throw new Error("You can only view your own leaves");
    }

    if (userUserRole === "MANAGER") {
      const user = await User.findById(leave.userId).select("managerId");

      if (
        user?.managerId?.toString() !== requestingUserId &&
        leave.userId.toString() !== requestingUserId
      ) {
        throw new Error("You can only view leaves of your team members");
      }
    }

    return leave;
  },

  /**
   * Update leave status (Approve/Reject)
   */
  async updateLeaveStatus(data: UpdateLeaveStatusData) {
    const { leaveId, status, approvedBy, rejectionReason } = data;

    const leave = await Leave.findById(leaveId);

    if (!leave) {
      throw new Error("Leave not found");
    }

    if (leave.status !== "PENDING") {
      throw new Error("Only pending leaves can be approved or rejected");
    }

    // Security Check: Ensure approver is either an Admin or the employee's direct manager
    const approver = await User.findById(approvedBy);
    if (!approver) throw new Error("Approver user not found");

    if (approver.role !== "ADMIN") {
      const applicant = await User.findById(leave.userId);
      if (applicant?.managerId?.toString() !== approvedBy.toString()) {
        throw new Error("Access Denied: You can only approve/reject leaves for your own team members.");
      }
    }

    // Update leave status
    const updatedLeave = await Leave.findByIdAndUpdate(
      leaveId,
      {
        $set: {
          status,
          approvedBy,
          approvedAt: new Date(),
          rejectionReason: status === "REJECTED" ? rejectionReason : null,
        },
      },
      { new: true }
    )
      .populate("user", "id fullName email employeeId")
      .populate("approver", "id fullName");

    // Update leave balance if approved
    if (status === "APPROVED") {
      const days = leave.days; // Use stored days to ensure consistency

      const currentYear = getISTDate(new Date()).getFullYear();
      const usedFieldMap: Record<string, string> = {
        SICK: "sickLeaveUsed",
        CASUAL: "casualLeaveUsed",
        VACATION: "vacationLeaveUsed",
      };
      const usedField = usedFieldMap[leave.leaveType];

      if (leave.leaveType !== "UNPAID" && leave.leaveType !== "WORK_FROM_HOME") {
        await LeaveBalance.findOneAndUpdate(
          {
            userId: leave.userId,
            year: currentYear,
          },
          {
            $inc: {
              [usedField]: days,
            },
          }
        );
      }

      // Chain Reaction Sync: Update Attendance records for the leave period
      const start = new Date(leave.startDate);
      const end = new Date(leave.endDate);
      const current = new Date(start);

      while (current <= end) {
        const date = getISTStartOfDay(current);
        
        // Update or Create attendance record
        await Attendance.findOneAndUpdate(
          { userId: leave.userId, date: date },
          { 
            $set: { 
              status: leave.isHalfDay ? AttendanceStatus.HALF_DAY : (leave.leaveType === "WORK_FROM_HOME" ? AttendanceStatus.WORK_FROM_HOME : AttendanceStatus.LEAVE),
              isWFH: leave.leaveType === "WORK_FROM_HOME"
            } 
          },
          { upsert: true }
        );
        
        current.setDate(current.getDate() + 1);
      }
    }

    // Notify user about approval/rejection
    if (updatedLeave) {
      const type = status === "APPROVED" ? NotificationType.LEAVE_APPROVED : NotificationType.LEAVE_REJECTED;
      const title = status === "APPROVED" ? "Leave Approved" : "Leave Rejected";
      const message = status === "APPROVED"
        ? `Your leave request for ${updatedLeave.days} days has been approved.`
        : `Your leave request for ${updatedLeave.days} days has been rejected. Reason: ${rejectionReason || "No reason provided"}`;

      await createNotification({
        userId: updatedLeave.userId.toString(),
        type,
        title,
        message,
        link: `/leave`,
      });

      if (updatedLeave.user && (updatedLeave.user as any).email) {
        await sendEmail({
          to: (updatedLeave.user as any).email,
          subject: title,
          html: `<p>Hello ${(updatedLeave.user as any).fullName},</p>
                   <p>${message}</p>`,
        });
      }
    }

    return updatedLeave;
  },

  /**
   * Cancel leave (by user)
   */
  async cancelLeave(leaveId: string, userId: string) {
    const leave = await Leave.findById(leaveId);

    if (!leave) {
      throw new Error("Leave not found");
    }

    if (leave.userId.toString() !== userId) {
      throw new Error("You can only cancel your own leaves");
    }

    if (leave.status === "CANCELLED") {
      throw new Error("Leave is already cancelled");
    }

    if (leave.status === "APPROVED") {
      // If already approved, need to restore balance
      const days = leave.days; // Use stored days

      const currentYear = getISTDate(new Date()).getFullYear();
      const usedFieldMap: Record<string, string> = {
        SICK: "sickLeaveUsed",
        CASUAL: "casualLeaveUsed",
        VACATION: "vacationLeaveUsed",
      };
      const usedField = usedFieldMap[leave.leaveType];

      if (leave.leaveType !== "UNPAID" && leave.leaveType !== "WORK_FROM_HOME") {
        await LeaveBalance.findOneAndUpdate(
          {
            userId: leave.userId,
            year: currentYear,
          },
          {
            $inc: {
              [usedField]: -days,
            },
          }
        );
      }

      // Chain Reaction Sync: Remove or reset Attendance records for the cancelled leave period
      const start = new Date(leave.startDate);
      const end = new Date(leave.endDate);
      const current = new Date(start);

      while (current <= end) {
        const date = getISTStartOfDay(current);
        // Only delete if the status is still LEAVE or HALF_DAY (don't overwrite actual work if they punched in)
        await Attendance.findOneAndDelete({ 
          userId: leave.userId, 
          date: date, 
          status: { $in: [AttendanceStatus.LEAVE, AttendanceStatus.HALF_DAY] } 
        });
        current.setDate(current.getDate() + 1);
      }
    }

    return await Leave.findByIdAndUpdate(
      leaveId,
      { status: "CANCELLED" },
      { new: true }
    );
  },

  /**
   * Get leave balance for a user
   */
  async getLeaveBalance(userId: string, year?: number) {
    const targetYear = year || getISTDate(new Date()).getFullYear();

    let balance: any = await LeaveBalance.findOne({
      userId,
      year: targetYear,
    });

    // Create balance if doesn't exist
    if (!balance) {
      balance = await this.createLeaveBalance(userId, targetYear);
    }

    // Calculate available balances
    return {
      ...balance.toObject(),
      sickLeaveAvailable: (balance.sickLeave || 0) - (balance.sickLeaveUsed || 0),
      casualLeaveAvailable: (balance.casualLeave || 0) - (balance.casualLeaveUsed || 0),
      vacationLeaveAvailable:
        (balance.vacationLeave || 0) - (balance.vacationLeaveUsed || 0),
    };
  },

  /**
   * Get leave statistics
   */
  async getLeaveStats(userId?: string) {
    const where: any = userId ? { userId } : {};

    const [
      totalLeaves,
      pendingLeaves,
      approvedLeaves,
      rejectedLeaves,
      upcomingLeaves,
    ] = await Promise.all([
      Leave.countDocuments(where),
      Leave.countDocuments({ ...where, status: "PENDING" }),
      Leave.countDocuments({ ...where, status: "APPROVED" }),
      Leave.countDocuments({ ...where, status: "REJECTED" }),
      Leave.countDocuments({
        ...where,
        status: "APPROVED",
        startDate: { $gte: getISTStartOfDay(new Date()) },
      }),
    ]);

    return {
      totalLeaves,
      pendingLeaves,
      approvedLeaves,
      rejectedLeaves,
      upcomingLeaves,
    };
  },
};
