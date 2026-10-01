import mongoose from "mongoose";
import Attendance, { AttendanceStatus } from "../models/Attendance";
import User, { UserRole } from "../models/User";
import Setting from "../models/Setting";
import WFHAssignment from "../models/WFHAssignment";
import Leave, { LeaveStatus, LeaveType } from "../models/Leave";
import AttendanceCorrection, { CorrectionStatus } from "../models/AttendanceCorrection";
import { format } from "date-fns";
import { createNotification } from "./notification.service";
import { NotificationType } from "../models/Notification";
import { taskService } from "./task.service";
import TaskTimer from "../models/TaskTimer";
import { getISTStartOfDay, getISTEndOfDay, getISTDate } from "../utils/date.utils";
import { savePunchOutImages } from "../utils/image.utils";

/**
 * Attendance Service
 * Handles attendance-related business logic
 */

interface Location {
  lat: number;
  lng: number;
  address?: string;
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 * Returns distance in meters
 */
function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Get setting value with default
 */
async function getSettingValue(key: string, defaultValue: string): Promise<string> {
  const setting = await Setting.findOne({ key });
  return setting?.value || defaultValue;
}

/**
 * Validate if location is within geofence
 */
async function validateLocation(location: Location): Promise<boolean> {
  const officeLatStr = await getSettingValue("OFFICE_LAT", process.env.OFFICE_LAT || "0");
  const officeLngStr = await getSettingValue("OFFICE_LNG", process.env.OFFICE_LNG || "0");
  const geofenceRadiusStr = await getSettingValue("GEOFENCE_RADIUS", process.env.GEOFENCE_RADIUS || "100");

  const officeLat = parseFloat(officeLatStr);
  const officeLng = parseFloat(officeLngStr);
  const geofenceRadius = parseFloat(geofenceRadiusStr);

  // If no office coordinates set, allow any location
  if (officeLat === 0 && officeLng === 0) {
    return true;
  }

  const distance = calculateDistance(
    location.lat,
    location.lng,
    officeLat,
    officeLng
  );

  return distance <= geofenceRadius;
}

/**
 * Employees with an assigned office must be within that office's radius.
 * Employees without one fall back to the global office settings.
 */
async function assertWithinOffice(userId: string, location: Location, action: "punch in" | "punch out") {
  if (
    !location ||
    typeof location.lat !== "number" ||
    typeof location.lng !== "number" ||
    Number.isNaN(location.lat) ||
    Number.isNaN(location.lng)
  ) {
    throw new Error(`Location is required to ${action}. Please allow location access.`);
  }

  const user = await User.findById(userId).select("officeId").populate("office");
  const office: any = (user as any)?.office;

  if (office) {
    if (!office.isActive) {
      throw new Error(`Your assigned office "${office.name}" is inactive. Please contact your administrator.`);
    }
    const radius = office.radiusMeters || 100;
    const distance = calculateDistance(location.lat, location.lng, office.latitude, office.longitude);
    if (distance > radius) {
      throw new Error(
        `You are ${Math.round(distance)} m away from ${office.name}. You must be within ${radius} m of your office to ${action}.`
      );
    }
    return;
  }

  if (!(await validateLocation(location))) {
    throw new Error(`Location is outside office geofence. Please ${action} from office premises.`);
  }
}

/**
 * Update Attendance Status manually (Admin/Manager)
 */
export async function updateAttendanceStatus(
  attendanceId: string | undefined,
  date: string,
  userId: string,
  status: AttendanceStatus,
  approverId: string
) {
  // Security Check: Manager can only update their own team or themselves
  const approver = await User.findById(approverId);
  if (!approver) throw new Error("Approver not found");

  if (approver.role !== "ADMIN") {
    const employee = await User.findById(userId);
    if (employee?.managerId?.toString() !== approverId.toString()) {
       throw new Error("Access Denied: You can only update attendance for your own team members.");
    }
  }

  let attendance;
  
  // Try to find by ID if valid
  if (attendanceId && mongoose.Types.ObjectId.isValid(attendanceId)) {
    attendance = await Attendance.findById(attendanceId);
  }

  // Fallback to finding by userId + date
  if (!attendance) {
     attendance = await Attendance.findOne({
        userId,
        date: {
          $gte: getISTStartOfDay(new Date(date)),
          $lte: getISTEndOfDay(new Date(date))
        }
     });
  }

  if (attendance) {
    attendance.status = status;
    await attendance.save();
    return attendance;
  } else {
    // create a new one to force the status (e.g. absent/holiday overriding weekend)
    const newRecord = await Attendance.create({
      userId,
      date: new Date(date),
      status,
    });
    return newRecord;
  }
}

/**
 * Punch In
 * Records employee arrival time with location
 */
export async function punchIn(userId: string, location: Location, isWFH: boolean = false, isOvertime: boolean = false) {
  // Get today's date range in IST
  const today = new Date();
  const startDate = getISTStartOfDay(today);

  // Check for any active session across midnight
  const activeSession = await Attendance.findOne({
    userId,
    punchOutTime: { $exists: false },
    punchInTime: {
      $gte: new Date(today.getTime() - 15 * 60 * 60 * 1000)
    }
  });

  if (activeSession) {
    throw new Error("You have an active shift. Please punch out first.");
  }

  // Check if already punched in today
  const existingAttendance = await Attendance.findOne({
    userId,
    date: {
      $gte: getISTStartOfDay(today),
      $lte: getISTEndOfDay(today),
    },
  });

  if (existingAttendance && existingAttendance.punchInTime) {
    throw new Error("Already punched in today");
  }

  // Prevent double-pay (Punched In while on Approved Leave)
  const approvedLeave = await Leave.findOne({
    userId,
    status: LeaveStatus.APPROVED,
    startDate: { $lte: today },
    endDate: { $gte: getISTStartOfDay(today) },
    leaveType: { $nin: [LeaveType.WORK_FROM_HOME] } // WFH is fine
  });

  if (approvedLeave) {
    throw new Error(`You have an approved ${approvedLeave.leaveType} leave for today. You cannot punch in unless the leave is cancelled.`);
  }

  // Validate WFH authorization if requested
  if (isWFH) {
    const activeWFH = await WFHAssignment.findOne({
      userId,
      startDate: { $lte: today },
      endDate: { $gte: getISTStartOfDay(today) },
      isActive: true,
    });

    if (!activeWFH) {
      throw new Error("You are not authorized for Work From Home today. Please punch in from the office.");
    }
  }

  if (!isWFH) {
    await assertWithinOffice(userId, location, "punch in");
  }

  // Get settings for late mark
  const shiftStartSetting = await Setting.findOne({ key: "SHIFT_START_TIME" });
  const graceSetting = await Setting.findOne({ key: "gracePeriod" });
  
  const [shiftH, shiftM] = (shiftStartSetting?.value || "10:00").split(":").map(Number);
  const graceMinutes = parseInt(graceSetting?.value || "15");

  const now = new Date();
  
  // Shift Start Time in Minutes (e.g. 09:30 => 570)
  const shiftStartMinutes = (shiftH * 60) + shiftM;
  const lateThresholdMinutes = shiftStartMinutes + graceMinutes;
  
  // Uses server local time
  const istNow = getISTDate(now);
  const nowMinutes = (istNow.getHours() * 60) + istNow.getMinutes();
  
  const isLate = nowMinutes > lateThresholdMinutes;
  const lateMinutes = isLate ? (nowMinutes - shiftStartMinutes) : 0;

  // Create or update attendance record
  const attendance = await Attendance.findOneAndUpdate(
    {
      userId,
      date: startDate,
    },
    {
      $set: {
        punchInTime: now,
        punchInLocation: location,
        status: isWFH ? AttendanceStatus.WORK_FROM_HOME : AttendanceStatus.PRESENT,
        isWFH,
        isOvertime,
        isLate,
        lateMinutes,
        userId,
        date: startDate,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate("user", "id fullName email designation");

  return attendance;
}

/**
 * Toggle Overtime during active session
 */
export async function toggleOvertime(userId: string, isOvertime: boolean) {
  const today = new Date();

  const attendance = await Attendance.findOne({
    userId,
    punchOutTime: { $exists: false },
    punchInTime: {
      $gte: new Date(today.getTime() - 15 * 60 * 60 * 1000)
    }
  }).sort({ punchInTime: -1 });

  if (!attendance) {
    throw new Error("No attendance record found for today");
  }

  attendance.isOvertime = isOvertime;
  await attendance.save();
  return attendance;
}

/**
 * Punch Out
 * Records employee departure time and calculates hours
 */
export async function punchOut(
  userId: string,
  location: Location,
  workSummary?: string,
  workImages?: string[]
) {
  const today = new Date();

  // Validate designer work images requirement
  const user = await User.findById(userId);
  const isDesigner = Boolean(
    user?.designation?.toLowerCase().includes("design") ||
    user?.department?.toLowerCase().includes("design")
  );

  if (isDesigner && (!workImages || workImages.length === 0)) {
    throw new Error("Designers must upload work images (JPGs) to complete punch out.");
  }

  // Find today's attendance
  // Night Shift Support. Look for an active punch-in from the last 15 hours.
  // We look for any record for this user where punchOutTime is missing and punchInTime is within the last 15 hours.
  const attendance = await Attendance.findOne({
    userId,
    punchOutTime: { $exists: false },
    punchInTime: {
      $gte: new Date(today.getTime() - 15 * 60 * 60 * 1000) // Within 15 hours
    }
  }).sort({ punchInTime: -1 }); // Get the most recent one if multiple exist

  if (!attendance) {
    throw new Error("No punch-in record found for today");
  }

  if (attendance.punchOutTime) {
    throw new Error("Already punched out today");
  }

  if (!attendance.punchInTime) {
    throw new Error("Must punch in before punching out");
  }

  if (!attendance.isWFH) {
    await assertWithinOffice(userId, location, "punch out");
  }

  // Handle active breaks
  const activeBreak = attendance.breaks.find(b => !b.endTime);
  if (activeBreak) {
    const endTime = new Date();
    const startTime = new Date(activeBreak.startTime);
    let durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));
    
    // Break Safety Cap. Max 120 minutes per break session to prevent salary deletion
    if (durationMinutes > 120) durationMinutes = 120;
    
    activeBreak.endTime = endTime;
    activeBreak.durationMinutes = durationMinutes;

    // Update cumulative break duration
    attendance.breakDuration = attendance.breaks.reduce((total, b) => total + (b.durationMinutes || 0), 0);
  }

  // STOP ANY ACTIVE TASK TIMERS
  try {
    const activeTimer = await TaskTimer.findOne({
      userId,
      endTime: null
    });

    if (activeTimer) {
      await taskService.stopTimer(activeTimer._id.toString(), userId, "Auto-stopped on punch out");
    }
  } catch (err) {
    console.error("Error stopping task timer on punch out:", err);
  }

  // Calculate total hours
  const punchOutTime = new Date();
  let diffMs = punchOutTime.getTime() - attendance.punchInTime.getTime();
  if (diffMs < 0) diffMs = 0;

  let totalHours = diffMs / (1000 * 60 * 60);



  const totalMinutes = totalHours * 60;

  // Deduct break duration from working hours
  const workingHours = (totalMinutes - (attendance.breakDuration || 0)) / 60;

  // Update attendance
  attendance.punchOutTime = punchOutTime;
  attendance.punchOutLocation = location;
  attendance.totalHours = totalHours;
  attendance.workingHours = workingHours > 0 ? workingHours : 0;

  // GET STANDARD SHIFT DURATION
  const dailyHoursSetting = await Setting.findOne({ key: "dailyHours" });
  const standardDailyHours = parseFloat(dailyHoursSetting?.value || "9");

  // Calculate Overtime
  // If isOvertime is true (Manual Toggle), it's a dedicated OT shift (e.g. Weekend work) -> Full hours
  // If isOvertime is false (Regular Shift) -> Only excess hours over standardDailyHours
  if (attendance.isOvertime) {
    attendance.overtimeHours = attendance.workingHours;
  } else {
    // Automatic Overtime for regular shifts
    const excess = attendance.workingHours - standardDailyHours;
    attendance.overtimeHours = excess > 0 ? excess : 0;
  }

  if (workSummary) {
    attendance.workSummary = workSummary;
  }

  if (workImages && workImages.length > 0) {
    attendance.workImages = savePunchOutImages(userId, workImages);
  }

  await attendance.save();
  const updatedAttendance = await (attendance as any).populate("user", "id fullName email designation");

  return updatedAttendance;
}

/**
 * Start Break
 */
export async function startBreak(userId: string) {
  const today = new Date();

  const attendance = await Attendance.findOne({
    userId,
    punchOutTime: { $exists: false },
    punchInTime: {
      $gte: new Date(today.getTime() - 15 * 60 * 60 * 1000)
    }
  }).sort({ punchInTime: -1 });

  if (!attendance) throw new Error("No attendance record found for today");
  if (attendance.punchOutTime) throw new Error("Already punched out");

  // Check if there's already an active break
  const activeBreak = attendance.breaks.find(b => !b.endTime);
  if (activeBreak) throw new Error("You are already on a break");

  // Auto-pause any running task timers when starting an attendance break
  try {
    const activeTimer = await TaskTimer.findOne({ userId, endTime: null });
    if (activeTimer && !activeTimer.pauseStartTime) {
      await taskService.pauseTimer(activeTimer._id.toString(), userId);
    }
  } catch (err) {
    console.warn("Auto-stopping task timer on break failed:", err);
  }

  attendance.breaks.push({ startTime: new Date() });
  await attendance.save();

  return attendance;
}

/**
 * End Break
 */
export async function endBreak(userId: string) {
  const today = new Date();

  const attendance = await Attendance.findOne({
    userId,
    punchOutTime: { $exists: false },
    punchInTime: {
      $gte: new Date(today.getTime() - 15 * 60 * 60 * 1000)
    }
  }).sort({ punchInTime: -1 });

  if (!attendance) throw new Error("No attendance record found for today");

  const activeBreak = attendance.breaks.find(b => !b.endTime);
  if (!activeBreak) throw new Error("No active break found");

  const endTime = new Date();
  const startTime = new Date(activeBreak.startTime);
  let durationMinutes = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));

