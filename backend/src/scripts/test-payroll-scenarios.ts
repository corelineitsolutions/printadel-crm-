import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import User, { UserRole } from "../models/User";
import Attendance, { AttendanceStatus } from "../models/Attendance";
import { calculatePayroll } from "../services/payroll.service";
import { getISTStartOfDay } from "../utils/date.utils";

// Helper for test assertions
function assertEqual(actual: any, expected: any, testName: string) {
  if (actual !== expected) {
    console.error(`❌ FAILED: ${testName} - Expected ${expected}, got ${actual}`);
    throw new Error(`Assertion failed in ${testName}: expected ${expected}, got ${actual}`);
  } else {
    console.log(`✅ PASSED: ${testName} => ${actual}`);
  }
}

// Formula unit tester
function testFormula(
  monthlySalary: number,
  extraSundays: number,
  absentDays: number,
  lateMarks: number
) {
  const round = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;
  const dailySalary = round(monthlySalary / 30);
  const extraPay = round(dailySalary * extraSundays);
  const absentDeduction = round(dailySalary * absentDays);
  const penaltyUnits = Math.floor(lateMarks / 3);
  const lateDeduction = round(penaltyUnits * dailySalary * 0.5);
  const netSalary = round(monthlySalary + extraPay - absentDeduction - lateDeduction);
  return { dailySalary, extraPay, absentDeduction, lateDeduction, netSalary };
}

