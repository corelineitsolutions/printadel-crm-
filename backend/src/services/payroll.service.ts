import mongoose from "mongoose";
import Payroll, { PayrollStatus } from "../models/Payroll";
import User, { UserRole } from "../models/User";
import Attendance, { AttendanceStatus } from "../models/Attendance";
import Leave, { LeaveStatus, LeaveType } from "../models/Leave";
import Setting from "../models/Setting";
import { settingService } from "./setting.service";
import { createNotification } from "./notification.service";
import { NotificationType } from "../models/Notification";
import { getISTStartOfDay, getISTEndOfDay, getISTDate } from "../utils/date.utils";
import { loadCompanyHolidays, isCompanyHoliday } from "../utils/holiday.utils";

/**
 * Payroll Service
 * Handles payroll calculation, processing, and payslip generation
 */

// Helper: Format Date to YYYY-MM-DD in IST
function toISTDateKey(date: Date): string {
  const ist = getISTDate(new Date(date));
  const y = ist.getFullYear();
  const m = String(ist.getMonth() + 1).padStart(2, "0");
  const d = String(ist.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Calculate Payroll for a User for a Specific Month
 */
export async function calculatePayroll(
  userId: string,
  month: number,
  year: number
) {
  // 1. Get user details including monthlySalary, hourlyRate, overtimeMultiplier, employeeType, joinDate
  const user = await User.findById(userId).select(
    "id fullName hourlyRate monthlySalary overtimeMultiplier employeeType employeeId designation department joinDate"
  );

  if (!user) {
    throw new Error("User not found");
  }

  const employeeType = user.employeeType || "Full-time";

  // Get settings for fallback calculation if needed
  const defaultHourlyRateStr = await settingService.getSetting("defaultHourlyRate");
  const defaultHourlyRate = defaultHourlyRateStr ? parseFloat(defaultHourlyRateStr) : 25;

  // Monthly Salary: prefer user.monthlySalary, fallback to hourlyRate * 270 (30 days * 9 hrs)
  const monthlySalary = (user.monthlySalary && user.monthlySalary > 0)
    ? user.monthlySalary
    : ((user.hourlyRate || defaultHourlyRate) > 0 ? (user.hourlyRate || defaultHourlyRate) * 270 : 0);

  if (monthlySalary <= 0 && (!user.hourlyRate || user.hourlyRate <= 0)) {
    throw new Error("User monthly salary or hourly rate is not configured and no system default available");
  }

  // Currency rounding helper
  const round = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

  // Daily Salary = Monthly Salary / 30 (Always fixed divisor 30 as per company policy)
  const dailySalary = round(monthlySalary / 30);
  const effectiveHourlyRate = round(user.hourlyRate || (monthlySalary / 270) || defaultHourlyRate);
  const overtimeMultiplier = user.overtimeMultiplier || 1.5;
  const overtimeRate = round(effectiveHourlyRate * overtimeMultiplier);

  // 2. Date range: 1st of month to last day of selected month in IST
  const daysInMonth = new Date(year, month, 0).getDate();
  const startDate = getISTStartOfDay(new Date(year, month - 1, 1));
  const endDate = getISTEndOfDay(new Date(year, month - 1, daysInMonth));

  // Fetch attendances for this user in the selected month
  const attendances = await Attendance.find({
    userId: new mongoose.Types.ObjectId(userId),
    date: {
      $gte: startDate,
      $lte: endDate,
    },
  });

  // Map attendances by IST date string YYYY-MM-DD
  const attendanceMap = new Map<string, any>();
  attendances.forEach((att) => {
    const key = toISTDateKey(att.date);
    attendanceMap.set(key, att);
  });

  // Fetch leaves covering the month (both approved and unapproved/pending)
  const employeeLeaves = await Leave.find({
    userId: new mongoose.Types.ObjectId(userId),
    status: { $in: [LeaveStatus.APPROVED, LeaveStatus.PENDING] },
    $or: [
      { startDate: { $lte: endDate }, endDate: { $gte: startDate } },
    ],
  });

  // Map leaves by IST date string
  const leaveMap = new Map<string, any>();
  employeeLeaves.forEach((l) => {
    const lStart = getISTStartOfDay(new Date(l.startDate));
    const lEnd = getISTEndOfDay(new Date(l.endDate));
    const cur = new Date(lStart);
    while (cur <= lEnd) {
      if (cur >= startDate && cur <= endDate) {
        leaveMap.set(toISTDateKey(cur), l);
      }
      cur.setDate(cur.getDate() + 1);
    }
  });

  // Load holidays from settings (with defaults fallback)
  const holidaySet = await loadCompanyHolidays();

  // Shift & Grace settings for late mark check
  const [shiftStartSetting, graceSetting] = await Promise.all([
    Setting.findOne({ key: "SHIFT_START_TIME" }),
    Setting.findOne({ key: "gracePeriod" }),
  ]);
  const rawShift = (shiftStartSetting?.value || "10:00").replace(".", ":");
  const [shiftH, shiftM] = rawShift.split(":").map((v) => parseInt(v, 10) || 0);
  const graceMinutes = parseInt(graceSetting?.value || "15", 10) || 15;
  const shiftStartMinutes = (shiftH || 10) * 60 + (shiftM || 0);
  const lateThresholdMinutes = shiftStartMinutes + graceMinutes;

  const todayStartIST = getISTStartOfDay(new Date());

  // Counters
  let calendarDays = daysInMonth;
  let regularWorkingDays = 0; // Mon–Sat, not public holidays
  let publicHolidays = 0;
  let sundaysCount = 0;
  let extraWorkDays = 0;
  let extraSundayDays = 0;
  let holidayWorkDays = 0;
  let presentDays = 0;
  let absentDays = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;
  let lateCount = 0;
  let totalWorkingHours = 0;
  let overtimeHours = 0;
  const dailyBreakdown: any[] = [];

  // Company Leave Policy: Only 1 paid leave is allowed per month (whether approved or unapproved).
  // Any leave or absence taken beyond 1 paid leave is deducted from salary.
  const MAX_PAID_LEAVES_PER_MONTH = 1.0;
  let paidLeaveAllowanceRemaining = MAX_PAID_LEAVES_PER_MONTH;

  // Iterate day-by-day through the entire month
  for (let d = 1; d <= daysInMonth; d++) {
    const curDate = new Date(year, month - 1, d);
    const istCur = getISTDate(curDate);
    const dateKey = toISTDateKey(curDate);
    const dayOfWeek = istCur.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const isSunday = dayOfWeek === 0;
    const isHoliday = isCompanyHoliday(curDate, holidaySet);

    // Check if employee had joined by this day
    const employeeJoined = !user.joinDate || getISTStartOfDay(new Date(user.joinDate)) <= curDate;
    // Check if this date is in the future for current ongoing month
    const isFutureDate = getISTStartOfDay(curDate) > todayStartIST;

    const attendance = attendanceMap.get(dateKey);
    const leave = leaveMap.get(dateKey);

    let dayWorkingHours = 0;
    let isLateMark = false;

    if (attendance) {
      if (attendance.punchInTime && attendance.punchOutTime) {
        const diffMs = new Date(attendance.punchOutTime).getTime() - new Date(attendance.punchInTime).getTime();
        const totalDurationHrs = diffMs / 3600000;
        const manualBreakMins = attendance.breakDuration || 0;
        if (manualBreakMins === 0 && totalDurationHrs > 5) {
          dayWorkingHours = Math.max(0, (diffMs / 60000 - 60) / 60);
        } else {
          dayWorkingHours = Math.max(0, (diffMs / 60000 - manualBreakMins) / 60);
        }
      } else if (attendance.workingHours && attendance.workingHours > 0) {
        dayWorkingHours = attendance.workingHours;
      } else if (attendance.status === AttendanceStatus.HALF_DAY) {
        dayWorkingHours = 4.5;
      } else if (attendance.status === AttendanceStatus.PRESENT || attendance.status === AttendanceStatus.WORK_FROM_HOME) {
        dayWorkingHours = 9;
      }

      // Late mark validation: Always recalculate from actual punchInTime using configured shift threshold
      // to match reports.service.ts and prevent stale isLate flags in DB from inflating late marks.
      // Late marks apply strictly on regular working days (never on Sundays or public holidays).
      if (!isSunday && !isHoliday) {
        if (attendance.punchInTime) {
          const punchIn = getISTDate(new Date(attendance.punchInTime));
          const punchInMinutes = punchIn.getHours() * 60 + punchIn.getMinutes();
          if (punchInMinutes > lateThresholdMinutes) {
            isLateMark = true;
          }
        } else if (attendance.isLate) {
          // Fallback only if no punchInTime is recorded on this working day
          isLateMark = true;
        }
      }
    }

    totalWorkingHours += dayWorkingHours;

    // -------------------------------------------------------------
    // Case 1: Sunday (Weekly Off)
    // -------------------------------------------------------------
    if (isSunday) {
      sundaysCount++;
      // Check if employee worked on Sunday
      const workedSunday = Boolean(
        attendance && (
          dayWorkingHours > 0 ||
          attendance.status === AttendanceStatus.PRESENT ||
          attendance.status === AttendanceStatus.WORK_FROM_HOME ||
          attendance.status === AttendanceStatus.HALF_DAY ||
          attendance.punchInTime
        )
      );

      if (workedSunday) {
        const isHalfDay = attendance?.status === AttendanceStatus.HALF_DAY;
        const credit = isHalfDay ? 0.5 : 1;
        extraSundayDays += credit;
        extraWorkDays += credit;
        presentDays += credit;
        if (dayWorkingHours > 9) {
          overtimeHours += (dayWorkingHours - 9);
        }
        dailyBreakdown.push({
          date: dateKey,
          dayOfWeek,
          status: "EXTRA_WORKING_DAY",
          workingHours: round(dayWorkingHours),
          notes: isHalfDay ? "Sunday worked (Half Day Extra Pay)" : "Sunday worked (Extra Working Day)",
        });
      } else {
        dailyBreakdown.push({
          date: dateKey,
          dayOfWeek,
          status: "SUNDAY_OFF",
          workingHours: 0,
          notes: "Sunday (Weekly Off)",
        });
      }
      continue;
    }

    // -------------------------------------------------------------
    // Case 2: Public Holiday (Non-working day, paid extra if worked)
    // -------------------------------------------------------------
    if (isHoliday) {
      publicHolidays++;
      const workedHoliday = Boolean(
        attendance && (
          dayWorkingHours > 0 ||
          attendance.status === AttendanceStatus.PRESENT ||
          attendance.status === AttendanceStatus.WORK_FROM_HOME ||
          attendance.status === AttendanceStatus.HALF_DAY ||
          attendance.punchInTime
        )
      );

      if (workedHoliday) {
        const isHalfDay = attendance?.status === AttendanceStatus.HALF_DAY;
        const credit = isHalfDay ? 0.5 : 1;
        holidayWorkDays += credit;
        extraWorkDays += credit;
        presentDays += credit;
        if (dayWorkingHours > 9) {
          overtimeHours += (dayWorkingHours - 9);
        }
        dailyBreakdown.push({
          date: dateKey,
          dayOfWeek,
          status: "HOLIDAY_WORKED",
          workingHours: round(dayWorkingHours),
          notes: isHalfDay ? "Public Holiday worked (Half Day Extra Pay)" : "Public Holiday worked (Extra Day Pay)",
        });
      } else {
        dailyBreakdown.push({
          date: dateKey,
          dayOfWeek,
          status: "PUBLIC_HOLIDAY",
          workingHours: 0,
          notes: "Public Holiday (Off - Paid)",
        });
      }
      continue;
    }

    // -------------------------------------------------------------
    // Case 3: Regular Working Day (Monday–Saturday, not a public holiday)
    // -------------------------------------------------------------
    regularWorkingDays++;

    // Employee not joined yet before this day
    if (!employeeJoined) {
      dailyBreakdown.push({
        date: dateKey,
        dayOfWeek,
        status: "NOT_JOINED",
        workingHours: 0,
        notes: "Before Employee Join Date",
      });
      continue;
    }

    // 3a. Check Leave Request (Approved or Unapproved/Pending)
    if (leave) {
      const isHalfDay = Boolean(leave.isHalfDay);
      const leaveDayCount = isHalfDay ? 0.5 : 1.0;
      const isApproved = leave.status === LeaveStatus.APPROVED;
      const statusPrefix = isApproved ? "Approved" : "Unapproved";

      // If employee explicitly requested UNPAID leave, it is always deducted
      if (leave.leaveType === LeaveType.UNPAID) {
        unpaidLeaveDays += leaveDayCount;
        absentDays += leaveDayCount;
        if (isHalfDay) presentDays += 0.5;
        dailyBreakdown.push({
          date: dateKey,
          dayOfWeek,
          status: "UNPAID_LEAVE",
          workingHours: 0,
          notes: `${statusPrefix} Unpaid Leave (${leaveDayCount} day) - Salary Deducted`,
        });
      } else {
        // Apply 1 monthly paid leave allowance
        const paidCredit = Math.min(leaveDayCount, paidLeaveAllowanceRemaining);
        const unpaidCredit = leaveDayCount - paidCredit;
        paidLeaveAllowanceRemaining -= paidCredit;

        if (paidCredit > 0) {
          paidLeaveDays += paidCredit;
          presentDays += paidCredit;
        }
        if (unpaidCredit > 0) {
          unpaidLeaveDays += unpaidCredit;
          absentDays += unpaidCredit;
        }

        if (unpaidCredit === 0) {
          dailyBreakdown.push({
            date: dateKey,
            dayOfWeek,
            status: isApproved ? `PAID_LEAVE_${leave.leaveType}` : "PAID_LEAVE_UNAPPROVED",
            workingHours: 0,
            notes: `${statusPrefix} Leave (${leave.leaveType}) - Paid (1 Monthly Paid Leave)`,
          });
        } else if (paidCredit === 0) {
          dailyBreakdown.push({
            date: dateKey,
            dayOfWeek,
            status: isApproved ? `UNPAID_LEAVE_${leave.leaveType}` : "UNPAID_LEAVE",
            workingHours: 0,
            notes: `${statusPrefix} Leave (${leave.leaveType}) - Exceeds 1 Paid Leave (Salary Deducted)`,
          });
        } else {
          dailyBreakdown.push({
            date: dateKey,
            dayOfWeek,
            status: "PARTIAL_PAID_LEAVE",
            workingHours: 0,
            notes: `${statusPrefix} Leave (${paidCredit}d Paid, ${unpaidCredit}d Salary Deducted)`,
          });
        }
      }
      continue;
    }

    // 3b. Check Attendance Record
    if (attendance) {
      if (attendance.status === AttendanceStatus.ABSENT) {
        if (paidLeaveAllowanceRemaining >= 1) {
          paidLeaveAllowanceRemaining -= 1;
          paidLeaveDays += 1;
          presentDays += 1;
          dailyBreakdown.push({
            date: dateKey,
            dayOfWeek,
            status: "PAID_LEAVE",
            workingHours: 0,
            notes: "Leave / Absent - Covered by 1 Monthly Paid Leave (No Deduction)",
          });
        } else {
          absentDays += 1;
          dailyBreakdown.push({
            date: dateKey,
            dayOfWeek,
            status: "ABSENT",
            workingHours: 0,
            notes: "Marked Absent (Exceeds 1 Paid Leave - Salary Deducted)",
          });
        }
      } else if (attendance.status === AttendanceStatus.HALF_DAY) {
        presentDays += 0.5;
        absentDays += 0.5;
        if (isLateMark) lateCount++;
        dailyBreakdown.push({
          date: dateKey,
          dayOfWeek,
          status: "HALF_DAY",
          workingHours: round(dayWorkingHours),
          isLate: isLateMark,
          notes: "Half Day Worked (0.5d Salary Deducted)",
        });
      } else {
        // PRESENT / WORK_FROM_HOME / Punched In
        presentDays += 1;
        if (isLateMark) lateCount++;
        if (dayWorkingHours > 9) {
          overtimeHours += (dayWorkingHours - 9);
        }
        dailyBreakdown.push({
          date: dateKey,
          dayOfWeek,
          status: attendance.status || "PRESENT",
          workingHours: round(dayWorkingHours),
          isLate: isLateMark,
          notes: isLateMark ? "Present (Late Mark)" : "Present",
        });
      }
      continue;
    }

    // 3c. No attendance record & No leave record
    if (isFutureDate) {
      dailyBreakdown.push({
        date: dateKey,
        dayOfWeek,
        status: "PENDING",
        workingHours: 0,
        notes: "Future date in current month",
      });
    } else {
      // Past regular working day with no attendance and no leave
      if (paidLeaveAllowanceRemaining >= 1) {
        paidLeaveAllowanceRemaining -= 1;
        paidLeaveDays += 1;
        presentDays += 1;
        dailyBreakdown.push({
          date: dateKey,
          dayOfWeek,
          status: "PAID_LEAVE",
          workingHours: 0,
          notes: "Leave / Absent - Covered by 1 Monthly Paid Leave (No Deduction)",
        });
      } else {
        absentDays += 1;
        dailyBreakdown.push({
          date: dateKey,
          dayOfWeek,
          status: "ABSENT",
          workingHours: 0,
          notes: "Unexcused Absence (Exceeds 1 Paid Leave - Salary Deducted)",
        });
      }
    }
  }

  // 3. Monetary Calculations
  const calculatedOvertimePay = round(overtimeHours * overtimeRate);
  let extraWorkPay = round(dailySalary * extraWorkDays);
  let absentDeduction = round(dailySalary * absentDays);
  const penaltyUnits = Math.floor(lateCount / 3);
  let lateDeduction = round(penaltyUnits * dailySalary * 0.5);
  let attendanceAdjustedSalary = 0;
  let basicSalary = monthlySalary;
  let payrollRule = "FULL_TIME_MONTHLY";

  if (employeeType === "Part-time") {
    payrollRule = "PART_TIME_HOURLY";
    // Part-time employees are paid for their actual logged regular hours
    const regularHours = Math.max(0, totalWorkingHours - overtimeHours);
    basicSalary = round(regularHours * effectiveHourlyRate);
    absentDeduction = 0; // Not penalized for unscheduled days
    lateDeduction = round(penaltyUnits * (effectiveHourlyRate * 4) * 0.5);
    extraWorkPay = round(extraWorkDays * (effectiveHourlyRate * 4));
    attendanceAdjustedSalary = round(basicSalary + extraWorkPay + calculatedOvertimePay - lateDeduction);
  } else if (employeeType === "Contract") {
    payrollRule = "CONTRACT_FIXED";
    // Contract employees receive contracted monthly fee plus overtime
    absentDeduction = 0; // Paid per contract
    lateDeduction = round(penaltyUnits * dailySalary * 0.5);
    attendanceAdjustedSalary = round(monthlySalary + extraWorkPay + calculatedOvertimePay - lateDeduction);
  } else {
    // Default Full-time:
    payrollRule = "FULL_TIME_MONTHLY";
    attendanceAdjustedSalary = round(monthlySalary + extraWorkPay + calculatedOvertimePay - absentDeduction - lateDeduction);
  }

  // Additional payroll components (allowances, bonuses, etc.)
  const allowances = 0;
  const bonuses = 0;
  const baseSalaryForGross = employeeType === "Part-time" ? basicSalary : monthlySalary;
  const grossPay = round(baseSalaryForGross + extraWorkPay + calculatedOvertimePay + allowances + bonuses);
  const totalDeductions = round(absentDeduction + lateDeduction);
  const netPay = round(Math.max(0, attendanceAdjustedSalary + allowances + bonuses));

  const totalWorkingDays = presentDays;

  return {
    userId,
    month,
    year,
    employeeType,
    payrollRule,
    hourlyRate: effectiveHourlyRate,
    overtimeRate,
    monthlySalary,
    dailySalary,
    totalWorkingHours: parseFloat(totalWorkingHours.toFixed(2)),
    totalWorkingDays: parseFloat(totalWorkingDays.toFixed(1)),
    overtimeHours: parseFloat(overtimeHours.toFixed(2)),
    regularHours: parseFloat((totalWorkingHours - overtimeHours).toFixed(2)),
    basicSalary,
    calendarDays,
    regularWorkingDays,
    publicHolidays,
    paidLeaveDays,
    unpaidLeaveDays,
    extraWorkDays,
    extraSundayDays,
    holidayWorkDays,
    extraWorkPay,
    presentDays,
    absentDays,
    absentDeduction,
    lateCount,
    lateDeduction,
    attendanceAdjustedSalary,
    allowances,
    bonuses,
    overtimePay: calculatedOvertimePay,
    grossPay,
    deductions: totalDeductions,
    netPay,
    dailyBreakdown,
    user,
  };
}

/**
 * Generate Payroll (Create or Update)
 */
export async function generatePayroll(
  userId: string,
  month: number,
  year: number
) {
  // Calculate payroll
  const calculation = await calculatePayroll(userId, month, year);

  // Check if payroll already exists
  const existing = await Payroll.findOne({
    userId,
    month,
    year,
  });

  if (existing) {
    existing.employeeType = calculation.employeeType;
    existing.payrollRule = calculation.payrollRule;
    existing.hourlyRate = calculation.hourlyRate;
    existing.overtimeRate = calculation.overtimeRate;
    existing.totalWorkingHours = calculation.totalWorkingHours;
    existing.totalWorkingDays = calculation.totalWorkingDays;
    existing.presentDays = calculation.presentDays;
    existing.overtimeHours = calculation.overtimeHours;
    existing.regularHours = calculation.regularHours;
    existing.basicSalary = calculation.basicSalary;
    existing.dailySalary = calculation.dailySalary;
    existing.extraWorkPay = calculation.extraWorkPay;
    existing.absentDeduction = calculation.absentDeduction;
    existing.attendanceAdjustedSalary = calculation.attendanceAdjustedSalary;
    existing.calendarDays = calculation.calendarDays;
    existing.regularWorkingDays = calculation.regularWorkingDays;
    existing.publicHolidays = calculation.publicHolidays;
    existing.paidLeaveDays = calculation.paidLeaveDays;
    existing.unpaidLeaveDays = calculation.unpaidLeaveDays;
    existing.leaveDays = calculation.paidLeaveDays + calculation.unpaidLeaveDays;
    existing.allowances = calculation.allowances;
    existing.overtimePay = calculation.overtimePay;
    existing.bonuses = calculation.bonuses;
    existing.lateCount = calculation.lateCount;
    existing.lateDeduction = calculation.lateDeduction;
    existing.grossPay = calculation.grossPay;
    existing.deductions = calculation.deductions;
    existing.netPay = calculation.netPay;
    existing.absentDays = calculation.absentDays;
    existing.extraWorkDays = calculation.extraWorkDays;
    existing.extraSundayDays = calculation.extraSundayDays;
    existing.holidayWorkDays = calculation.holidayWorkDays;
    // Retain PAID or PROCESSED status if already paid/processed, else set DRAFT
    if (existing.status !== PayrollStatus.PAID && existing.status !== PayrollStatus.PROCESSED) {
      existing.status = PayrollStatus.DRAFT;
    }

    const saved = await existing.save();
    return await Payroll.findById(saved._id)
      .populate("user", "id fullName employeeId email designation department employeeType");
  }

  // Create new payroll record
  const payroll = await Payroll.create({
    userId,
    month,
    year,
    employeeType: calculation.employeeType,
    payrollRule: calculation.payrollRule,
    hourlyRate: calculation.hourlyRate,
    overtimeRate: calculation.overtimeRate,
    totalWorkingHours: calculation.totalWorkingHours,
    totalWorkingDays: calculation.totalWorkingDays,
    presentDays: calculation.presentDays,
    overtimeHours: calculation.overtimeHours,
    regularHours: calculation.regularHours,
    leaveDays: calculation.paidLeaveDays + calculation.unpaidLeaveDays,
    dailySalary: calculation.dailySalary,
    extraWorkPay: calculation.extraWorkPay,
    absentDeduction: calculation.absentDeduction,
    attendanceAdjustedSalary: calculation.attendanceAdjustedSalary,
    calendarDays: calculation.calendarDays,
    regularWorkingDays: calculation.regularWorkingDays,
    publicHolidays: calculation.publicHolidays,
    paidLeaveDays: calculation.paidLeaveDays,
    unpaidLeaveDays: calculation.unpaidLeaveDays,
    basicSalary: calculation.basicSalary,
    allowances: calculation.allowances,
    overtimePay: calculation.overtimePay,
    bonuses: calculation.bonuses,
    lateCount: calculation.lateCount,
    lateDeduction: calculation.lateDeduction,
    grossPay: calculation.grossPay,
    deductions: calculation.deductions,
    netPay: calculation.netPay,
    absentDays: calculation.absentDays,
    extraWorkDays: calculation.extraWorkDays,
    extraSundayDays: calculation.extraSundayDays,
    holidayWorkDays: calculation.holidayWorkDays,
    status: PayrollStatus.DRAFT,
  });

  // Notify user
  if (payroll) {
    const monthNames = [
      "",
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    await createNotification({
      userId: userId,
      type: NotificationType.PAYROLL_GENERATED,
      title: "Payroll Generated",
      message: `Your payroll for ${monthNames[month]} ${year} has been generated. View your payslip for details.`,
      link: `/payroll`,
    });
  }

  return payroll;
}

/**
 * Process Payroll (Mark as Processed)
 */
export async function processPayroll(
  payrollId: string,
  processedBy: string
) {
  const payroll = await Payroll.findById(payrollId);

  if (!payroll) {
    throw new Error("Payroll not found");
  }

  if (payroll.status === PayrollStatus.PAID) {
    throw new Error("Payroll already paid");
  }

  return await Payroll.findByIdAndUpdate(
    payrollId,
    {
      $set: {
        status: PayrollStatus.PROCESSED,
        processedBy,
        processedAt: new Date(),
      },
    },
    { new: true }
  )
    .populate("user", "id fullName employeeId email designation department")
    .populate("processor", "id fullName");
}

/**
 * Mark Payroll as Paid
 */
export async function markPayrollAsPaid(
  payrollId: string,
  processedBy: string
) {
  const payroll = await Payroll.findById(payrollId);

  if (!payroll) {
    throw new Error("Payroll not found");
  }

  const updatedPayroll = await Payroll.findByIdAndUpdate(
    payrollId,
    {
      $set: {
        status: PayrollStatus.PAID,
        processedBy,
        processedAt: new Date(),
      },
    },
    { new: true }
  ).populate("user", "id fullName employeeId email");

  // Notify user
  if (updatedPayroll) { // Changed from 'payroll' to 'updatedPayroll'
    const monthNames = [
      "",
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    await createNotification({
      userId: updatedPayroll.userId.toString(), // Changed from 'payroll' to 'updatedPayroll'
      type: NotificationType.GENERAL,
      title: "Salary Paid",
      message: `Your salary for ${monthNames[updatedPayroll.month]} ${ // Changed from 'payroll' to 'updatedPayroll'
        updatedPayroll.year // Changed from 'payroll' to 'updatedPayroll'
        } has been marked as paid.`,
      link: `/payroll`,
    });
  }

  return updatedPayroll; // Changed from 'payroll' to 'updatedPayroll'
}

/**
 * Bulk Generate Payroll for All Active Employees
 */
export async function bulkGeneratePayroll(month: number, year: number) {
  // Get all active employees
  // Exclude employees with hourlyRate 0 or null — they'd get a ₹0 payslip.
  const employees = await User.find({
    isActive: true,
    role: { $in: [UserRole.EMPLOYEE, UserRole.MANAGER, UserRole.ADMIN] },
    $or: [
      { monthlySalary: { $gt: 0 } },
      { hourlyRate: { $gt: 0 } },
      { salary: { $gt: 0 } }
    ],
  }).select("id fullName");

  const results = {
    success: [] as any[],
    failed: [] as any[],
    skipped: [] as any[], // PAID/PROCESSED records that were protected
  };

  for (const employee of employees) {
    try {
      const payroll = await generatePayroll(
        employee._id.toString(),
        month,
        year
      );
      if (payroll) {
        // Check if the returned payroll was already PAID/PROCESSED (i.e., it was skipped)
        if ((payroll as any).status === PayrollStatus.PAID || (payroll as any).status === PayrollStatus.PROCESSED) {
          results.skipped.push({
            userId: employee._id,
            fullName: employee.fullName,
            status: (payroll as any).status,
            message: `Payroll is already ${(payroll as any).status} — not overwritten`,
          });
        } else {
          results.success.push({
            userId: employee._id,
            fullName: employee.fullName,
            payrollId: (payroll as any)._id,
          });
        }
      }
    } catch (error: any) {
      results.failed.push({
        userId: employee._id,
        fullName: employee.fullName,
        error: error.message,
      });
    }
  }

  return results;
}

/**
 * Get Payroll by ID
 */
export async function getPayrollById(
  payrollId: string,
  userId: string,
  userUserRole: string
) {
  const payroll = await Payroll.findById(payrollId)
    .populate("user", "id fullName employeeId email designation department phone address employeeType")
    .populate("processor", "id fullName");

  if (!payroll) {
    throw new Error("Payroll not found");
  }

  // Authorization: Employees can only view their own payroll
  if (userUserRole === "EMPLOYEE" && payroll.userId.toString() !== userId) {
    throw new Error("Unauthorized to view this payroll");
  }

  const doc: any = (payroll as any).toObject ? (payroll as any).toObject() : payroll;
  if (!doc.user) {
    doc.user = {
      id: doc.userId,
      fullName: "Unknown / Removed Employee",
      employeeId: "N/A",
      email: "",
      designation: "",
      department: "",
    };
  }

  return doc;
}

/**
 * Get Payrolls with Filters
 */
export async function getPayrolls(
  userId: string,
  userUserRole: string,
  filters: {
    month?: number;
    year?: number;
    status?: PayrollStatus;
    employeeId?: string;
  }
) {
  const where: any = {};

  // UserRole-based filtering
  if (userUserRole === "EMPLOYEE") {
    where.userId = userId;
  } else if (filters.employeeId) {
    where.userId = filters.employeeId;
  }

  if (filters.month) where.month = filters.month;
  if (filters.year) where.year = filters.year;
  if (filters.status) where.status = filters.status;

  const payrolls = await Payroll.find(where)
    .populate("user", "id fullName employeeId email designation department employeeType")
    .populate("processor", "id fullName")
    .sort({ year: -1, month: -1 });

  return payrolls.map((p: any) => {
    const doc = p.toObject ? p.toObject() : p;
    if (!doc.user) {
      doc.user = {
        id: doc.userId,
        fullName: "Unknown / Removed Employee",
        employeeId: "N/A",
        email: "",
        designation: "",
        department: "",
      };
    }
    return doc;
  });
}

/**
 * Get Payroll Statistics
 */
export async function getPayrollStatistics(month?: number, year?: number) {
  const currentDate = getISTDate(new Date());
  const targetMonth = month || currentDate.getMonth() + 1;
  const targetYear = year || currentDate.getFullYear();

  const payrolls = await Payroll.find({
    month: targetMonth,
    year: targetYear,
  });

  const stats = {
    totalEmployees: payrolls.length,
    totalGrossPay: payrolls.reduce((sum, p) => sum + p.grossPay, 0),
    totalNetPay: payrolls.reduce((sum, p) => sum + p.netPay, 0),
    totalDeductions: payrolls.reduce((sum, p) => sum + p.deductions, 0),
    totalOvertimePay: payrolls.reduce((sum, p) => sum + p.overtimePay, 0),
    statusBreakdown: {
      draft: payrolls.filter((p) => p.status === PayrollStatus.DRAFT).length,
      processed: payrolls.filter((p) => p.status === PayrollStatus.PROCESSED).length,
      paid: payrolls.filter((p) => p.status === PayrollStatus.PAID).length,
    },
  };

  return stats;
}