  // Break Safety Cap. Max 120 minutes per break session to prevent salary deletion
  if (durationMinutes > 120) durationMinutes = 120;

  activeBreak.endTime = endTime;
  activeBreak.durationMinutes = durationMinutes;

  // Update cumulative break duration
  attendance.breakDuration = attendance.breaks.reduce((total, b) => total + (b.durationMinutes || 0), 0);

  await attendance.save();
  return attendance;
}

/**
 * Get My Attendance Records
 */
export async function getMyAttendance(userId: string, month?: number, year?: number) {
  const currentDate = new Date();
  const targetMonth = month !== undefined ? month : currentDate.getMonth() + 1;
  const targetYear = year !== undefined ? year : currentDate.getFullYear();

  const startDate = getISTStartOfDay(new Date(targetYear, targetMonth - 1, 1));
  const endDate = getISTEndOfDay(new Date(targetYear, targetMonth, 0));

  const queryStartDate = startDate;
  const queryEndDate = endDate;

  const attendances = await Attendance.find({
    userId,
    date: {
      $gte: queryStartDate,
      $lte: queryEndDate,
    },
  })
    .sort({ date: -1 })
    .populate("user", "fullName designation");

  // Fetch approved leaves for the same period to show tags
  const approvedLeaves = await Leave.find({
    userId,
    status: LeaveStatus.APPROVED,
    $or: [
      { startDate: { $gte: startDate, $lte: endDate } },
      { endDate: { $gte: startDate, $lte: endDate } },
    ],
  });

  const leaveMap = new Map();
  approvedLeaves.forEach(l => {
    const d = getISTStartOfDay(new Date(l.startDate));
    const lEnd = getISTEndOfDay(new Date(l.endDate));
    while (d <= lEnd) {
      leaveMap.set(d.toDateString(), l);
      d.setDate(d.getDate() + 1);
    }
  });

  const formattedAttendances = attendances.map(a => {
    const record = a.toObject() as any;
    const dateStr = new Date(record.date).toDateString();
    
    // Fix hours
    if (record.punchInTime && record.punchOutTime) {
      const diffMs = new Date(record.punchOutTime).getTime() - new Date(record.punchInTime).getTime();
      record.workingHours = Math.max(0, (diffMs / 60000 - (record.breakDuration || 0)) / 60);
    }

    // Apply leave tag
    const leave = leaveMap.get(dateStr);
    if (leave) {
      record.status = leave.isHalfDay ? `HALF_DAY (${leave.leaveType})` : leave.leaveType;
    }

    record.isExtraDay = (record.status === AttendanceStatus.PRESENT || record.status === AttendanceStatus.WORK_FROM_HOME || (record.workingHours || 0) > 0) &&
                        (new Date(record.date).getDay() === 0 || record.status === AttendanceStatus.HOLIDAY);

    return record;
  });

  // Calculate summary
  const summary = {
    totalDays: formattedAttendances.length,
    presentDays: formattedAttendances.filter((a) => a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.WORK_FROM_HOME).length,
    wfhDays: formattedAttendances.filter((a) => a.status === AttendanceStatus.WORK_FROM_HOME).length,
    leaveDays: formattedAttendances.filter((a) => ["LEAVE", "SICK", "CASUAL", "VACATION", "UNPAID"].some(s => (a.status as string).includes(s))).length,
    extraDays: formattedAttendances.filter((a) => 
      (a.status === AttendanceStatus.PRESENT || a.status === AttendanceStatus.WORK_FROM_HOME || (a.workingHours || 0) > 0) &&
      (new Date(a.date).getDay() === 0 || (a as any).status === AttendanceStatus.HOLIDAY)
    ).length,
    totalHours: formattedAttendances.reduce((sum, a) => sum + (a.workingHours || 0), 0),
  };

  return { attendances: formattedAttendances, summary };
}

