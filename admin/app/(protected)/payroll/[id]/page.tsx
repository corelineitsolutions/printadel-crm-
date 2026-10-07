"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "next/navigation";
import { useRef, useState, useEffect } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useAuthStore } from "@/store/authStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  IndianRupee,
  Download,
  Loader2,
  Building2,
  User,
  Calendar,
  Clock,
  TrendingUp,
  Minus,
  ArrowLeft,
} from "lucide-react";
import { payrollAPI, api } from "@/lib/api";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function PayslipPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const payrollId = params.id as string;
  const { user } = useAuthStore();
  const isManager = user?.role === "ADMIN" || user?.role === "MANAGER";

  // Fetch individual payroll record
  const { data: payrollData, isLoading } = useQuery({
    queryKey: ["payroll", payrollId],
    queryFn: async () => {
      const response = await payrollAPI.getPayrollById(payrollId);
      return response.data.data;
    },
  });

  // Fetch branding settings for the payslip
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await api.get("/settings");
      // Convert settings array/object to a key-value map for easy access
      const settingsMap: Record<string, string> = {};
      if (Array.isArray(res.data.data)) {
        res.data.data.forEach((s: any) => settingsMap[s.key] = s.value);
      } else {
        return res.data.data;
      }
      return settingsMap;
    },
  });

  const [isDownloading, setIsDownloading] = useState(false);
  const payslipRef = useRef<HTMLDivElement>(null);

  // Auto trigger download if ?download=true query parameter is present
  useEffect(() => {
    if (searchParams.get("download") === "true" && payrollData && !isLoading) {
      const timer = setTimeout(() => {
        handleDownloadPDF();
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [payrollData, isLoading, searchParams]);

  const handleDownloadPDF = async () => {
    if (!payslipRef.current) return;
    
    setIsDownloading(true);
    try {
      const element = payslipRef.current;

      const canvas = await html2canvas(element, {
        scale: 2, // 2x DPI for crisp high-resolution text and stamp
        useCORS: true,
        allowTaint: false,
        logging: false,
        backgroundColor: "#ffffff",
        windowWidth: element.scrollWidth,
      });
      
      const imgData = canvas.toDataURL("image/png");
      
      // Standard A4 dimensions in mm: 210 x 297
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth(); // 210mm
      const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm

      const margin = 8; // 8mm margin
      const maxWidth = pageWidth - margin * 2;
      const maxHeight = pageHeight - margin * 2;

      let renderWidth = maxWidth;
      let renderHeight = (canvas.height * maxWidth) / canvas.width;

      // Scale proportionally if longer than single A4 page
      if (renderHeight > maxHeight) {
        const ratio = maxHeight / renderHeight;
        renderWidth = renderWidth * ratio;
        renderHeight = maxHeight;
      }

      // Center horizontally on page
      const xOffset = margin + (maxWidth - renderWidth) / 2;
      const yOffset = margin;

      // Add the rendered payslip image to the PDF
      pdf.addImage(imgData, "PNG", xOffset, yOffset, renderWidth, renderHeight, undefined, "FAST");
      
      const empName = (payrollData?.user?.fullName || "Employee").replace(/\s+/g, "_");
      const monthName = MONTHS[(payrollData?.month || 1) - 1] || "Month";
      const year = payrollData?.year || new Date().getFullYear();

      pdf.save(`Payslip_${empName}_${monthName}_${year}.pdf`);
      toast.success("Payslip PDF downloaded successfully!");
    } catch (error: any) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF: " + (error?.message || "Please use Print / Save option."));
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!payrollData) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <p className="text-lg font-semibold">Payslip not found</p>
      </div>
    );
  }

  const months = MONTHS;
  const isSalarySheet = payrollData.payrollRule === "FULL_TIME_SHEET";
  const sheetLine = (label: string, amount: number, className = "") => (
    <div className={`flex justify-between text-sm py-1 border-b border-dashed border-border/50 ${className}`}>
      <span>{label}</span>
      <span className="font-bold">{formatCurrency(amount || 0)}</span>
    </div>
  );

  const getStatusColor = (status: string) => {
    const colors: any = {
      DRAFT: "bg-yellow-500",
      PROCESSED: "bg-blue-500",
      PAID: "bg-green-500",
    };
    return colors[status] || "bg-gray-500";
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-6">
      {/* Header - Hide on print */}
      <div className="flex items-center justify-between print:hidden">
        <Link href="/payroll">
          <Button variant="ghost" className="gap-2 hover:bg-muted/50 rounded-xl transition-all">
            <ArrowLeft className="w-4 h-4" />
            {isManager ? "Back to Payroll" : "Back to Salary Slips"}
          </Button>
        </Link>
        <div className="flex gap-2">
          <Button 
            onClick={handleDownloadPDF} 
            disabled={isDownloading}
            variant="outline" 
            className="gap-2 shadow-sm rounded-xl transition-all"
          >
            {isDownloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Download PDF
          </Button>
          <Button onClick={handlePrint} className="gap-2 shadow-lg rounded-xl transition-all">
            <Clock className="w-4 h-4" />
            Print / Save
          </Button>
        </div>
      </div>

      {/* Payslip Card */}
      <div ref={payslipRef}>
      <Card className="overflow-hidden border-none shadow-2xl print:shadow-none">
        {/* Banner Section */}
        <div 
          className="h-32 md:h-40 bg-slate-900 text-white relative flex items-center px-8 md:px-12 overflow-hidden"
          style={{
            backgroundImage: `url(${settings?.payrollBanner || '/payroll.png'})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          {/* Decorative Elements for the Banner - Only show if not using custom banner */}
          {!settings?.payrollBanner && (
            <>
              <div className="absolute top-0 right-0 w-64 h-full bg-primary/10 skew-x-12 transform translate-x-24 pointer-events-none" />
              <div className="absolute bottom-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl transform translate-x-10 translate-y-10 pointer-events-none" />
            </>
          )}
          
          <div className="relative z-10 flex items-center justify-between w-full">
            <div className="flex items-center gap-4">
              {/* <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg">
                <Building2 className="w-8 h-8 text-primary-foreground" />
              </div> */}
            </div>
            <div className="text-right hidden sm:block">
              <Badge className={`${getStatusColor(payrollData.status)} text-white hover:${getStatusColor(payrollData.status)} border-none text-[10px] px-3 py-1 uppercase tracking-widest font-bold shadow-lg`}>
                {payrollData.status}
              </Badge>
              <div className="mt-2 text-xl font-bold tracking-tighter opacity-80 uppercase italic">PAYSLIP</div>
            </div>
          </div>
        </div>

        <CardContent className="pt-6 space-y-6">
          {/* Employee Information */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <User className="w-5 h-5" />
                Employee Information
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name:</span>
                  <span className="font-medium">{payrollData.user?.fullName || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employee ID:</span>
                  <span className="font-medium">{payrollData.user?.employeeId || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Designation:</span>
                  <span className="font-medium">{payrollData.user?.designation || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Department:</span>
                  <span className="font-medium">{payrollData.user?.department || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employee Type:</span>
                  <Badge variant="outline" className="font-semibold text-xs border-indigo-200 bg-indigo-50 text-indigo-700">
                    {payrollData.employeeType || payrollData.user?.employeeType || "Full-time"}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payroll Rule:</span>
                  <span className="font-mono text-xs text-slate-700">
                    {payrollData.payrollRule || (payrollData.employeeType === "Part-time" ? "HOURLY_RATE" : payrollData.employeeType === "Contract" ? "CONTRACT_FIXED" : "MONTHLY_FIXED")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-medium">{payrollData.user?.email || "—"}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Payment Period
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Month:</span>
                  <span className="font-medium">
                    {months[payrollData.month - 1]} {payrollData.year}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Generated:</span>
                  <span className="font-medium">
                    {format(new Date(payrollData.createdAt), "dd MMM yyyy")}
                  </span>
                </div>
                {payrollData.processedAt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Processed:</span>
                    <span className="font-medium">
                      {format(new Date(payrollData.processedAt), "dd MMM yyyy")}
                    </span>
                  </div>
                )}
                {payrollData.processor && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Processed By:</span>
                    <span className="font-medium">{payrollData.processor.fullName}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Working Details */}
          <div className="space-y-3">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Work & Attendance Details
            </h3>
            {isSalarySheet ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="flex flex-col gap-1 p-3 bg-muted/50 rounded-xl">
                  <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Month Days</span>
                  <span className="text-lg font-black tracking-tighter">{payrollData.monthDays || 0} Days</span>
                </div>
                <div className="flex flex-col gap-1 p-3 bg-muted/50 rounded-xl border-2 border-emerald-500/10">
                  <span className="text-xs text-emerald-600 uppercase font-bold tracking-wider">Days Worked</span>
                  <span className="text-lg font-black tracking-tighter text-emerald-600">{payrollData.daysWorked || 0} Days</span>
                </div>
                <div className="flex flex-col gap-1 p-3 bg-muted/50 rounded-xl border-2 border-destructive/10">
                  <span className="text-xs text-destructive uppercase font-bold tracking-wider">Unpaid Days</span>
                  <span className="text-lg font-black tracking-tighter text-destructive">
                    {Math.max(0, (payrollData.monthDays || 0) - (payrollData.daysWorked || 0))} Days
                  </span>
                </div>
                <div className="flex flex-col gap-1 p-3 bg-muted/50 rounded-xl">
                  <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Salary Rate</span>
                  <span className="text-lg font-black tracking-tighter">{formatCurrency(payrollData.salaryRate || 0)}</span>
                </div>
              </div>
            ) : (
            <div className="grid md:grid-cols-4 gap-4 text-sm">
              <div className="flex flex-col gap-1 p-3 bg-muted/50 rounded-xl">
                <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Present Days</span>
                <span className="text-lg font-black tracking-tighter">{payrollData.presentDays ?? payrollData.totalWorkingDays?.toFixed(1) ?? "0.0"} Days</span>
              </div>
              <div className="flex flex-col gap-1 p-3 bg-muted/50 rounded-xl border-2 border-cyan-500/10">
                <span className="text-xs text-cyan-600 uppercase font-bold tracking-wider">Extra Days Worked</span>
                <span className="text-lg font-black tracking-tighter text-cyan-600">+{payrollData.extraWorkDays || 0} Days</span>
                {((payrollData.extraSundayDays || 0) > 0 || (payrollData.holidayWorkDays || 0) > 0) && (
                  <span className="text-[11px] text-muted-foreground">
                    {payrollData.extraSundayDays ? `Sunday: ${payrollData.extraSundayDays}` : ""}
                    {payrollData.extraSundayDays && payrollData.holidayWorkDays ? " • " : ""}
                    {payrollData.holidayWorkDays ? `Holiday: ${payrollData.holidayWorkDays}` : ""}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1 p-3 bg-muted/50 rounded-xl border-2 border-destructive/10">
                <span className="text-xs text-destructive uppercase font-bold tracking-wider">Absent Days</span>
                <span className="text-lg font-black tracking-tighter text-destructive">{payrollData.absentDays || 0} Days</span>
              </div>
              <div className="flex flex-col gap-1 p-3 bg-muted/50 rounded-xl border-2 border-indigo-500/10">
                <span className="text-xs text-indigo-600 uppercase font-bold tracking-wider">Overtime Hours</span>
                <span className="text-lg font-black tracking-tighter text-indigo-600">
                  +{payrollData.overtimeHours || 0} Hours
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Rate: {formatCurrency(payrollData.overtimeRate || 0)}/hr
                </span>
              </div>
            </div>
            )}
          </div>

          <Separator />

          {/* Earnings & Deductions */}
          {isSalarySheet ? (
            <div className="grid md:grid-cols-2 gap-10">
              <div className="space-y-4">
                <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  Earnings
                </h3>
                <div className="space-y-2.5">
                  {sheetLine(`Monthly Salary (${payrollData.daysWorked || 0}/${payrollData.monthDays || 0} days)`, payrollData.earnedSalary, "text-muted-foreground")}
                  {sheetLine("Basic + D.A.", payrollData.basicDa)}
                  {sheetLine("H.R.A.", payrollData.hra)}
                  {sheetLine("Conveyance Allowance", payrollData.conveyance)}
                  {sheetLine("Gross Wages Payable", payrollData.grossPay, "font-semibold text-green-700")}
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Minus className="w-4 h-4 text-red-500" />
                  Deductions
                </h3>
                <div className="space-y-2.5">
                  {sheetLine("EPF (12% of Basic)", payrollData.epf)}
                  {sheetLine("ESIC (0.75%)", payrollData.esic)}
                  {sheetLine("Professional Tax", payrollData.professionalTax)}
                  {(payrollData.advanceDeduction || 0) > 0 && sheetLine("Advance", payrollData.advanceDeduction)}
                  {(payrollData.otherDeduction || 0) > 0 && sheetLine("Other", payrollData.otherDeduction)}
                  {sheetLine("Total Deduction", payrollData.deductions, "font-semibold text-red-600")}
                </div>
              </div>
            </div>
          ) : (
          <div className="grid md:grid-cols-2 gap-10">
            {/* Earnings */}
            <div className="space-y-4">
              <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                Earnings Breakdown
              </h3>
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm py-1 border-b border-dashed border-border/50">
                  <span className="text-muted-foreground">Monthly Salary</span>
                  <span className="font-bold">{formatCurrency(payrollData.basicSalary)}</span>
                </div>
                <div className="flex justify-between text-sm py-1 border-b border-dashed border-border/50 text-muted-foreground">
                  <span>Daily Rate (Monthly / 30)</span>
                  <span className="font-medium text-foreground">{formatCurrency(payrollData.dailySalary || Math.round((payrollData.basicSalary / 30) * 100) / 100)}</span>
                </div>
                {((payrollData.extraSundayDays || 0) > 0) && (
                  <div className="flex justify-between text-sm py-1 border-b border-dashed border-border/50 text-green-600">
                    <span className="font-medium">Sunday Working Pay ({payrollData.extraSundayDays} {payrollData.extraSundayDays === 1 ? "Day" : "Days"})</span>
                    <span className="font-bold">+{formatCurrency(Math.round((payrollData.dailySalary || (payrollData.basicSalary / 30)) * payrollData.extraSundayDays * 100) / 100)}</span>
                  </div>
                )}
                {((payrollData.holidayWorkDays || 0) > 0) && (
                  <div className="flex justify-between text-sm py-1 border-b border-dashed border-border/50 text-green-600">
                    <span className="font-medium">Public Holiday Working Pay ({payrollData.holidayWorkDays} {payrollData.holidayWorkDays === 1 ? "Day" : "Days"})</span>
                    <span className="font-bold">+{formatCurrency(Math.round((payrollData.dailySalary || (payrollData.basicSalary / 30)) * payrollData.holidayWorkDays * 100) / 100)}</span>
                  </div>
                )}
                {(payrollData.overtimePay > 0 || payrollData.overtimeHours > 0) && (
                  <div className="flex justify-between text-sm py-1 border-b border-dashed border-border/50 text-indigo-600">
                    <span className="font-medium">
                      Overtime Pay ({payrollData.overtimeHours || 0} hrs @ {formatCurrency(payrollData.overtimeRate || 0)}/hr)
                    </span>
                    <span className="font-bold">+{formatCurrency(payrollData.overtimePay || 0)}</span>
                  </div>
                )}
                {!(payrollData.extraSundayDays > 0) && !(payrollData.holidayWorkDays > 0) && (payrollData.extraWorkDays > 0) && (
                  <div className="flex justify-between text-sm py-1 border-b border-dashed border-border/50 text-green-600">
                    <span className="font-medium">Extra Working Pay ({payrollData.extraWorkDays || 0} Days)</span>
                    <span className="font-bold">+{formatCurrency(payrollData.extraWorkPay || 0)}</span>
                  </div>
                )}
                {payrollData.allowances > 0 && (
                  <div className="flex justify-between text-sm py-1 border-b border-dashed border-border/50">
                    <span>Allowances</span>
                    <span className="font-bold">{formatCurrency(payrollData.allowances)}</span>
                  </div>
                )}
                {payrollData.bonuses > 0 && (
                  <div className="flex justify-between text-sm py-1 border-b border-dashed border-border/50 text-green-600">
                    <span>Bonuses</span>
                    <span className="font-bold">+{formatCurrency(payrollData.bonuses)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Deductions */}
            <div className="space-y-4">
              <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Minus className="w-4 h-4 text-red-500" />
                Deductions
              </h3>
              <div className="space-y-2.5">
                {(payrollData.absentDays > 0 || payrollData.absentDeduction > 0) && (
                  <div className="flex justify-between text-sm py-1 border-b border-dashed border-border/50 text-red-600">
                    <span>Absence Deduction ({payrollData.absentDays || 0} Days)</span>
                    <span className="font-bold">-{formatCurrency(payrollData.absentDeduction || Math.round(((payrollData.dailySalary || payrollData.basicSalary / 30) * (payrollData.absentDays || 0)) * 100) / 100)}</span>
                  </div>
                )}
                {(payrollData.lateCount > 0 || (payrollData.lateDeduction || 0) > 0) && (
                  <div className="flex justify-between text-sm py-1 border-b border-dashed border-border/50 text-red-600">
                    <span>Late Deduction ({payrollData.lateCount || 0} Marks → {Math.floor((payrollData.lateCount || 0) / 3) * 0.5} Days)</span>
                    <span className="font-bold">-{formatCurrency(payrollData.lateDeduction || 0)}</span>
                  </div>
                )}
                {payrollData.attendanceAdjustedSalary !== undefined && (
                  <div className="flex justify-between text-sm py-1 border-b border-dashed border-border/50 font-medium text-slate-700 dark:text-slate-300">
                    <span>Attendance Adjusted Salary</span>
                    <span className="font-bold">{formatCurrency(payrollData.attendanceAdjustedSalary)}</span>
                  </div>
                )}
                {payrollData.deductions === 0 && (
                  <div className="text-xs text-muted-foreground italic py-2">No deductions applied this month.</div>
                )}
              </div>
            </div>
          </div>
          )}

          <Separator />

          {/* Net Pay Highlight */}
          <div className="bg-slate-900 text-white p-8 rounded-3xl print:bg-white print:text-black print:border-2 border-slate-900 shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full blur-[80px] -translate-y-10 translate-x-10 pointer-events-none" />
            <div className="flex items-center justify-between relative z-10">
              <div className="space-y-1">
                <p className="text-xs font-bold uppercase tracking-widest text-primary/80">Net Monthly Payable</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-black tracking-tighter leading-none">{formatCurrency(payrollData.netPay)}</span>
                  <span className="text-xs opacity-50 font-bold uppercase">Incl. all taxes</span>
                </div>
              </div>
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
                <IndianRupee className="w-8 h-8 opacity-60" />
              </div>
            </div>
          </div>

          {/* Combined Signature & Official Stamp Section (Centered in Middle) */}
          <div className="flex flex-col items-center justify-center pt-8 pb-4 text-center">
            <div className="flex flex-col items-center justify-center relative">
              <div className="p-3 rounded-2xl bg-white/95 dark:bg-white/90 shadow-sm border border-border/30 inline-flex items-center justify-center">
                <img
                  src={settings?.signStamp || "/sign-stamp.png"}
                  alt="Authorized Signatory & Official Stamp"
                  className="w-[250px] h-[208px] object-contain mix-blend-multiply select-none"
                />
              </div>
              <div className="w-72 border-b-2 border-primary/20 mt-3.5 mb-2" />
              <p className="text-xs uppercase tracking-widest font-black text-foreground">
                Authorized Signatory
              </p>
              <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground/80 mt-0.5">
                Printadel Printing & Packaging • Pune
              </p>
            </div>
          </div>

          <Separator className="mt-8 opacity-50" />

          {/* Footer branding */}
          <div className="text-center space-y-2 pt-4 opacity-70">
            <div className="flex items-center justify-center gap-2">
               <Building2 className="w-3 h-3 text-muted-foreground" />
               <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Printadel Enterprise Operations Network</p>
            </div>
            <p className="text-[10px] font-medium text-muted-foreground leading-relaxed px-12">
              This is a digitally generated and verified payslip. It carries a digital signature and official stamp and does not require a physical wet signature. For verification purposes, please quote the Employee ID and Month/Year.
            </p>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
