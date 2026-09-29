
import Attendance, { AttendanceStatus } from "../models/Attendance";
import Leave, { LeaveStatus } from "../models/Leave";
import Task, { TaskStatus } from "../models/Task";
import Payroll from "../models/Payroll";
import User from "../models/User";
import Project, { ProjectStatus } from "../models/Project";
import ProjectMember from "../models/ProjectMember";
import mongoose from "mongoose";
import Setting from "../models/Setting";
import { getISTStartOfDay, getISTEndOfDay, getISTDate } from "../utils/date.utils";

/**
 * Reports Service
 * Handles analytics and reporting for all modules
 */
class ReportsService {
  /**
   * Default holidays for 2026 (company-specific calendar).
   * These are used as fallback if no COMPANY_HOLIDAYS setting exists in the DB.
   * To update for a new year, go to Settings → Holidays tab in the admin panel.
   */
  private static readonly DEFAULT_HOLIDAYS: string[] = [
    "2026-01-01", // New Year
    "2026-01-26", // Republic Day
    "2026-02-19", // Shivaji Maharaj Jayanti
    "2026-03-03", // Holika Dahan
    "2026-03-04", // Holi
    "2026-03-19", // Gudi Padwa
    "2026-05-01", // Maharashtra Din
    "2026-08-15", // Independence Day
    "2026-09-14", // Ganesh Chaturthi
    "2026-10-02", // Gandhi Jayanti
    "2026-10-20", // Dasara
    "2026-11-08", // Diwali Amavasya
    "2026-11-10", // Diwali (Bail Pratipada)
    "2026-11-11", // Diwali (Bhaubeej)
    "2026-12-25", // Christmas
  ];

  /**
   * Cache for holidays loaded from DB (refreshed per report run, not per day check)
   */
  private _holidaySet: Set<string> | null = null;

  /**
   * Load holidays from the database. Falls back to DEFAULT_HOLIDAYS if not configured.
   * Stored in Setting as key="COMPANY_HOLIDAYS", value=JSON array.
   * Each entry is either:
   *   - "YYYY-MM-DD"             (old format, plain date)
   *   - "YYYY-MM-DD|Holiday Name" (new format, saved by the Settings UI)
   * The backend only needs the date portion for the holiday check.
   */
  private async loadHolidays(): Promise<Set<string>> {
    if (this._holidaySet) return this._holidaySet;
    try {
      const setting = await Setting.findOne({ key: "COMPANY_HOLIDAYS" });
      if (setting?.value) {
        const parsed: string[] = JSON.parse(setting.value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Extract the date part only (before the "|" separator if present)
          const dates = parsed.map((entry) => entry.split("|")[0].trim());
          this._holidaySet = new Set(dates);
          return this._holidaySet;
        }
      }
    } catch (err) {
      console.warn("Could not load COMPANY_HOLIDAYS from DB, using defaults:", err);
    }
    this._holidaySet = new Set(ReportsService.DEFAULT_HOLIDAYS);
    return this._holidaySet;
  }

  /**
   * Reset the holiday cache (call this after updating holidays via settings)
   */
  public resetHolidayCache(): void {
    this._holidaySet = null;
  }

  /**
   * Check if a date is a company holiday.
   * Fixed: Removed unnecessary async/Promise — this is a pure synchronous Set lookup.
   * Previously creating 300+ microtask Promises for a monthly report.
   */
  private isHoliday(date: Date, holidaySet: Set<string>): boolean {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return holidaySet.has(`${y}-${m}-${d}`);
  }