/**
 * Get Team Attendance (Manager)
 */
export async function getTeamAttendance(managerId: string, month?: number, year?: number) {
  const currentDate = new Date();
  const targetMonth = month !== undefined ? month : currentDate.getMonth() + 1;
  const targetYear = year !== undefined ? year : currentDate.getFullYear();

  const startDate = getISTStartOfDay(new Date(targetYear, targetMonth - 1, 1));
  const endDate = getISTEndOfDay(new Date(targetYear, targetMonth, 0));

  // Get all employees under this manager
  const teamMembers = await User.find({
    managerId,
    isActive: true,
  }).select("id fullName designation email");

  const teamMemberIds = teamMembers.map((m) => m._id);

  const queryStartDate = startDate;
  const queryEndDate = endDate;

  // Get attendance for all team members
  const attendances = await Attendance.find({
    userId: {
      $in: teamMemberIds,
    },
    date: {
      $gte: queryStartDate,
      $lte: queryEndDate,
    },
  })
    .populate("user", "fullName designation email")
    .sort({ date: -1 });

  // Fetch all leaves for the team in this period
  const approvedLeaves = await Leave.find({
    userId: { $in: teamMemberIds },
    status: LeaveStatus.APPROVED,
    $or: [
      { startDate: { $gte: startDate, $lte: endDate } },
      { endDate: { $gte: startDate, $lte: endDate } },
    ],
  });

  const leaveMap = new Map();
  approvedLeaves.forEach(l => {
    const uid = l.userId.toString();
    const d = getISTStartOfDay(new Date(l.startDate));
    const lEnd = getISTEndOfDay(new Date(l.endDate));
    while (d <= lEnd) {
      leaveMap.set(`${uid}_${d.toDateString()}`, l);
      d.setDate(d.getDate() + 1);
    }
  });

  const formattedAttendances = attendances.map(a => {
    const record = a.toObject() as any;
    const uid = record.userId.toString();
    const dateStr = getISTDate(new Date(record.date)).toDateString();
    
    // Fix hours
    if (record.punchInTime && record.punchOutTime) {
      const diffMs = new Date(record.punchOutTime).getTime() - new Date(record.punchInTime).getTime();
      record.workingHours = Math.max(0, (diffMs / 60000 - (record.breakDuration || 0)) / 60);
    }

    // Apply leave tag
    const leave = leaveMap.get(`${uid}_${dateStr}`);
    if (leave) {
      record.status = leave.isHalfDay ? `HALF_DAY (${leave.leaveType})` : leave.leaveType;
    }

    record.isExtraDay = (record.status === AttendanceStatus.PRESENT || record.status === AttendanceStatus.WORK_FROM_HOME || (record.workingHours || 0) > 0) &&
                        (new Date(record.date).getDay() === 0 || record.status === AttendanceStatus.HOLIDAY);

    return record;
  });

  return { attendances: formattedAttendances, teamMembers };
}

