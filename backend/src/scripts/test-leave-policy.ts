import mongoose from "mongoose";
import User, { UserRole } from "../models/User";
import Attendance, { AttendanceStatus } from "../models/Attendance";
import Leave, { LeaveType, LeaveStatus } from "../models/Leave";
import { calculatePayroll } from "../services/payroll.service";

function assertEqual(actual: any, expected: any, message: string) {
  if (actual === expected) {
    console.log(`  ✅ PASS: ${message} (Expected: ${expected}, Actual: ${actual})`);
  } else {
    console.error(`  ❌ FAIL: ${message} (Expected: ${expected}, Actual: ${actual})`);
    process.exit(1);
  }
}

async function runTests() {
  console.log("=== TESTING 1 PAID LEAVE POLICY (APPROVED & UNAPPROVED) ===\n");
  const mongoUri = process.env.DATABASE_URL || "mongodb://localhost:27017/printadel_crm";
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  console.log("Connected to MongoDB:", mongoUri);

  const testEmail = "test_leave_policy_worker@example.com";
  await User.deleteOne({ email: testEmail });
  const user = await User.create({
    email: testEmail,
    password: "dummy_password",
    fullName: "Leave Policy Test Worker",
    role: UserRole.EMPLOYEE,
    monthlySalary: 30000,
    employeeId: "LP-TEST-001",
    joinDate: new Date(2026, 0, 1),
    isActive: true,
  });

  const userId = user._id.toString();

  // Helper to clear leaves and attendance
  const clearRecords = async () => {
    await Leave.deleteMany({ userId: user._id });
    await Attendance.deleteMany({ userId: user._id });
  };

  try {

    // Helper: Mark all Mon-Sat working days present in Jan 2026 except specified leave dates
    const markAllWorkingDaysPresentExcept = async (excludedDayNumbers: number[]) => {
      const excludedSet = new Set(excludedDayNumbers);
      const docs: any[] = [];
      for (let d = 1; d <= 31; d++) {
        const dt = new Date(2026, 0, d);
        const dayOfWeek = dt.getDay(); // 0 = Sunday
        // Holidays: Jan 1 & Jan 26
        const isHol = d === 1 || d === 26;
        if (dayOfWeek !== 0 && !isHol && !excludedSet.has(d)) {
          docs.push({
            userId: user._id,
            date: dt,
            punchInTime: new Date(2026, 0, d, 9, 30),
            punchOutTime: new Date(2026, 0, d, 18, 30),
            workingHours: 9,
            status: AttendanceStatus.PRESENT,
          });
        }
      }
      if (docs.length > 0) {
        await Attendance.insertMany(docs);
      }
    };

    // TEST CASE 1: 1 Approved Leave (Jan 5)
    console.log("\n--- TEST CASE 1: 1 Approved Leave in Month ---");
    await clearRecords();
    await markAllWorkingDaysPresentExcept([5]);
    await Leave.create({
      userId: user._id,
      leaveType: LeaveType.CASUAL,
      startDate: new Date(2026, 0, 5),
      endDate: new Date(2026, 0, 5),
      days: 1,
      reason: "Family event",
      status: LeaveStatus.APPROVED,
    });

    const res1 = await calculatePayroll(userId, 1, 2026);
    assertEqual(res1.paidLeaveDays, 1, "TC 1 — Paid Leave Days should be 1");
    assertEqual(res1.absentDays, 0, "TC 1 — Absent Days should be 0 (no deduction)");
    assertEqual(res1.absentDeduction, 0, "TC 1 — Absent Deduction should be ₹0");
    assertEqual(res1.netPay, 30000, "TC 1 — Net Salary should be full ₹30,000");

    // TEST CASE 2: 2 Approved Leaves (Jan 5 & Jan 6)
    console.log("\n--- TEST CASE 2: 2 Approved Leaves in Month ---");
    await clearRecords();
    await markAllWorkingDaysPresentExcept([5, 6]);
    await Leave.create({
      userId: user._id,
      leaveType: LeaveType.CASUAL,
      startDate: new Date(2026, 0, 5),
      endDate: new Date(2026, 0, 6),
      days: 2,
      reason: "Travel",
      status: LeaveStatus.APPROVED,
    });

    const res2 = await calculatePayroll(userId, 1, 2026);
    assertEqual(res2.paidLeaveDays, 1, "TC 2 — Paid Leave Days should be 1");
    assertEqual(res2.unpaidLeaveDays, 1, "TC 2 — Unpaid Leave Days should be 1");
    assertEqual(res2.absentDays, 1, "TC 2 — Absent Days should be 1 (2nd leave deducted)");
    assertEqual(res2.absentDeduction, 1000, "TC 2 — Absent Deduction should be ₹1,000");
    assertEqual(res2.netPay, 29000, "TC 2 — Net Salary should be ₹29,000 (30,000 - 1,000)");

    // TEST CASE 3: 1 Unapproved/Pending Leave (Jan 5)
    console.log("\n--- TEST CASE 3: 1 Unapproved/Pending Leave ---");
    await clearRecords();
    await markAllWorkingDaysPresentExcept([5]);
    await Leave.create({
      userId: user._id,
      leaveType: LeaveType.SICK,
      startDate: new Date(2026, 0, 5),
      endDate: new Date(2026, 0, 5),
      days: 1,
      reason: "Not feeling well",
      status: LeaveStatus.PENDING, // unapproved
    });

    const res3 = await calculatePayroll(userId, 1, 2026);
    assertEqual(res3.paidLeaveDays, 1, "TC 3 — Paid Leave Days should be 1 (covered by 1 paid leave)");
    assertEqual(res3.absentDays, 0, "TC 3 — Absent Days should be 0 (no deduction for 1st unapproved leave)");
    assertEqual(res3.absentDeduction, 0, "TC 3 — Absent Deduction should be ₹0");
    assertEqual(res3.netPay, 30000, "TC 3 — Net Salary should be ₹30,000");

    // TEST CASE 4: 1 Approved Leave + 1 Unapproved Leave (Jan 5 & Jan 7)
    console.log("\n--- TEST CASE 4: 1 Approved + 1 Unapproved Leave ---");
    await clearRecords();
    await markAllWorkingDaysPresentExcept([5, 7]);
    await Leave.create({
      userId: user._id,
      leaveType: LeaveType.CASUAL,
      startDate: new Date(2026, 0, 5),
      endDate: new Date(2026, 0, 5),
      days: 1,
      reason: "Leave 1",
      status: LeaveStatus.APPROVED,
    });
    await Leave.create({
      userId: user._id,
      leaveType: LeaveType.SICK,
      startDate: new Date(2026, 0, 7),
      endDate: new Date(2026, 0, 7),
      days: 1,
      reason: "Leave 2",
      status: LeaveStatus.PENDING, // unapproved
    });

    const res4 = await calculatePayroll(userId, 1, 2026);
    assertEqual(res4.paidLeaveDays, 1, "TC 4 — Paid Leave Days should be 1");
    assertEqual(res4.absentDays, 1, "TC 4 — Absent Days should be 1 (2nd leave deducted)");
    assertEqual(res4.absentDeduction, 1000, "TC 4 — Absent Deduction should be ₹1,000");
    assertEqual(res4.netPay, 29000, "TC 4 — Net Salary should be ₹29,000");

    // TEST CASE 5: 3 Leaves (Jan 5, Jan 6, Jan 7)
    console.log("\n--- TEST CASE 5: 3 Leaves in Month ---");
    await clearRecords();
    await markAllWorkingDaysPresentExcept([5, 6, 7]);
    await Leave.create({
      userId: user._id,
      leaveType: LeaveType.VACATION,
      startDate: new Date(2026, 0, 5),
      endDate: new Date(2026, 0, 7),
      days: 3,
      reason: "Vacation",
      status: LeaveStatus.APPROVED,
    });

    const res5 = await calculatePayroll(userId, 1, 2026);
    assertEqual(res5.paidLeaveDays, 1, "TC 5 — Paid Leave Days should be 1");
    assertEqual(res5.unpaidLeaveDays, 2, "TC 5 — Unpaid Leave Days should be 2");
    assertEqual(res5.absentDays, 2, "TC 5 — Absent Days should be 2 (exceeds 1 paid leave by 2)");
    assertEqual(res5.absentDeduction, 2000, "TC 5 — Absent Deduction should be ₹2,000");
    assertEqual(res5.netPay, 28000, "TC 5 — Net Salary should be ₹28,000 (30,000 - 2,000)");

    // TEST CASE 6: 0 Leaves, 0 Absences (Full Attendance)
    console.log("\n--- TEST CASE 6: 0 Leaves, 0 Absences (Full Attendance) ---");
    await clearRecords();
    await markAllWorkingDaysPresentExcept([]);

    const res6 = await calculatePayroll(userId, 1, 2026);
    assertEqual(res6.paidLeaveDays, 0, "TC 6 — Paid Leave Days should be 0 when no leave taken");
    assertEqual(res6.absentDays, 0, "TC 6 — Absent Days should be 0");
    assertEqual(res6.absentDeduction, 0, "TC 6 — Absent Deduction should be ₹0");
    assertEqual(res6.netPay, 30000, "TC 6 — Net Salary should be exactly basic salary (no extra bonus added)");

    // TEST CASE 7: 2 Absences in Month (Jan 5 & Jan 6 marked ABSENT)
    console.log("\n--- TEST CASE 7: 2 Absences in Month ---");
    await clearRecords();
    await markAllWorkingDaysPresentExcept([5, 6]);
    await Attendance.create({
      userId: user._id,
      date: new Date(2026, 0, 5),
      status: AttendanceStatus.ABSENT,
      workingHours: 0,
    });
    await Attendance.create({
      userId: user._id,
      date: new Date(2026, 0, 6),
      status: AttendanceStatus.ABSENT,
      workingHours: 0,
    });

    const res7 = await calculatePayroll(userId, 1, 2026);
    assertEqual(res7.paidLeaveDays, 1, "TC 7 — Paid Leave Days should be 1");
    assertEqual(res7.absentDays, 1, "TC 7 — Absent Days should be 1 (only 1 day deducted for 2 absences)");
    assertEqual(res7.absentDeduction, 1000, "TC 7 — Absent Deduction should be ₹1,000");
    assertEqual(res7.netPay, 29000, "TC 7 — Net Salary should be ₹29,000 (30,000 - 1,000)");

    console.log("\n🎉 ALL 7 LEAVE POLICY TEST CASES PASSED PERFECTLY! 🎉\n");
  } finally {
    await clearRecords();
    await User.deleteOne({ _id: user._id });
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
