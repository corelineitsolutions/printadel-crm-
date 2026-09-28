import mongoose from "mongoose";
import dotenv from "dotenv";
import User, { UserRole, EmployeeType } from "../models/User";
import Project, { ProjectStatus } from "../models/Project";
import ProjectMember from "../models/ProjectMember";
import Milestone from "../models/Milestone";
import Task from "../models/Task";
import Leave from "../models/Leave";
import Attendance, { AttendanceStatus } from "../models/Attendance";
import Payroll, { PayrollStatus } from "../models/Payroll";
import TaskTimer from "../models/TaskTimer";
import TaskComment from "../models/TaskComment";
import Subtask from "../models/Subtask";
import Setting from "../models/Setting";
import AttendanceCorrection from "../models/AttendanceCorrection";
import WFHAssignment from "../models/WFHAssignment";
import JobCard, { JobCardStatus, JobCardPriority } from "../models/JobCard";
import ProductivityLog from "../models/ProductivityLog";

dotenv.config();

const DEFAULT_PASSWORD = "123456";

export async function seedDatabase() {
  try {
    console.log("🔌 Connecting to MongoDB for Printadel CRM...");
    const mongoUri =
      process.env.DATABASE_URL ||
      process.env.MONGODB_URI ||
      "mongodb://localhost:27017/printadel_crm";
    await mongoose.connect(mongoUri);
    console.log(`✅ Connected to MongoDB (${mongoUri})\n`);

    // ==================== CLEAR ALL EXISTING DATA ====================
    console.log("🗑️  Clearing all existing collections for clean Printadel setup...");
    await Promise.all([
      User.deleteMany({}),
      Project.deleteMany({}),
      ProjectMember.deleteMany({}),
      Milestone.deleteMany({}),
      Task.deleteMany({}),
      Leave.deleteMany({}),
      Attendance.deleteMany({}),
      Payroll.deleteMany({}),
      TaskTimer.deleteMany({}),
      TaskComment.deleteMany({}),
      Subtask.deleteMany({}),
      Setting.deleteMany({}),
      AttendanceCorrection.deleteMany({}),
      WFHAssignment.deleteMany({}),
      JobCard.deleteMany({}),
      ProductivityLog.deleteMany({}),
    ]);
    console.log("✅ All collections wiped cleanly.\n");

    // ==================== CREATE SETTINGS ====================
    console.log("⚙️  Creating Printadel company settings...");
    await Setting.insertMany([
      { key: "companyName", value: "Printadel" },
      { key: "companyEmail", value: "contact@printadel.com" },
      { key: "companyAddress", value: "Plot 42, Print & Packaging Industrial Hub, Pune, Maharashtra 411001" },
      { key: "companyPhone", value: "+91 98765 43210" },
      { key: "companyWebsite", value: "https://printadel.com" },
      { key: "dailyHours", value: "9" },
      { key: "weeklyHours", value: "45" },
      { key: "overtimeMultiplier", value: "1.5" },
      { key: "breakDuration", value: "60" },
      { key: "gracePeriod", value: "15" },
      { key: "defaultHourlyRate", value: "130" },
      { key: "payrollDay", value: "25" },
      { key: "taxRate", value: "0" },
      { key: "fromEmail", value: "notifications@printadel.com" },
      { key: "SHIFT_START_TIME", value: "10:00" },
    ]);
    console.log("✅ Printadel company settings initialized\n");

    // ==================== CREATE USERS ====================
    console.log("👥 Creating Printadel team members...");

    // 1. Admin
    const admin = await User.create({
      email: "admin@printadel.com",
      password: DEFAULT_PASSWORD,
      fullName: "Printadel Admin",
      role: UserRole.ADMIN,
      employeeType: EmployeeType.FULL_TIME,
      employeeId: "PRT-001",
      designation: "Managing Director",
      department: "Management",
      monthlySalary: 85000,
      hourlyRate: 315,
      overtimeMultiplier: 1.5,
      joinDate: new Date("2024-01-01"),
      isActive: true,
      phone: "+91 98765 00001",
    });

    // 2. Production Manager
    const manager = await User.create({
      email: "manager@printadel.com",
      password: DEFAULT_PASSWORD,
      fullName: "Rahul Sharma",
      role: UserRole.MANAGER,
      employeeType: EmployeeType.FULL_TIME,
      employeeId: "PRT-002",
      designation: "Production & Plant Manager",
      department: "Operations",
      monthlySalary: 55000,
      hourlyRate: 204,
      overtimeMultiplier: 1.5,
      managerId: admin._id,
      joinDate: new Date("2024-01-15"),
      isActive: true,
      phone: "+91 98765 00002",
    });

    // 3. Full-time Employees
    const emp1 = await User.create({
      email: "amit@printadel.com",
      password: DEFAULT_PASSWORD,
      fullName: "Amit Verma",
      role: UserRole.EMPLOYEE,
      employeeType: EmployeeType.FULL_TIME,
      employeeId: "PRT-101",
      designation: "Pre-press & Design Specialist",
      department: "Design & Prepress",
      monthlySalary: 35000,
      hourlyRate: 130,
      overtimeMultiplier: 1.5,
      managerId: manager._id,
      joinDate: new Date("2024-02-01"),
      isActive: true,
      phone: "+91 98765 00101",
    });

    const emp2 = await User.create({
      email: "priya@printadel.com",
      password: DEFAULT_PASSWORD,
      fullName: "Priya Nair",
      role: UserRole.EMPLOYEE,
      employeeType: EmployeeType.FULL_TIME,
      employeeId: "PRT-102",
      designation: "Senior Offset Press Operator",
      department: "Printing Press",
      monthlySalary: 32000,
      hourlyRate: 119,
      overtimeMultiplier: 1.5,
      managerId: manager._id,
      joinDate: new Date("2024-02-15"),
      isActive: true,
      phone: "+91 98765 00102",
    });

    const emp3 = await User.create({
      email: "vikas@printadel.com",
      password: DEFAULT_PASSWORD,
      fullName: "Vikas Patil",
      role: UserRole.EMPLOYEE,
      employeeType: EmployeeType.FULL_TIME,
      employeeId: "PRT-103",
      designation: "Die-Cutting & Lamination Lead",
      department: "Finishing & Binding",
      monthlySalary: 28000,
      hourlyRate: 104,
      overtimeMultiplier: 1.5,
      managerId: manager._id,
      joinDate: new Date("2024-03-01"),
      isActive: true,
      phone: "+91 98765 00103",
    });

    // 4. Part-time Employees
    const emp4 = await User.create({
      email: "sneha@printadel.com",
      password: DEFAULT_PASSWORD,
      fullName: "Sneha Kulkarni",
      role: UserRole.EMPLOYEE,
      employeeType: EmployeeType.PART_TIME,
      employeeId: "PRT-201",
      designation: "Junior Graphic Designer",
      department: "Design & Prepress",
      monthlySalary: 18000,
      hourlyRate: 150,
      overtimeMultiplier: 1.5,
      managerId: manager._id,
      joinDate: new Date("2024-04-01"),
      isActive: true,
      phone: "+91 98765 00201",
    });

    const emp5 = await User.create({
      email: "karan@printadel.com",
      password: DEFAULT_PASSWORD,
      fullName: "Karan Singh",
      role: UserRole.EMPLOYEE,
      employeeType: EmployeeType.PART_TIME,
      employeeId: "PRT-202",
      designation: "Packaging & Dispatch Associate",
      department: "Logistics & Delivery",
      monthlySalary: 15000,
      hourlyRate: 125,
      overtimeMultiplier: 1.5,
      managerId: manager._id,
      joinDate: new Date("2024-04-15"),
      isActive: true,
      phone: "+91 98765 00202",
    });

    // 5. Contract Employee
    const emp6 = await User.create({
      email: "deepak@printadel.com",
      password: DEFAULT_PASSWORD,
      fullName: "Deepak Shinde",
      role: UserRole.EMPLOYEE,
      employeeType: EmployeeType.CONTRACT,
      employeeId: "PRT-301",
      designation: "Specialized UV Coating & Foil Stamping Expert",
      department: "Finishing & Binding",
      monthlySalary: 40000,
      hourlyRate: 200,
      overtimeMultiplier: 1.5,
      managerId: manager._id,
      joinDate: new Date("2024-05-01"),
      isActive: true,
      phone: "+91 98765 00301",
    });

    const allEmployees = [emp1, emp2, emp3, emp4, emp5, emp6];
    console.log(`✅ Created 8 users (1 Admin, 1 Manager, 6 Employees: 3 Full-time, 2 Part-time, 1 Contract)\n`);

    // ==================== CREATE PROJECTS ====================
    console.log("📁 Creating Printadel projects...");

    const project1 = await Project.create({
      name: "Corporate Stationery & Annual Report Print Line",
      code: "PRT-001",
      description: "High-volume corporate letterheads, annual financial report booklets, presentation folders, and embossed envelopes.",
      clientName: "Tata Motors Suppliers Ltd",
      clientEmail: "procurement@tatamotors-supp.com",
      startDate: new Date("2024-08-01"),
      deadline: new Date("2024-11-30"),
      budget: 180000,
      status: ProjectStatus.IN_PROGRESS,
      creator: manager._id,
    });

    await ProjectMember.insertMany([
      { projectId: project1._id, userId: manager._id, role: "Production Lead" },
      { projectId: project1._id, userId: emp1._id, role: "Prepress Designer" },
      { projectId: project1._id, userId: emp2._id, role: "Lead Printer" },
      { projectId: project1._id, userId: emp3._id, role: "Finishing Lead" },
    ]);

    const project2 = await Project.create({
      name: "FMCG Eco-Friendly Product Packaging Boxes",
      code: "PKG-002",
      description: "Custom die-cut rigid corrugated boxes, kraft mono cartons with gold foil stamping, and tamper-proof food seal labels.",
      clientName: "GreenLeaf Organic Foods",
      clientEmail: "ops@greenleaforganic.com",
      startDate: new Date("2024-08-15"),
      deadline: new Date("2024-12-15"),
      budget: 350000,
      status: ProjectStatus.IN_PROGRESS,
      creator: manager._id,
    });

    await ProjectMember.insertMany([
      { projectId: project2._id, userId: manager._id, role: "Production Lead" },
      { projectId: project2._id, userId: emp3._id, role: "Die Cutter" },
      { projectId: project2._id, userId: emp6._id, role: "Specialty Foil Finisher" },
      { projectId: project2._id, userId: emp5._id, role: "Packaging Coordinator" },
    ]);

    const project3 = await Project.create({
      name: "Luxury Gold Foil Brochures & Invitation Suites",
      code: "BRC-003",
      description: "Velvet soft-touch tri-fold marketing brochures with raised 3D gold foil and heavy textured cardstock.",
      clientName: "Prestige Real Estate Developers",
      clientEmail: "marketing@prestigedevelopers.in",
      startDate: new Date("2024-09-01"),
      deadline: new Date("2024-10-31"),
      budget: 120000,
      status: ProjectStatus.PLANNING,
      creator: manager._id,
    });

    await ProjectMember.insertMany([
      { projectId: project3._id, userId: manager._id, role: "Production Lead" },
      { projectId: project3._id, userId: emp1._id, role: "Design Lead" },
      { projectId: project3._id, userId: emp4._id, role: "Artwork Assistant" },
    ]);

    console.log("✅ Created 3 Printadel printing and packaging projects\n");

    // ==================== CREATE JOB CARDS ====================
    console.log("🖨️  Creating Printadel Job Cards...");

    const jobCards = await JobCard.insertMany([
      {
        jobCardNumber: "JC-2026-0001",
        orderNumber: "ORD-9481",
        title: "5000 Matt Laminated Product Catalogs 300GSM",
        clientName: "Tata Motors Suppliers Ltd",
        clientPhone: "+91 98230 11223",
        clientEmail: "procurement@tatamotors-supp.com",
        description: "64-page product catalog, full color CMYK both sides, heavy cover.",
        specifications: "Inside: 170 GSM Gloss Art Paper. Cover: 300 GSM Art Board with Thermal Matt Lamination and Spot UV on title. Section sewn perfect binding.",
        paperStock: "300 GSM Imported Art Card",
        size: "A4 (210 x 297 mm)",
        quantity: 5000,
        finish: "Thermal Matt + Spot UV + Perfect Binding",
        priority: JobCardPriority.HIGH,
        status: JobCardStatus.PRINTING,
        assignedTo: [emp1._id, emp2._id],
        assignedBy: manager._id,
        projectId: project1._id,
        targetDeliveryDate: new Date(Date.now() + 5 * 86400000),
        estimatedHours: 24,
        actualHours: 14,
        statusHistory: [
          { status: JobCardStatus.PENDING, changedBy: manager._id, changedAt: new Date(Date.now() - 3 * 86400000), note: "Job card created" },
          { status: JobCardStatus.IN_PROGRESS, changedBy: emp1._id, changedAt: new Date(Date.now() - 2 * 86400000), note: "Pre-press file approved and plates generated" },
          { status: JobCardStatus.PRINTING, changedBy: emp2._id, changedAt: new Date(Date.now() - 1 * 86400000), note: "Offset 4-color press run started" },
        ],
      },
      {
        jobCardNumber: "JC-2026-0002",
        orderNumber: "ORD-9495",
        title: "10000 Rigid Kraft Gift Boxes with Custom Sleeve",
        clientName: "GreenLeaf Organic Foods",
        clientPhone: "+91 97654 33221",
        clientEmail: "ops@greenleaforganic.com",
        description: "Eco-friendly rigid two-piece boxes for organic food gift hampers.",
        specifications: "Base & Lid: 450 GSM Virgin Kraft Board with debossed logo. Sleeve: 250 GSM Recycled White Board with soy ink print.",
        paperStock: "450 GSM Virgin Kraft Board",
        size: "8 x 8 x 3 inches",
        quantity: 10000,
        finish: "Die Cutting + Debossing + Gold Foil",
        priority: JobCardPriority.URGENT,
        status: JobCardStatus.IN_PROGRESS,
        assignedTo: [emp3._id, emp6._id],
        assignedBy: manager._id,
        projectId: project2._id,
        targetDeliveryDate: new Date(Date.now() + 3 * 86400000),
        estimatedHours: 32,
        actualHours: 18,
        statusHistory: [
          { status: JobCardStatus.PENDING, changedBy: manager._id, changedAt: new Date(Date.now() - 2 * 86400000), note: "Order confirmed with GreenLeaf" },
          { status: JobCardStatus.IN_PROGRESS, changedBy: emp3._id, changedAt: new Date(Date.now() - 1 * 86400000), note: "Die creation complete, punching started" },
        ],
      },
      {
        jobCardNumber: "JC-2026-0003",
        orderNumber: "ORD-9502",
        title: "2500 Luxury Wedding Invites with Wax Seal",
        clientName: "Prestige Real Estate Developers",
        clientPhone: "+91 91234 56789",
        clientEmail: "marketing@prestigedevelopers.in",
        description: "Bespoke VIP real estate launch invitation suite.",
        specifications: "Main card: 350 GSM Textured Natural White Board with bevel gilded edges and multi-level blind emboss. Envelopes hand folded.",
        paperStock: "350 GSM Textured Cotton Board",
        size: "7 x 5 inches",
        quantity: 2500,
        finish: "Gold Foil + Emboss + Gilded Edges",
        priority: JobCardPriority.MEDIUM,
        status: JobCardStatus.QUALITY_CHECK,
        assignedTo: [emp1._id, emp3._id],
        assignedBy: manager._id,
        projectId: project3._id,
        targetDeliveryDate: new Date(Date.now() + 2 * 86400000),
        estimatedHours: 16,
        actualHours: 15,
        statusHistory: [
          { status: JobCardStatus.PENDING, changedBy: manager._id, changedAt: new Date(Date.now() - 4 * 86400000), note: "Client approved digital proof" },
          { status: JobCardStatus.IN_PROGRESS, changedBy: emp1._id, changedAt: new Date(Date.now() - 3 * 86400000), note: "Foil block mounted" },
          { status: JobCardStatus.PRINTING, changedBy: emp3._id, changedAt: new Date(Date.now() - 2 * 86400000), note: "Foil stamping completed" },
          { status: JobCardStatus.QUALITY_CHECK, changedBy: emp3._id, changedAt: new Date(Date.now() - 1 * 86400000), note: "Inspect edge gilding and registration" },
        ],
      },
      {
        jobCardNumber: "JC-2026-0004",
        orderNumber: "ORD-9510",
        title: "20000 Glossy Vinyl Stickers & Label Rolls",
        clientName: "Apex Beverages",
        clientPhone: "+91 94220 88990",
        clientEmail: "orders@apexbev.com",
        description: "Bottle labels on automated applicator rolls.",
        specifications: "Self-adhesive glossy white vinyl, water and oil resistant, core size 76mm, wound facing outward.",
        paperStock: "Waterproof Vinyl Roll",
        size: "3 x 3 inch circular",
        quantity: 20000,
        finish: "Gloss Lamination + Kiss Cut",
        priority: JobCardPriority.LOW,
        status: JobCardStatus.READY_FOR_DELIVERY,
        assignedTo: [emp2._id, emp5._id],
        assignedBy: manager._id,
        targetDeliveryDate: new Date(Date.now() + 1 * 86400000),
        estimatedHours: 12,
        actualHours: 11,
        statusHistory: [
          { status: JobCardStatus.PENDING, changedBy: manager._id, changedAt: new Date(Date.now() - 3 * 86400000), note: "Job scheduled" },
          { status: JobCardStatus.PRINTING, changedBy: emp2._id, changedAt: new Date(Date.now() - 2 * 86400000), note: "Rotary label press completed" },
          { status: JobCardStatus.QUALITY_CHECK, changedBy: emp5._id, changedAt: new Date(Date.now() - 1 * 86400000), note: "Roll count and tension checked" },
          { status: JobCardStatus.READY_FOR_DELIVERY, changedBy: emp5._id, changedAt: new Date(), note: "Boxed and labeled for courier pickup" },
        ],
      },
      {
        jobCardNumber: "JC-2026-0005",
        orderNumber: "ORD-9450",
        title: "1000 Premium UV Embossed Visiting Cards",
        clientName: "Nexus Tech Solutions",
        clientPhone: "+91 93210 44556",
        clientEmail: "admin@nexustech.io",
        description: "Executive visiting cards with velvet touch feel.",
        specifications: "400 GSM Velvet Board, Double sided CMYK + Raised Spot UV on logo and icons.",
        paperStock: "400 GSM Velvet Touch Board",
        size: "3.5 x 2 inches",
        quantity: 1000,
        finish: "Velvet Soft-Touch + Raised Spot UV",
        priority: JobCardPriority.HIGH,
        status: JobCardStatus.COMPLETED,
        assignedTo: [emp1._id, emp2._id],
        assignedBy: manager._id,
        targetDeliveryDate: new Date(Date.now() - 2 * 86400000),
        estimatedHours: 8,
        actualHours: 8,
        statusHistory: [
          { status: JobCardStatus.PENDING, changedBy: manager._id, changedAt: new Date(Date.now() - 5 * 86400000), note: "Order placed" },
          { status: JobCardStatus.PRINTING, changedBy: emp2._id, changedAt: new Date(Date.now() - 4 * 86400000), note: "Printed on digital press" },
          { status: JobCardStatus.COMPLETED, changedBy: emp1._id, changedAt: new Date(Date.now() - 2 * 86400000), note: "Delivered to client with acknowledgement" },
        ],
      },
    ]);

    console.log(`✅ Created ${jobCards.length} realistic Job Cards\n`);

    // ==================== CREATE LOGOUT PRODUCTIVITY LOGS ====================
    console.log("⏱️  Creating Logout Productivity & Activity tracking logs...");

    await ProductivityLog.insertMany([
      {
        userId: emp2._id,
        jobCardId: jobCards[0]._id,
        activityType: "Printing",
        durationMinutes: 180,
        hoursSpent: 3.0,
        notes: "Ran 2500 sheets of inner catalog pages on 4-color press, checked color density.",
        timestamp: new Date(Date.now() - 24 * 3600000),
        isLogoutSession: true,
      },
      {
        userId: emp1._id,
        jobCardId: jobCards[0]._id,
        activityType: "Design / Pre-press",
        durationMinutes: 120,
        hoursSpent: 2.0,
        notes: "Pre-flighted client PDF files, corrected bleeding margins and trapped spot colors.",
        timestamp: new Date(Date.now() - 26 * 3600000),
        isLogoutSession: true,
      },
      {
        userId: emp3._id,
        jobCardId: jobCards[1]._id,
        activityType: "Cutting & Finishing",
        durationMinutes: 240,
        hoursSpent: 4.0,
        notes: "Set up cutting die on automatic cylinder punch machine. Die-cut 4000 kraft box sheets.",
        timestamp: new Date(Date.now() - 20 * 3600000),
        isLogoutSession: true,
      },
      {
        userId: emp6._id,
        jobCardId: jobCards[1]._id,
        activityType: "Printing",
        durationMinutes: 150,
        hoursSpent: 2.5,
        notes: "Hot foil stamped 3000 boxes with metallic satin gold foil.",
        timestamp: new Date(Date.now() - 18 * 3600000),
        isLogoutSession: true,
      },
      {
        userId: emp5._id,
        jobCardId: jobCards[3]._id,
        activityType: "Packaging",
        durationMinutes: 90,
        hoursSpent: 1.5,
        notes: "Counted label rolls, shrink wrapped packs of 10 and packed in shipping cartons.",
        timestamp: new Date(Date.now() - 10 * 3600000),
        isLogoutSession: true,
      },
      {
        userId: emp5._id,
        jobCardId: jobCards[3]._id,
        activityType: "Delivery / Dispatch",
        durationMinutes: 60,
        hoursSpent: 1.0,
        notes: "Handed over 20 cartons to BlueDart courier, collected tracking receipt.",
        timestamp: new Date(Date.now() - 8 * 3600000),
        isLogoutSession: true,
      },
      {
        userId: emp4._id,
        jobCardId: jobCards[2]._id,
        activityType: "Design / Pre-press",
        durationMinutes: 120,
        hoursSpent: 2.0,
        notes: "Typeset guest names for luxury wedding suites and verified foil vector lines.",
        timestamp: new Date(Date.now() - 15 * 3600000),
        isLogoutSession: true,
      },
      {
        userId: emp2._id,
        activityType: "Machine Maintenance",
        durationMinutes: 60,
        hoursSpent: 1.0,
        notes: "Routine washup of ink rollers, blanket cylinder cleaning and lubrication.",
        timestamp: new Date(Date.now() - 6 * 3600000),
        isLogoutSession: true,
      },
    ]);

    console.log("✅ Created productivity logs\n");

    // ==================== CREATE ATTENDANCE WITH OVERTIME ====================
    console.log("⏰ Creating attendance with overtime records...");

    const today = new Date();
    // Seed the last 14 days of attendance
    for (let dayOffset = 14; dayOffset >= 0; dayOffset--) {
      const recordDate = new Date(today);
      recordDate.setDate(today.getDate() - dayOffset);
      recordDate.setHours(0, 0, 0, 0);

      const dayOfWeek = recordDate.getDay();
      const isSunday = dayOfWeek === 0;

      for (const employee of allEmployees) {
        if (isSunday) {
          // 25% chance of Sunday overtime shift for press operators / finishing
          if ((employee === emp2 || employee === emp3) && dayOffset % 7 === 0) {
            const punchIn = new Date(recordDate);
            punchIn.setHours(10, 0, 0, 0);
            const punchOut = new Date(recordDate);
            punchOut.setHours(18, 0, 0, 0);

            await Attendance.create({
              userId: employee._id,
              date: recordDate,
              punchInTime: punchIn,
              punchOutTime: punchOut,
              breakDuration: 45,
              totalHours: 8,
              workingHours: 7.25,
              isLate: false,
              isOvertime: true,
              overtimeHours: 7.25,
              status: AttendanceStatus.PRESENT,
              workSummary: "Special Sunday offset production run for Tata Motors catalogs.",
            });
          }
          continue;
        }

        // Regular workday
        const punchIn = new Date(recordDate);
        punchIn.setHours(9, 50, 0, 0);

        // Add 1.5 - 2.5 hours of overtime for full-time employees on select days
        const hasOvertime = (employee === emp2 || employee === emp3 || employee === emp6) && (dayOffset % 3 === 0);
        const outHour = hasOvertime ? 21 : (employee.employeeType === EmployeeType.PART_TIME ? 15 : 19);

        const punchOut = new Date(recordDate);
        punchOut.setHours(outHour, 30, 0, 0);

        const totalHours = outHour + 0.5 - 9.83;
        const breakDuration = 60;
        const workingHours = Math.round((totalHours - 1) * 100) / 100;
        const standardShift = employee.employeeType === EmployeeType.PART_TIME ? 4.5 : 9.0;
        const otHours = workingHours > standardShift ? Math.round((workingHours - standardShift) * 100) / 100 : 0;

        await Attendance.create({
          userId: employee._id,
          date: recordDate,
          punchInTime: punchIn,
          punchOutTime: punchOut,
          breakDuration,
          totalHours,
          workingHours,
          isLate: false,
          isOvertime: otHours > 0,
          overtimeHours: otHours,
          status: AttendanceStatus.PRESENT,
          workSummary: `Standard shift work on print jobs. Overtime: ${otHours} hours.`,
        });
      }
    }

    console.log("✅ Created attendance and overtime records\n");

    // ==================== CREATE SAMPLE PAYROLL ====================
    console.log("💰 Creating sample payroll records for current month...");
    const curMonth = today.getMonth() + 1;
    const curYear = today.getFullYear();

    // Generate sample payrolls demonstrating the 3 Employee Types:
    // Full-time (emp1)
    await Payroll.create({
      userId: emp1._id,
      month: curMonth,
      year: curYear,
      employeeType: "Full-time",
      payrollRule: "FULL_TIME_MONTHLY",
      basicSalary: 35000,
      monthlySalary: 35000,
      dailySalary: 1166.67,
      hourlyRate: 130,
      overtimeRate: 195,
      totalWorkingHours: 198,
      totalWorkingDays: 22,
      presentDays: 22,
      absentDays: 0,
      overtimeHours: 8,
      overtimePay: 1560,
      regularHours: 190,
      grossPay: 36560,
      deductions: 0,
      netPay: 36560,
      status: PayrollStatus.PROCESSED,
      processedBy: admin._id,
      processedAt: new Date(),
    });

    // Part-time (emp4)
    await Payroll.create({
      userId: emp4._id,
      month: curMonth,
      year: curYear,
      employeeType: "Part-time",
      payrollRule: "PART_TIME_HOURLY",
      basicSalary: 15750,
      monthlySalary: 18000,
      dailySalary: 600,
      hourlyRate: 150,
      overtimeRate: 225,
      totalWorkingHours: 110,
      totalWorkingDays: 20,
      presentDays: 20,
      absentDays: 0,
      overtimeHours: 5,
      overtimePay: 1125,
      regularHours: 105,
      grossPay: 16875,
      deductions: 0,
      netPay: 16875,
      status: PayrollStatus.PROCESSED,
      processedBy: admin._id,
      processedAt: new Date(),
    });

    // Contract (emp6)
    await Payroll.create({
      userId: emp6._id,
      month: curMonth,
      year: curYear,
      employeeType: "Contract",
      payrollRule: "CONTRACT_FIXED",
      basicSalary: 40000,
      monthlySalary: 40000,
      dailySalary: 1333.33,
      hourlyRate: 200,
      overtimeRate: 300,
      totalWorkingHours: 185,
      totalWorkingDays: 21,
      presentDays: 21,
      absentDays: 0,
      overtimeHours: 12,
      overtimePay: 3600,
      regularHours: 173,
      grossPay: 43600,
      deductions: 0,
      netPay: 43600,
      status: PayrollStatus.PROCESSED,
      processedBy: admin._id,
      processedAt: new Date(),
    });

    console.log("✅ Created sample payroll records reflecting Full-time, Part-time, and Contract rules\n");

    console.log("🎉 Database cleanly reset and seeded with Printadel data successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedDatabase();
}