/**
 * Get Today's Attendance Status
 */
export async function getTodayAttendance(userId: string) {
  const today = new Date();

  // First, look for an active session from the last 15 hours
  const activeSession = await Attendance.findOne({
    userId,
    punchOutTime: { $exists: false },
    punchInTime: {
      $gte: new Date(today.getTime() - 15 * 60 * 60 * 1000)
    }
  }).sort({ punchInTime: -1 });

  if (activeSession) {
    return activeSession;
  }

  // Fallback to today's date
  const attendance = await Attendance.findOne({
    userId,
    date: {
      $gte: getISTStartOfDay(today),
      $lte: getISTEndOfDay(today),
    },
  });

  return attendance;
}

/**
 * Request Attendance Correction
 */
export async function requestAttendanceCorrection(
  userId: string,
  attendanceId: string | undefined, // Can be undefined for missing records
  reason: string,
  date: string,
  requestedPunchIn?: string,
  requestedPunchOut?: string
) {
  // Validate requested times
  if (requestedPunchIn && requestedPunchOut) {
    if (new Date(requestedPunchOut) <= new Date(requestedPunchIn)) {
      throw new Error("Requested Punch Out time must be after the Punch In time.");
    }
  }
  // Ensure attendanceId is a valid MongoDB ObjectId. 
  // Virtual IDs (e.g., vabsent_...) are strings used for UI rows that don't have DB records yet.
  const isValidObjectId = attendanceId && mongoose.Types.ObjectId.isValid(attendanceId);
  const sanitizedAttendanceId = isValidObjectId ? attendanceId : undefined;

  // Prevent correction requests for dates with approved leave (Anti-fraud)
  const targetDate = new Date(date);
  const approvedLeave = await Leave.findOne({
    userId,
    status: LeaveStatus.APPROVED,
    startDate: { $lte: targetDate },
    endDate: { $gte: getISTStartOfDay(targetDate) },
    leaveType: { $nin: [LeaveType.WORK_FROM_HOME] }
  });

  if (approvedLeave) {
    throw new Error(`Cannot request correction for ${format(targetDate, "MMM d, yyyy")} as you have an approved ${approvedLeave.leaveType} leave for this date.`);
  }

  const correction = await AttendanceCorrection.create({
    userId,
    attendanceId: sanitizedAttendanceId,
    date: new Date(date),
    requestedPunchIn: requestedPunchIn ? new Date(requestedPunchIn) : undefined,
    requestedPunchOut: requestedPunchOut ? new Date(requestedPunchOut) : undefined,
    reason,
    status: CorrectionStatus.PENDING,
  });

  // Notify manager
  const user = await User.findById(userId);
  if (user && user.managerId) {
    await createNotification({
      userId: user.managerId.toString(),
      type: NotificationType.CORRECTION_REQUESTED,
      title: "Attendance Correction Requested",
      message: `${user.fullName} requested an attendance correction for ${format(new Date(date), "MMM d, yyyy")}`,
      link: "/attendance/corrections",
    });
  }

  return correction;
}