  /**
   * Get Attendance Report
   */
  async getAttendanceReport(
    startDateInput: Date,
    endDateInput: Date,
    departmentFilter?: string,
    userUserRole?: string,
    userId?: string
  ) {
    const startDate = getISTStartOfDay(startDateInput);
    const endDate = getISTEndOfDay(endDateInput);

    // Load holidays from DB (once per report run) + get shift/grace settings
    const [shiftStartSetting, gracePeriodSetting, , holidaySet] = await Promise.all([
      Setting.findOne({ key: "SHIFT_START_TIME" }),
      Setting.findOne({ key: "gracePeriod" }),
      Setting.findOne({ key: "dailyHours" }),
      this.loadHolidays(),
    ]);

    const shiftStartTimeStr = shiftStartSetting?.value || "10:00";
    const gracePeriodMinutes = parseInt(gracePeriodSetting?.value || "15");
    const standardDailyHours = 9; // Forced to 9 as per company policy (Fixed from 8)

    const role = userUserRole ? userUserRole.toString().trim().toUpperCase() : "";

    // 1. Fetch relevant users first
    const userQuery: any = { isActive: true };
    if (role === "EMPLOYEE") {
      userQuery._id = new mongoose.Types.ObjectId(userId);
    } else if (userId && userId !== "all") {
      userQuery._id = new mongoose.Types.ObjectId(userId);
    } else if (departmentFilter && departmentFilter !== "all") {
      userQuery.department = departmentFilter;
    }
    const allRelevantUsers = await User.find(userQuery).select("id fullName employeeId department designation employeeType joinDate");
    const userIds = allRelevantUsers.map(u => u._id);

    // 2. Fetch data in bulk
    const queryStartDate = startDate;
    const queryEndDate = endDate;

    const [attendances, approvedLeaves] = await Promise.all([
      Attendance.find({
        userId: { $in: userIds },
        date: { $gte: queryStartDate, $lte: queryEndDate }
      }).populate("user", "id fullName employeeId department designation role"),
      Leave.find({
        userId: { $in: userIds },
        status: LeaveStatus.APPROVED,
        $or: [
          { startDate: { $gte: startDate, $lte: endDate } },
          { endDate: { $gte: startDate, $lte: endDate } },
          { startDate: { $lte: startDate }, endDate: { $gte: endDate } },
        ],
      })
    ]);

    // Optimize lookups with Maps
    const attendanceMap = new Map<string, any>();
    attendances.forEach(a => {
      const key = `${a.userId.toString()}_${getISTDate(new Date(a.date)).toDateString()}`;
      attendanceMap.set(key, a);
    });

    const leaveMap = new Map<string, any[]>();
    approvedLeaves.forEach(l => {
      const uid = l.userId.toString();
      if (!leaveMap.has(uid)) leaveMap.set(uid, []);
      leaveMap.get(uid)!.push(l);
    });

    // 3. Generate comprehensive daily records
    const finalDailyRecords: any[] = [];
    const daysInRange: Date[] = [];
    let curr = new Date(startDate);
    while (curr <= endDate) {
      daysInRange.push(new Date(curr));
      curr.setDate(curr.getDate() + 1);
    }

    const [shiftH, shiftM] = shiftStartTimeStr.split(":").map(Number);

    for (const day of daysInRange) {
      const istDay = getISTDate(day);
      const dayDateString = istDay.toDateString();
      const isWeekend = istDay.getDay() === 0; // Sunday=0
      const holiday = this.isHoliday(day, holidaySet); // Fixed: no longer async

      for (const user of allRelevantUsers) {
        const uidStr = user._id.toString();
        // Skip if user joined after this day
        if (user.joinDate && new Date(user.joinDate) > day) continue;

        const key = `${uidStr}_${dayDateString}`;
        const attendance = attendanceMap.get(key);

        if (attendance) {
          const record = attendance.toObject();
          
          // CHECK FOR LEAVE OVERRIDE (e.g. HALF DAY or accidental punch on leave)
          const userLeaves = leaveMap.get(uidStr) || [];
          const leave = userLeaves.find(l => {
            const lStart = getISTStartOfDay(new Date(l.startDate));
            const lEnd = getISTEndOfDay(new Date(l.endDate));
            return day >= lStart && day <= lEnd;
          });
          
          let status: any = record.status;
          
          // Historical Integrity. Force Saturdays to be work-days in display,
          // even if old records in the DB are still marked as 'WEEKEND'.
          const realDayOfWeek = getISTDate(new Date(record.date)).getDay();
          if (status === AttendanceStatus.WEEKEND && realDayOfWeek !== 0) {
            status = record.isLate ? AttendanceStatus.PRESENT : (record.punchInTime ? AttendanceStatus.PRESENT : AttendanceStatus.ABSENT);
          }

          if (leave) {
            status = leave.isHalfDay ? `HALF_DAY (${leave.leaveType})` : leave.leaveType;
          } else if (isWeekend && !record.punchInTime) {
            // Only mark as WEEKEND if they didn't work. If they worked, keep PRESENT/OT status
            status = AttendanceStatus.WEEKEND;
          } else if (holiday && !record.punchInTime) {
            status = AttendanceStatus.HOLIDAY;
          }

          // ALWAYS RECALCULATE LATE FROM CURRENT SETTINGS (avoids stale values from old shift times)
          let isLate = false;
          let lateMinutes = 0;
          let overtimeHours = 0;

          if (record.punchInTime && !isWeekend) {
            const punchIn = getISTDate(new Date(record.punchInTime));
            // IST time
            const punchInMinutes = punchIn.getHours() * 60 + punchIn.getMinutes();
            const shiftStartMinutes = (shiftH * 60) + shiftM;
            const lateThreshold = shiftStartMinutes + gracePeriodMinutes;

            if (punchInMinutes > lateThreshold) {
              isLate = true;
              lateMinutes = punchInMinutes - shiftStartMinutes;
            }
          }

          // CALCULATE WORKING HOURS (FORCE RECALCULATION to apply break policy)
          let workingHours = 0;
          if (record.punchInTime && record.punchOutTime) {
            const diffMs = new Date(record.punchOutTime).getTime() - new Date(record.punchInTime).getTime();
            const totalDurationHrs = diffMs / 3600000;
            const manualBreakMins = record.breakDuration || 0;
            
            if (manualBreakMins === 0 && totalDurationHrs > 5) {
              workingHours = Math.max(0, (diffMs / 60000 - 60) / 60); // Auto 1h break
            } else {
              workingHours = (diffMs / 3600000) - (manualBreakMins / 60);
            }
          } else if (record.punchInTime && !record.punchOutTime) {
            const now = new Date();
            if (dayDateString === getISTDate(now).toDateString()) {
              const diffMinutes = (now.getTime() - new Date(record.punchInTime).getTime()) / 60000;
              
              // Handle current active break if any
              let activeBreakMinutes = 0;
              if (record.breaks) {
                const activeBreak = record.breaks.find((b: any) => !b.endTime);
                if (activeBreak) {
                  activeBreakMinutes = (now.getTime() - new Date(activeBreak.startTime).getTime()) / 60000;
                }
              }
              
              const currentManualBreakMins = (record.breakDuration || 0) + activeBreakMinutes;
              if (currentManualBreakMins === 0 && diffMinutes > 300) { // 300 mins = 5 hours
                workingHours = Math.max(0, (diffMinutes - 60) / 60);
              } else {
                workingHours = Math.max(0, (diffMinutes - currentManualBreakMins) / 60);
              }
            }
          }

          if (workingHours < 0) workingHours = 0;

          // Align with Payroll Service logic: 
          // If explicitly marked as OT, entire session is OT.
          // Otherwise, only hours exceeding standardDailyHours are OT.
          if (record.isOvertime) {
            overtimeHours = workingHours;
          } else if (workingHours > standardDailyHours) {
            overtimeHours = workingHours - standardDailyHours;
          };

          finalDailyRecords.push({
            ...record,
            isHoliday: holiday,
            isExtraDay: (status === "PRESENT" || status === "WORK_FROM_HOME" || (workingHours || 0) > 0) && (isWeekend || holiday),
            user,
            status: status as any,
            workingHours: parseFloat(workingHours.toFixed(2)),
            isLate,
            lateMinutes,
            overtimeHours
          });
        } else {
          // Check for approved leave
          const userLeaves = leaveMap.get(uidStr) || [];
          const leave = userLeaves.find(l => {
            const lStart = getISTStartOfDay(new Date(l.startDate));
            const lEnd = getISTEndOfDay(new Date(l.endDate));
            return day >= lStart && day <= lEnd;
          });
          
          if (leave) {
            let status: string = leave.leaveType;
            if (leave.isHalfDay) {
              status = `HALF_DAY (${leave.leaveType})`;
            }

            finalDailyRecords.push({
              _id: `vleave_${uidStr}_${day.getTime()}`,
              isHoliday: holiday,
              userId: user._id,
              user,
              date: day,
              status: status as any, // Cast to any since we're using dynamic strings for the report
              workingHours: 0
            });
          } else {
            let status = AttendanceStatus.ABSENT;
            let idPrefix = "vabsent";

            if (isWeekend) {
              status = AttendanceStatus.WEEKEND;
              idPrefix = "vweekend";
            } else if (holiday) {
              status = AttendanceStatus.HOLIDAY;
              idPrefix = "vholiday";
            }

            finalDailyRecords.push({
              _id: `${idPrefix}_${uidStr}_${day.getTime()}`,
              isHoliday: holiday,
              userId: user._id,
              user,
              date: day,
              status,
              workingHours: 0
            });
          }
        }
      }
    }


    // Sort by date (desc) then name
    finalDailyRecords.sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (dateB !== dateA) return dateB - dateA;
      return a.user.fullName.localeCompare(b.user.fullName);
    });

    // ── Build per-employee summaries ──────────────────────────────────────
    const employeeMap = new Map<string, any>();
    for (const rec of finalDailyRecords) {
      const uid = rec.userId.toString();
      if (!employeeMap.has(uid)) {
        employeeMap.set(uid, {
          userId: uid,
          user: rec.user,
          presentDays: 0,
          absentDays: 0,
          extraDays: 0,
          halfDaysTaken: 0,
          leaveDays: 0,
          lateDays: 0,
          totalWorkingHours: 0,
          dailyWorkingHours: [],
          appliedLeaves: 0,
          approvedLeaves: 0,
          pendingLeaves: 0,
        });
      }
      const emp = employeeMap.get(uid);
      const status = rec.status as string;
      if (status === "PRESENT" || status === "WORK_FROM_HOME") emp.presentDays++;
      else if (status === "ABSENT") emp.absentDays++;
      else if (status.startsWith("HALF_DAY")) emp.halfDaysTaken++;
      else if (["LEAVE", "SICK", "CASUAL", "VACATION", "UNPAID"].some(s => status.includes(s))) emp.leaveDays++;

      if (rec.isLate) emp.lateDays++;
      
      const realDay = new Date(rec.date).getDay();
      const isExtraDay = (status === "PRESENT" || status === "WORK_FROM_HOME" || (rec.workingHours || 0) > 0) && 
                         (realDay === 0 || rec.isHoliday);

      if (isExtraDay) {
        emp.extraDays++;
      }

      emp.totalWorkingHours += rec.workingHours || 0;

      emp.dailyWorkingHours.push({
        date: rec.date,
        isExtraDay: isExtraDay,
        punchIn: rec.punchInTime || null,
        punchOut: rec.punchOutTime || null,
        workingHours: parseFloat((rec.workingHours || 0).toFixed(2)),
        status: rec.status,
        isLate: rec.isLate,
        lateMinutes: rec.lateMinutes,
      });
    }

    // Fetch ALL leaves for stats (not just approved)
    const allLeavesForStats = await Leave.find({
      userId: { $in: userIds },
      $or: [
        { startDate: { $gte: startDate, $lte: endDate } },
        { endDate: { $gte: startDate, $lte: endDate } },
        { startDate: { $lte: startDate }, endDate: { $gte: endDate } },
      ]
    });

    for (const leave of allLeavesForStats) {
      const uid = leave.userId.toString();
      if (employeeMap.has(uid)) {
        const emp = employeeMap.get(uid);
        emp.appliedLeaves++;
        if (leave.status === "APPROVED") emp.approvedLeaves++;
        if (leave.status === "PENDING") emp.pendingLeaves++;
      }
    }

    const employeeSummaries = Array.from(employeeMap.values()).map(emp => {
      const latePenaltyDays = Math.floor(emp.lateDays / 3) * 0.5;
      return {
        ...emp,
        latePenaltyDays,
        avgDailyWorkingHours: emp.presentDays > 0 ? parseFloat((emp.totalWorkingHours / emp.presentDays).toFixed(2)) : 0,
        totalWorkingHours: parseFloat(emp.totalWorkingHours.toFixed(2)),
      };
    });

    // ── Overall statistics ────────────────────────────────────────────────
    const totalManDays = finalDailyRecords.filter(r =>
      r.status !== AttendanceStatus.WEEKEND &&
      r.status !== AttendanceStatus.HOLIDAY
    ).length;
    const presentDays = finalDailyRecords.filter(r => r.status === "PRESENT" || r.status === "WORK_FROM_HOME").length;
    const absentDays = finalDailyRecords.filter(r => r.status === "ABSENT").length;
    const leaveDays = finalDailyRecords.filter(r => {
      const s = r.status as string;
      return ["LEAVE", "SICK", "CASUAL", "VACATION", "UNPAID"].some(l => s.includes(l)) && !s.startsWith("HALF_DAY");
    }).length;
    const halfDays = finalDailyRecords.filter(r => (r.status as string).startsWith("HALF_DAY")).length;
    const lateDays = finalDailyRecords.filter(r => r.isLate).length;
    const totalWorkingHours = finalDailyRecords.reduce((sum, r) => sum + (r.workingHours || 0), 0);
    const avgWorkingHours = presentDays > 0 ? totalWorkingHours / presentDays : 0;
    const totalOvertimeHours = finalDailyRecords.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
    const extraDays = finalDailyRecords.filter(r => 
      ((r.status === "PRESENT" || r.status === "WORK_FROM_HOME" || (r.workingHours || 0) > 0) && 
      (new Date(r.date).getDay() === 0 || (r as any).isHoliday))
    ).length;

    return {
      attendances: finalDailyRecords,
      employeeSummaries,
      statistics: {
        totalDays: totalManDays,
        presentDays,
        absentDays,
        extraDays,
        leaveDays,
        halfDays,
        lateDays,
        latePenaltyDays: employeeSummaries.reduce((sum, e) => sum + e.latePenaltyDays, 0),
        approvedLeaves: allLeavesForStats.filter(l => l.status === "APPROVED").length,
        totalWorkingHours: parseFloat(totalWorkingHours.toFixed(2)),
        avgWorkingHours: parseFloat(avgWorkingHours.toFixed(2)),
        totalOvertimeHours: parseFloat(totalOvertimeHours.toFixed(2)),
        attendanceRate: totalManDays > 0 ? (presentDays / totalManDays) * 100 : 0,
      },
    };
  }

  /**
   * Get Task Completion Report
   */
  async getTaskCompletionReport(
    startDateInput: Date,
    endDateInput: Date,
    projectId?: string,
    userUserRole?: string,
    userId?: string
  ) {
    const role = userUserRole ? userUserRole.toString().trim().toUpperCase() : "";
    const startDate = new Date(startDateInput);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(endDateInput);
    endDate.setHours(23, 59, 59, 999);

    const queryStartDate = startDate;
    const queryEndDate = endDate;

    const where: any = {
      createdAt: {
        $gte: queryStartDate,
        $lte: queryEndDate,
      },
    };

    if (role === "EMPLOYEE") {
      where.assignedTo = new mongoose.Types.ObjectId(userId);
      if (projectId && projectId !== "all") {
        where.projectId = new mongoose.Types.ObjectId(projectId);
      }
    } else {
      if (userId && userId !== "all") {
        where.assignedTo = new mongoose.Types.ObjectId(userId);
      }
      if (projectId && projectId !== "all") {
        where.projectId = new mongoose.Types.ObjectId(projectId);
      }
    }

    const tasks = await Task.find(where)
      .populate("assignedTo", "id fullName employeeId") // Assuming populated field name in schema might be 'assignedTo' ref 'User', but let's check schema. Task.ts schema has 'assignedTo'. Populate will fill it.
      .populate("projectId", "id name code"); // Schema has 'projectId' ref 'Project'.

    // Statistics
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === TaskStatus.COMPLETED).length;
    const inProgressTasks = tasks.filter((t) => t.status === TaskStatus.IN_PROGRESS).length;
    const todoTasks = tasks.filter((t) => t.status === TaskStatus.TO_DO).length;
    const rejectedTasks = tasks.filter((t) => t.status === TaskStatus.REJECTED).length;

    const totalEstimatedHours = tasks.reduce((sum, t) => sum + (t.estimatedHours || 0), 0);
    const totalActualHours = tasks.reduce((sum, t) => sum + (t.actualHours || 0), 0);

    return {
      tasks,
      statistics: {
        totalTasks,
        completedTasks,
        inProgressTasks,
        todoTasks,
        rejectedTasks,
        completionRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
        totalEstimatedHours,
        totalActualHours,
        efficiency:
          totalActualHours > 0 
            ? Math.min(100, (totalEstimatedHours / totalActualHours) * 100) 
            : 0,
      },
    };
  }

  /**
   * Get Leave Report
   */
  async getLeaveReport(
    startDateInput: Date,
    endDateInput: Date,
    departmentFilter?: string,
    userUserRole?: string,
    userId?: string
  ) {
    const role = userUserRole ? userUserRole.toString().trim().toUpperCase() : "";
    const startDate = new Date(startDateInput);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(endDateInput);
    endDate.setHours(23, 59, 59, 999);

    const queryStartDate = startDate;
    const queryEndDate = endDate;

    // Fixed: Use a proper 3-clause OR query to catch cross-month leaves.
    // The old query (startDate in range) missed leaves that started before the
    // report period but ended within it (e.g., started March 28, ended April 5).
    const where: any = {
      $or: [
        { startDate: { $gte: queryStartDate, $lte: queryEndDate } },
        { endDate: { $gte: queryStartDate, $lte: queryEndDate } },
        { startDate: { $lte: queryStartDate }, endDate: { $gte: queryEndDate } },
      ],
    };

    if (role === "EMPLOYEE") {
      where.userId = new mongoose.Types.ObjectId(userId);
    } else if (userId && userId !== "all") {
      where.userId = new mongoose.Types.ObjectId(userId);
    } else if (departmentFilter && departmentFilter !== "all") {
      const users = await User.find({ department: departmentFilter }).select("_id");
      where.userId = { $in: users.map(u => u._id) };
    }

    const leaves = await Leave.find(where)
      .populate("user", "id fullName email employeeId department")
      .sort({ startDate: -1 });

    const totalLeaves = leaves.length;
    const approvedLeaves = leaves.filter((l) => l.status === LeaveStatus.APPROVED).length;
    const pendingLeaves = leaves.filter((l) => l.status === LeaveStatus.PENDING).length;
    const rejectedLeaves = leaves.filter((l) => l.status === LeaveStatus.REJECTED).length;

    return {
      leaves,
      statistics: {
        totalLeaves,
        approvedLeaves,
        pendingLeaves,
        rejectedLeaves,
        approvalRate: totalLeaves > 0 ? (approvedLeaves / totalLeaves) * 100 : 0,
      },
    };
  }

  /**
   * Get Payroll Report
   */
  async getPayrollReport(
    month: number,
    year: number,
    departmentFilter?: string,
    userId?: string
  ) {
    const where: any = {
      month,
      year,
    };

    if (userId && userId !== "all") {
      where.userId = new mongoose.Types.ObjectId(userId);
    } else if (departmentFilter && departmentFilter !== "all") {
      const users = await User.find({ department: departmentFilter }).select("_id");
      where.userId = { $in: users.map(u => u._id) };
    }

    // Support filtering by specific userId if passed as departmentFilter for payroll too, 
    // but better to add a separate param if needed. For now let's stick to department.

    const payrolls = await Payroll.find(where)
      .populate("user", "id fullName employeeId department designation")
      .sort({ netPay: -1 });

    const totalEmployees = payrolls.length;
    const totalGrossPay = payrolls.reduce((sum, p) => sum + p.grossPay, 0);
    const totalNetPay = payrolls.reduce((sum, p) => sum + p.netPay, 0);
    const totalDeductions = payrolls.reduce((sum, p) => sum + p.deductions, 0);
    const totalOvertimePay = payrolls.reduce((sum, p) => sum + p.overtimePay, 0);
    const totalWorkingHours = payrolls.reduce((sum, p) => sum + p.totalWorkingHours, 0);

    const avgGrossPay = totalEmployees > 0 ? totalGrossPay / totalEmployees : 0;
    const avgNetPay = totalEmployees > 0 ? totalNetPay / totalEmployees : 0;

    return {
      payrolls,
      statistics: {
        totalEmployees,
        totalGrossPay,
        totalNetPay,
        totalDeductions,
        totalOvertimePay,
        totalWorkingHours,
        avgGrossPay,
        avgNetPay,
      },
    };
  }

  /**
   * Get Employee Productivity Report
   */
  async getEmployeeProductivityReport(
    employeeId: string,
    startDate: Date,
    endDate: Date
  ) {
    // Get user
    const user = await User.findById(employeeId).select(
      "id fullName employeeId designation department employeeType"
    );

    if (!user) {
      throw new Error("Employee not found");
    }

    // Fixed: Cast employeeId to ObjectId to reliably match against ObjectId fields in MongoDB
    const empObjectId = new mongoose.Types.ObjectId(employeeId);

    const attendances = await Attendance.find({
      userId: empObjectId,
      date: { $gte: startDate, $lte: endDate },
    });

    // Get tasks — assignedTo is an array of ObjectIds, use empObjectId for reliable matching
    const tasks = await Task.find({
      assignedTo: empObjectId,
      createdAt: { $gte: startDate, $lte: endDate },
    });

    // Get leaves
    const leaves = await Leave.find({
      userId: empObjectId,
      startDate: { $gte: startDate, $lte: endDate },
    });

    // Calculate metrics
    const totalWorkingDays = attendances.filter(
      (a) => a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.WORK_FROM_HOME
    ).length;
    const totalWorkingHours = attendances.reduce((sum, a) => sum + (a.workingHours || 0), 0);
    const avgDailyHours = totalWorkingDays > 0 ? totalWorkingHours / totalWorkingDays : 0;

    const completedTasks = tasks.filter((t) => t.status === TaskStatus.COMPLETED).length;
    const totalTasks = tasks.length;
    const taskCompletionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

    const approvedLeaves = leaves.filter((l) => l.status === LeaveStatus.APPROVED).length;

    return {
      user,
      metrics: {
        totalWorkingDays,
        totalWorkingHours,
        avgDailyHours,
        totalTasks,
        completedTasks,
        taskCompletionRate,
        approvedLeaves,
      },
      attendances,
      tasks,
      leaves,
    };
  }

  /**
   * Get Dashboard Analytics
   */
  async getDashboardAnalytics(userId?: string, userRole?: string) {
    const today = new Date();
    const userObjectId = userId && mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null;

    // Default counts
    let activeEmployees = 0;
    let todayAttendance = 0;
    let activeProjects = 0;
    let pendingTasks = 0;
    let pendingLeaves = 0;
    let monthlyPayrollValue = 0;
    let todayLateMarks = 0;

    // Standardize role for comparison (prevents case-sensitivity bugs)
    const role = userRole ? userRole.toString().trim().toUpperCase() : "";

    // Management Analytics (Admin/Manager see global stats)
    if (role === "ADMIN" || role === "MANAGER") {
      activeEmployees = await User.countDocuments({ isActive: true });
      
      // Safety Fallback: If 0 is returned but an Admin is logged in, show at least 1
      if (activeEmployees === 0) activeEmployees = 1;

      // Fixed: Use IST-aware date boundaries for "today" queries instead of server local time
      const startOfToday = getISTStartOfDay(today);
      const endOfToday = getISTEndOfDay(today);

      const queryStartDate = startOfToday;
      const queryEndDate = endOfToday;

      todayAttendance = await Attendance.countDocuments({
        date: {
          $gte: queryStartDate,
          $lte: queryEndDate,
        },
        status: { $in: [AttendanceStatus.PRESENT, AttendanceStatus.WORK_FROM_HOME, AttendanceStatus.HALF_DAY] },
      });
      activeProjects = await Project.countDocuments({ 
        status: { $in: [ProjectStatus.PLANNING, ProjectStatus.IN_PROGRESS, ProjectStatus.ON_HOLD] }
      });
      pendingTasks = await Task.countDocuments({
        status: { $in: [TaskStatus.TO_DO, TaskStatus.IN_PROGRESS, TaskStatus.UNDER_REVIEW] },
      });
      pendingLeaves = await Leave.countDocuments({ status: LeaveStatus.PENDING });
      
      todayLateMarks = await Attendance.countDocuments({
        date: {
          $gte: queryStartDate,
          $lte: queryEndDate,
        },
        isLate: true
      });

      const monthlyPayroll = await Payroll.aggregate([
        {
          $match: {
            month: today.getMonth() + 1,
            year: today.getFullYear(),
          },
        },
        { $group: { _id: null, totalNetPay: { $sum: "$netPay" } } },
      ]);
      monthlyPayrollValue = monthlyPayroll[0]?.totalNetPay || 0;
    } else {
      // Employee Analytics (User sees their own stats)
      // Active projects assigned to them
      activeEmployees = 1; // For sizing consistency in UI or ignored
      if (userObjectId) {
        const memberships = await ProjectMember.find({ userId: userObjectId }).select("projectId");
        const pIds = memberships.map((m) => m.projectId);
        activeProjects = await Project.countDocuments({
          _id: { $in: pIds },
          status: { $in: [ProjectStatus.PLANNING, ProjectStatus.IN_PROGRESS, ProjectStatus.ON_HOLD] }
        });

        // Tasks assigned to them
        pendingTasks = await Task.countDocuments({
          assignedTo: { $in: [userObjectId] },
          status: { $in: [TaskStatus.TO_DO, TaskStatus.IN_PROGRESS, TaskStatus.UNDER_REVIEW] },
        });

        // Their pending leaves
        pendingLeaves = await Leave.countDocuments({
          userId: userObjectId,
          status: LeaveStatus.PENDING
        });

        // Today's attendance for employee
        // Fixed: Use IST-aware date boundaries for employee today lookup
        const startOfToday = getISTStartOfDay(today);
        const endOfToday = getISTEndOfDay(today);

        const queryStartDate = startOfToday;
        const queryEndDate = endOfToday;

        const attendance = await Attendance.findOne({
          userId: userObjectId,
          date: { $gte: queryStartDate, $lte: queryEndDate }
        });
        todayAttendance = attendance ? 1 : 0;
        todayLateMarks = (attendance?.isLate) ? 1 : 0;
      }
    }

    // Calculate Percentages for Team Performance (for Admin/Manager)
    let attendanceRate = 0;
    let taskCompletionRate = 0;

    if (userRole === "ADMIN" || userRole === "MANAGER") {
      if (activeEmployees > 0) {
        attendanceRate = Math.round((todayAttendance / activeEmployees) * 100);
      }

      // Performance optimization: Only count completion rate for tasks from the last 30 days
      const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
      const totalTasks = await Task.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });
      const completedTasks = await Task.countDocuments({ 
        createdAt: { $gte: thirtyDaysAgo },
        status: TaskStatus.COMPLETED 
      });
      
      if (totalTasks > 0) {
        taskCompletionRate = Math.round((completedTasks / totalTasks) * 100);
      }
    } else if (userObjectId) {
      // Individual rates for employees - last 30 days
      const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
      const myTotalTasks = await Task.countDocuments({ 
        assignedTo: { $in: [userObjectId] },
        createdAt: { $gte: thirtyDaysAgo }
      });
      const myCompletedTasks = await Task.countDocuments({
        assignedTo: { $in: [userObjectId] },
        status: TaskStatus.COMPLETED,
        createdAt: { $gte: thirtyDaysAgo }
      });
      if (myTotalTasks > 0) {
        taskCompletionRate = Math.round((myCompletedTasks / myTotalTasks) * 100);
      }
      attendanceRate = todayAttendance ? 100 : 0;
    }

    return {
      activeEmployees,
      todayAttendance,
      activeProjects,
      pendingTasks,
      pendingLeaves,
      monthlyPayroll: monthlyPayrollValue,
      todayLateMarks, // Include todayLateMarks in the returned object
      performance: {
        attendanceRate,
        taskCompletionRate
      }
    };

  }
}

export default new ReportsService();