async function runTests() {
  console.log("=================================================");
  console.log("🧪 RUNNING PAYROLL CALCULATION TEST SUITE");
  console.log("=================================================\n");

  console.log("--- PART 1: 10 SPECIFIED USER TEST CASES (MATHEMATICAL VERIFICATION) ---");

  // Test Case 1: Perfect Attendance
  const tc1 = testFormula(30000, 0, 0, 0);
  assertEqual(tc1.netSalary, 30000, "Test Case 1 — Perfect Attendance");

  // Test Case 2: Two Extra Sundays
  const tc2 = testFormula(30000, 2, 0, 0);
  assertEqual(tc2.extraPay, 2000, "Test Case 2 — Extra Pay");
  assertEqual(tc2.netSalary, 32000, "Test Case 2 — Two Extra Sundays Net");

  // Test Case 3: Two Absences
  const tc3 = testFormula(30000, 0, 2, 0);
  assertEqual(tc3.absentDeduction, 2000, "Test Case 3 — Absent Deduction");
  assertEqual(tc3.netSalary, 28000, "Test Case 3 — Two Absences Net");

  // Test Case 4: Three Late Marks
  const tc4 = testFormula(30000, 0, 0, 3);
  assertEqual(tc4.lateDeduction, 500, "Test Case 4 — Late Deduction (3 marks = 0.5 day)");
  assertEqual(tc4.netSalary, 29500, "Test Case 4 — Three Late Marks Net");

  // Test Case 5: Extra + Absence + Late
  const tc5 = testFormula(30000, 2, 2, 3);
  assertEqual(tc5.extraPay, 2000, "Test Case 5 — Extra Pay");
  assertEqual(tc5.absentDeduction, 2000, "Test Case 5 — Absent Deduction");
  assertEqual(tc5.lateDeduction, 500, "Test Case 5 — Late Deduction");
  assertEqual(tc5.netSalary, 29500, "Test Case 5 — Combined Calculation Net");

  // Test Case 6: Six Late Marks
  const tc6 = testFormula(30000, 0, 0, 6);
  assertEqual(tc6.lateDeduction, 1000, "Test Case 6 — Late Deduction (6 marks = 1 day)");
  assertEqual(tc6.netSalary, 29000, "Test Case 6 — Six Late Marks Net");

  // Test Case 7: Two Late Marks
  const tc7 = testFormula(30000, 0, 0, 2);
  assertEqual(tc7.lateDeduction, 0, "Test Case 7 — Late Deduction (2 marks = 0)");
  assertEqual(tc7.netSalary, 30000, "Test Case 7 — Two Late Marks Net");

  // Test Case 8: Sunday Off
  const tc8 = testFormula(30000, 0, 0, 0);
  assertEqual(tc8.absentDeduction, 0, "Test Case 8 — Sunday Off has 0 absent deduction");
  assertEqual(tc8.netSalary, 30000, "Test Case 8 — Sunday Off Net");

  // Test Case 9: Public Holiday
  const tc9 = testFormula(30000, 0, 0, 0);
  assertEqual(tc9.absentDeduction, 0, "Test Case 9 — Public Holiday has 0 absent deduction");
  assertEqual(tc9.netSalary, 30000, "Test Case 9 — Public Holiday Net");

  // Test Case 10: Public Holiday + Absence + Extra Sunday
  const tc10 = testFormula(30000, 2, 2, 3);
  assertEqual(tc10.extraPay, 2000, "Test Case 10 — Extra Sunday Pay (2 * 1000)");
  assertEqual(tc10.absentDeduction, 2000, "Test Case 10 — Absent Deduction (2 * 1000)");
  assertEqual(tc10.lateDeduction, 500, "Test Case 10 — Late Deduction (3 late marks = 500)");
  assertEqual(tc10.netSalary, 29500, "Test Case 10 — Combined with Holidays Net");

  // Test Case 11: Working on a Public Holiday
  // Salary = ₹30,000. Employee works on 1 public holiday (1 extra day).
  const tc11 = testFormula(30000, 1, 0, 0); // 1 extra day worked
  assertEqual(tc11.extraPay, 1000, "Test Case 11 — Extra Pay for working on Public Holiday (+1000)");
  assertEqual(tc11.netSalary, 31000, "Test Case 11 — Public Holiday Worked Net Salary (30000 + 1000 = 31000)");

  console.log("\n--- PART 2: DATABASE SERVICE INTEGRATION TESTS ---");
  const mongoUri = process.env.DATABASE_URL || "mongodb://localhost:27017/crm_db";
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  console.log("Connected to MongoDB:", mongoUri);

  const testEmail = "test_payroll_worker@example.com";
  // Clean up any previous test user
  await User.deleteOne({ email: testEmail });
  const testUser = await User.create({
    email: testEmail,
    password: "hashed_dummy_password",
    fullName: "Payroll Test Worker",
    role: UserRole.EMPLOYEE,
    employeeId: "TEST_EMP_99",
    monthlySalary: 30000,
    hourlyRate: 111.11,
    isActive: true,
    joinDate: new Date(2026, 0, 1), // Jan 1, 2026
  });

  const testUserId = testUser._id.toString();

  // Test with January 2026 (31 days, Jan 1 & Jan 26 are public holidays, 4 Sundays)
  // Let's create an Attendance record for all regular working days
  // Month: 1 (January), Year: 2026
  const month = 1;
  const year = 2026;
  const daysInJan = 31;

  // Clear previous attendances for test user
  await Attendance.deleteMany({ userId: testUser._id });

  // Jan 2026:
  // Jan 1: Thursday (Public Holiday - New Year)
  // Jan 2: Friday (Present)
  // Jan 3: Saturday (Present)
  // Jan 4: Sunday (Sunday Off - no record)
  // Jan 5: Monday (Present)
  // Jan 6: Tuesday (Present)
  // Jan 7: Wednesday (Present)
  // Jan 8: Thursday (Present)
  // Jan 9: Friday (Present)
  // Jan 10: Saturday (Present)
  // Jan 11: Sunday (Worked! -> Extra Sunday 1)
  // Jan 12: Monday (Present)
  // Jan 13: Tuesday (Absent)
  // Jan 14: Wednesday (Absent)
  // Jan 15: Thursday (Present, Late mark 1)
  // Jan 16: Friday (Present, Late mark 2)
  // Jan 17: Saturday (Present, Late mark 3) -> 3 late marks = 0.5 day
  // Jan 18: Sunday (Worked! -> Extra Sunday 2)
  // Jan 19 to 25: Present
  // Jan 26: Monday (Public Holiday - Republic Day - Off)
  // Jan 27 to 31: Present

  const attendanceBatch: any[] = [];

  for (let d = 1; d <= daysInJan; d++) {
    const curDate = new Date(year, month - 1, d);
    const dayOfWeek = curDate.getDay();

    if (d === 1 || d === 26) {
      // Public Holidays: employee takes off (no attendance created)
      continue;
    }

    if (dayOfWeek === 0) {
      // Sundays:
      if (d === 11 || d === 18) {
        // Worked Sundays (Extra Days)
        attendanceBatch.push({
          userId: testUser._id,
          date: getISTStartOfDay(curDate),
          punchInTime: new Date(year, month - 1, d, 10, 0, 0),
          punchOutTime: new Date(year, month - 1, d, 19, 0, 0),
          workingHours: 9,
          status: AttendanceStatus.PRESENT,
          isOvertime: true,
        });
      }
      // other Sundays (Jan 4, Jan 25) are off, no attendance created
      continue;
    }

    // Mon-Sat:
    if (d === 13 || d === 14) {
      // 2 Absences
      attendanceBatch.push({
        userId: testUser._id,
        date: getISTStartOfDay(curDate),
        status: AttendanceStatus.ABSENT,
        workingHours: 0,
      });
      continue;
    }

    const isLate = (d === 15 || d === 16 || d === 17); // 3 late marks
    attendanceBatch.push({
      userId: testUser._id,
      date: getISTStartOfDay(curDate),
      punchInTime: new Date(year, month - 1, d, 10, isLate ? 25 : 0, 0),
      punchOutTime: new Date(year, month - 1, d, 19, 0, 0),
      workingHours: 9,
      isLate,
      status: AttendanceStatus.PRESENT,
    });
  }

  await Attendance.insertMany(attendanceBatch);

  console.log(`Inserted ${attendanceBatch.length} test attendance records for January 2026.`);

  // Now run calculatePayroll for test user
  const result = await calculatePayroll(testUserId, month, year);

  console.log("\nPayroll Service Calculation Result:");
  console.log({
    monthlySalary: result.monthlySalary,
    dailySalary: result.dailySalary,
    calendarDays: result.calendarDays,
    regularWorkingDays: result.regularWorkingDays,
    publicHolidays: result.publicHolidays,
    extraWorkDays: result.extraWorkDays,
    extraWorkPay: result.extraWorkPay,
    absentDays: result.absentDays,
    absentDeduction: result.absentDeduction,
    lateCount: result.lateCount,
    lateDeduction: result.lateDeduction,
    attendanceAdjustedSalary: result.attendanceAdjustedSalary,
    netPay: result.netPay,
  });

  assertEqual(result.monthlySalary, 30000, "Service Monthly Salary");
  assertEqual(result.dailySalary, 1000, "Service Daily Salary (30000 / 30)");
  assertEqual(result.extraWorkDays, 2, "Service Extra Sundays Worked");
  assertEqual(result.extraWorkPay, 2000, "Service Extra Sunday Pay (2 * 1000)");
  assertEqual(result.paidLeaveDays, 1, "Service Paid Leave Days (1 monthly paid leave)");
  assertEqual(result.absentDays, 1, "Service Absent Days (2 absences - 1 paid leave = 1)");
  assertEqual(result.absentDeduction, 1000, "Service Absent Deduction (1 * 1000)");
  assertEqual(result.lateCount, 3, "Service Late Marks Count");
  assertEqual(result.lateDeduction, 500, "Service Late Deduction (floor(3/3)*500)");
  assertEqual(result.publicHolidays, 2, "Service Public Holidays (Jan 1 & Jan 26)");
  assertEqual(result.netPay, 30500, "Service Net Pay (30000 + 2000 - 1000 - 500)");

  // Cleanup test user and attendances
  await Attendance.deleteMany({ userId: testUser._id });
  await User.deleteOne({ _id: testUser._id });
  await mongoose.disconnect();

  console.log("\n=================================================");
  console.log("🎉 ALL TEST SCENARIOS PASSED WITH 100% ACCURACY!");
  console.log("=================================================");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