/**
 * Get Correction Requests (Admin/Manager)
 */
export async function getCorrectionRequests(status?: CorrectionStatus, userId?: string) {
  const query: any = {};
  if (status) query.status = status;
  if (userId) query.userId = userId;

  return await AttendanceCorrection.find(query)
    .populate("userId", "fullName designation employeeId")
    .sort({ createdAt: -1 });
}

/**
 * Handle Correction Request (Approve/Reject)
 */
export async function handleCorrectionApproval(
  correctionId: string,
  approverId: string,
  status: CorrectionStatus,
  adminNotes?: string
) {
  const correction = await AttendanceCorrection.findById(correctionId);
  if (!correction) throw new Error("Correction request not found");

  // Security Check: Ensure approver is Admin or the Employee's manager
  const approver = await User.findById(approverId);
  if (!approver) throw new Error("Approver not found");

  const employee = await User.findById(correction.userId);
  if (approver.role !== "ADMIN" && employee?.managerId?.toString() !== approverId.toString()) {
      throw new Error("Access Denied: You can only approve corrections for your own team members.");
  }

  if (correction.status !== CorrectionStatus.PENDING) {
    throw new Error("Request already processed");
  }

  correction.status = status;
  correction.approverId = new mongoose.Types.ObjectId(approverId);
  correction.adminNotes = adminNotes;
  await correction.save();

  // Notify employee
  const type = status === CorrectionStatus.APPROVED
    ? NotificationType.CORRECTION_APPROVED
    : NotificationType.CORRECTION_REJECTED;

  await createNotification({
    userId: correction.userId.toString(),
    type,
    title: `Attendance Correction ${status}`,
    message: `Your correction request for ${format(correction.date, "MMM d, yyyy")} has been ${status.toLowerCase()}.`,
    link: "/attendance",
  });

  // If approved, update the actual attendance record
  if (status === CorrectionStatus.APPROVED) {
    let attendance = correction.attendanceId
      ? await Attendance.findById(correction.attendanceId)
      : await Attendance.findOne({
        userId: correction.userId,
        date: {
          $gte: getISTStartOfDay(correction.date),
          $lte: getISTEndOfDay(correction.date)
        }
      });

    const punchInTime = correction.requestedPunchIn || (attendance?.punchInTime);
    const punchOutTime = correction.requestedPunchOut || (attendance?.punchOutTime);

    let totalHours = 0;
    let workingHours = 0;

    if (punchInTime && punchOutTime) {
      const diffMs = punchOutTime.getTime() - punchInTime.getTime();
      const totalMinutes = diffMs / (1000 * 60);
      totalHours = Math.max(0, totalMinutes / 60); // Hardened: Prevent negative total hours
      
      const breakDuration = attendance?.breakDuration || 0;
      workingHours = Math.max(0, (totalMinutes - breakDuration) / 60);
    }

    if (attendance) {
      attendance.punchInTime = punchInTime || attendance.punchInTime;
      attendance.punchOutTime = punchOutTime || attendance.punchOutTime;
      attendance.totalHours = totalHours || attendance.totalHours;
      attendance.workingHours = workingHours || attendance.workingHours;

      // Recalculate Late status if Punch In was changed
      if (punchInTime) {
        const shiftStartSetting = await Setting.findOne({ key: "SHIFT_START_TIME" });
        const graceSetting = await Setting.findOne({ key: "gracePeriod" });
        
        const [shiftH, shiftM] = (shiftStartSetting?.value || "10:00").split(":").map(Number);
        const graceMinutes = parseInt(graceSetting?.value || "15");

        const punchInDate = getISTDate(new Date(punchInTime));
        const shiftStartMinutes = (shiftH * 60) + shiftM;
        const lateThresholdMinutes = shiftStartMinutes + graceMinutes;
        
        const punchInMinutes = (punchInDate.getHours() * 60) + punchInDate.getMinutes();
        
        attendance.isLate = punchInMinutes > lateThresholdMinutes;
        attendance.lateMinutes = attendance.isLate ? (punchInMinutes - shiftStartMinutes) : 0;
      }

      await attendance.save();
    } else {
      // Recalculate Late status for new record
      let isLate = false;
      let lateMinutes = 0;
      
      if (punchInTime) {
        const shiftStartSetting = await Setting.findOne({ key: "SHIFT_START_TIME" });
        const graceSetting = await Setting.findOne({ key: "gracePeriod" });
        
        const [shiftH, shiftM] = (shiftStartSetting?.value || "10:00").split(":").map(Number);
        const graceMinutes = parseInt(graceSetting?.value || "15");

        const punchInDate = getISTDate(new Date(punchInTime));
        const shiftStartMinutes = (shiftH * 60) + shiftM;
        const lateThresholdMinutes = shiftStartMinutes + graceMinutes;
        
        const punchInMinutes = (punchInDate.getHours() * 60) + punchInDate.getMinutes();
        
        isLate = punchInMinutes > lateThresholdMinutes;
        lateMinutes = isLate ? (punchInMinutes - shiftStartMinutes) : 0;
      }

      // Create new record if it didn't exist
      await Attendance.create({
        userId: correction.userId.toString(),
        date: correction.date,
        punchInTime,
        punchOutTime,
        totalHours,
        workingHours,
        isLate,
        lateMinutes,
        status: AttendanceStatus.PRESENT,
      });
    }
  }

  return correction;
}
/**
 * Assign Work From Home (Admin/Manager)
 */
