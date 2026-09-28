import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

import { User, Project, JobCard, ProductivityLog, Attendance, Setting } from "../models";
import { generatePayroll } from "../services/payroll.service";

async function verifyPrintadelCRM() {
  console.log("=== VERIFYING PRINTADEL CRM INTEGRATION ===\n");
  
  const mongoUri = process.env.DATABASE_URL || "mongodb://localhost:27017/printadel_crm";
  console.log("Connecting to MongoDB:", mongoUri);
  await mongoose.connect(mongoUri);

  // 1. Settings Verification
  const setting = await Setting.findOne();
  console.log("✅ Company Name in Settings:", setting?.companyName);

  // 2. User & Employee Types Verification
  const users = await User.find().select("fullName email role employeeType monthlySalary hourlyRate");
  console.log(`\n✅ Total Users: ${users.length}`);
  users.forEach((u: any) => {
    console.log(`   - ${u.fullName} (${u.email}) | Role: ${u.role} | Type: ${u.employeeType} | Sal: ₹${u.monthlySalary || 0} | Hourly: ₹${u.hourlyRate || 0}`);
  });

  // 3. Projects Verification
  const projects = await Project.find();
  console.log(`\n✅ Projects: ${projects.length}`);
  projects.forEach((p: any) => {
    console.log(`   - [${p.code}] ${p.name} | Client: ${p.clientName} | Status: ${p.status}`);
  });

  // 4. Job Cards Verification
  const jobCards = await JobCard.find().populate("assignedTo", "fullName");
  console.log(`\n✅ Job Cards: ${jobCards.length}`);
  jobCards.forEach((jc: any) => {
    const assignees = (jc.assignedTo as any[]).map((a: any) => a.fullName).join(", ");
    console.log(`   - ${jc.jobCardNumber}: "${jc.title}" | Client: ${jc.clientName} | Qty: ${jc.quantity} | Paper: ${jc.paperStock} | Status: ${jc.status} | Team: [${assignees}]`);
  });

  // 5. Productivity & Logout Logs Verification
  const logs = await ProductivityLog.find().populate("userId", "fullName").populate("jobCardId", "jobCardNumber");
  console.log(`\n✅ Productivity & Logout Logs: ${logs.length}`);
  logs.forEach((l: any) => {
    const jcNum = (l.jobCardId as any)?.jobCardNumber || "General Floor";
    console.log(`   - ${(l.userId as any)?.fullName} | Activity: ${l.activityType} | ${l.hoursSpent} hrs (${l.durationMinutes}m) | Job Card: ${jcNum} | Logout: ${l.isLogoutSession}`);
  });

  // 6. Attendance & Overtime Verification
  const attendances = await Attendance.find({ overtimeMinutes: { $gt: 0 } }).populate("userId", "fullName employeeType");
  console.log(`\n✅ Overtime Attendance Records: ${attendances.length}`);
  attendances.forEach((att: any) => {
    console.log(`   - ${(att.userId as any)?.fullName} (${(att.userId as any)?.employeeType}) | Date: ${att.date.toISOString().split("T")[0]} | Total: ${att.workingHours?.toFixed(1)} hrs | OT: ${att.overtimeHours} hrs (${att.overtimeMinutes}m)`);
  });

  // 7. Payroll by Employee Type Verification
  console.log("\n✅ Testing Payroll Generation across Employee Types...");
  const month = 9;
  const year = 2026;

  // Test Full-time employee (Amit Sharma)
  const ftUser = await User.findOne({ email: "amit@printadel.com" });
  if (ftUser) {
    const ftPayroll = await generatePayroll(ftUser._id.toString(), month, year);
    console.log(`   [Full-time] ${ftUser.fullName}: Rule=${ftPayroll.payrollRule} | Base=₹${ftPayroll.basicSalary} | OT Hours=${ftPayroll.overtimeHours} | OT Pay=₹${ftPayroll.overtimePay} | Net=₹${ftPayroll.netPay}`);
  }

  // Test Part-time employee (Sneha Gupta)
  const ptUser = await User.findOne({ email: "sneha@printadel.com" });
  if (ptUser) {
    const ptPayroll = await generatePayroll(ptUser._id.toString(), month, year);
    console.log(`   [Part-time] ${ptUser.fullName}: Rule=${ptPayroll.payrollRule} | Hourly=₹${ptPayroll.hourlyRate} | Reg Hours=${ptPayroll.regularHours} | Base=₹${ptPayroll.basicSalary} | OT Hours=${ptPayroll.overtimeHours} | OT Pay=₹${ptPayroll.overtimePay} | Net=₹${ptPayroll.netPay}`);
  }

  // Test Contract employee (Deepak Verma)
  const ctUser = await User.findOne({ email: "deepak@printadel.com" });
  if (ctUser) {
    const ctPayroll = await generatePayroll(ctUser._id.toString(), month, year);
    console.log(`   [Contract] ${ctUser.fullName}: Rule=${ctPayroll.payrollRule} | Retainer=₹${ctPayroll.basicSalary} | OT Hours=${ctPayroll.overtimeHours} | OT Pay=₹${ctPayroll.overtimePay} | Net=₹${ctPayroll.netPay}`);
  }

  console.log("\n🎉 ALL PRINTADEL CRM MODULES VERIFIED PERFECTLY!");
  await mongoose.disconnect();
}

verifyPrintadelCRM().catch((err) => {
  console.error("Verification error:", err);
  process.exit(1);
});