export async function assignWFH(
  userId: string,
  assignedBy: string,
  startDate: string,
  endDate: string,
  reason?: string
) {
  const assignment = await WFHAssignment.create({
    userId,
    assignedBy,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    reason,
    isActive: true,
  });

  // Notify employee
  await createNotification({
    userId,
    type: NotificationType.WFH_ASSIGNED,
    title: "WFH Authorized",
    message: `You have been authorized for Work From Home from ${format(new Date(startDate), "MMM d")} to ${format(new Date(endDate), "MMM d, yyyy")}`,
    link: "/attendance",
  });

  return assignment;
}

/**
 * Get WFH Assignments
 */
export async function getWFHAssignments(userId?: string) {
  const query: any = { isActive: true };
  if (userId) query.userId = userId;

  return await WFHAssignment.find(query)
    .populate("userId", "fullName designation employeeId")
    .populate("assignedBy", "fullName")
    .sort({ startDate: -1 });
}

/**
 * Deactivate WFH Assignment
 */
export async function deactivateWFH(assignmentId: string) {
  const assignment = await WFHAssignment.findByIdAndUpdate(
    assignmentId,
    { isActive: false },
    { new: true }
  );

  if (!assignment) throw new Error("WFH Assignment not found");
  return assignment;
}

/**
 * Get Overtime Records (for Employee and Admin)
 */
export async function getOvertimeRecords(
  userId: string,
  userRole: UserRole,
  filters: {
    employeeId?: string;
    startDate?: string;
    endDate?: string;
    month?: number;
    year?: number;
  }
) {
  const query: any = {
    $or: [
      { overtimeHours: { $gt: 0 } },
      { isOvertime: true },
    ],
  };

  if (userRole === UserRole.EMPLOYEE) {
    query.userId = new mongoose.Types.ObjectId(userId);
  } else if (filters.employeeId && filters.employeeId !== "all") {
    query.userId = new mongoose.Types.ObjectId(filters.employeeId);
  }

  if (filters.startDate || filters.endDate) {
    query.date = {};
    if (filters.startDate) query.date.$gte = getISTStartOfDay(new Date(filters.startDate));
    if (filters.endDate) query.date.$lte = getISTEndOfDay(new Date(filters.endDate));
  } else if (filters.month && filters.year) {
    const daysInMonth = new Date(filters.year, filters.month, 0).getDate();
    query.date = {
      $gte: getISTStartOfDay(new Date(filters.year, filters.month - 1, 1)),
      $lte: getISTEndOfDay(new Date(filters.year, filters.month - 1, daysInMonth)),
    };
  }

  const records = await Attendance.find(query)
    .sort({ date: -1 })
    .populate("user", "id fullName employeeId email designation department hourlyRate monthlySalary overtimeMultiplier employeeType")
    .lean();

  const totalOvertimeHours = records.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);

  return {
    records,
    totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
    totalRecords: records.length,
  };
}
