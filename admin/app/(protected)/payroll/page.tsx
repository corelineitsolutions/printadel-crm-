"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  IndianRupee,
  Users,
  TrendingUp,
  Clock,
  Download,
  Loader2,
  Plus,
  CheckCircle2,
  Calendar,
  Search,
  FileText,
} from "lucide-react";
import { payrollAPI, employeeAPI } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn, formatCurrency } from "@/lib/utils";
import { FullTimeSalarySheet } from "@/components/payroll/full-time-salary-sheet";

export default function PayrollPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const currentDate = new Date();

  const [selectedMonth, setSelectedMonth] = useState<number | string>(currentDate.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [employeeTypeFilter, setEmployeeTypeFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [isBulkGenerateDialogOpen, setIsBulkGenerateDialogOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState("");

  const isManager = user?.role === "ADMIN" || user?.role === "MANAGER";

  // Fetch payroll statistics
  const { data: statsData } = useQuery({
    queryKey: ["payroll-stats", selectedMonth, selectedYear],
    queryFn: async () => {
      const response = await payrollAPI.getStatistics(
        selectedMonth === "all" ? undefined : Number(selectedMonth),
        selectedYear
      );
      return response.data.data;
    },
    enabled: isManager,
  });

  // Fetch payrolls
  const { data: payrollsData, isLoading } = useQuery({
    queryKey: ["payrolls", selectedMonth, selectedYear, filterStatus],
    queryFn: async () => {
      const params: any = {
        year: selectedYear,
      };
      if (selectedMonth !== "all") {
        params.month = Number(selectedMonth);
      }
      if (filterStatus !== "all") {
        params.status = filterStatus.toUpperCase();
      }
      const response = await payrollAPI.getPayrolls(params);
      return response.data.data;
    },
  });

  // Fetch employees for dropdown
  const { data: employeesData } = useQuery({
    queryKey: ["employees-for-payroll"],
    queryFn: async () => {
      const response = await employeeAPI.getAllEmployees({ role: "all", limit: 1000 });
      return response.data.data.employees;
    },
    enabled: isManager,
  });

  // Generate payroll mutation
  const generatePayrollMutation = useMutation({
    mutationFn: (data: { userId: string; month: number; year: number; fromSheet?: boolean }) =>
      payrollAPI.generatePayroll(data.userId, data.month, data.year),
    onSuccess: (_res, variables) => {
      toast.success("Payroll generated successfully!");
      queryClient.invalidateQueries({ queryKey: ["payrolls"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-stats"] });
      if (!variables.fromSheet) {
        setIsGenerateDialogOpen(false);
        setSelectedEmployee("");
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to generate payroll");
    },
  });

  // Bulk generate mutation
  const bulkGenerateMutation = useMutation({
    mutationFn: (data: { month: number; year: number }) =>
      payrollAPI.bulkGeneratePayroll(data.month, data.year),
    onSuccess: (response) => {
      const results = response.data.data;
      toast.success(
        `Bulk payroll generated: ${results.success.length} successful, ${results.failed.length} failed`
      );
      queryClient.invalidateQueries({ queryKey: ["payrolls"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-stats"] });
      setIsBulkGenerateDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to generate bulk payroll");
    },
  });

  // Process payroll mutation
  const processPayrollMutation = useMutation({
    mutationFn: (payrollId: string) => payrollAPI.processPayroll(payrollId),
    onSuccess: () => {
      toast.success("Payroll processed successfully!");
      queryClient.invalidateQueries({ queryKey: ["payrolls"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-stats"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to process payroll");
    },
  });

  // Mark as paid mutation
  const markPaidMutation = useMutation({
    mutationFn: (payrollId: string) => payrollAPI.markPayrollAsPaid(payrollId),
    onSuccess: () => {
      toast.success("Payroll marked as paid!");
      queryClient.invalidateQueries({ queryKey: ["payrolls"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-stats"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to mark as paid");
    },
  });

  const handleGeneratePayroll = () => {
    if (!selectedEmployee) {
      toast.error("Please select an employee");
      return;
    }
    const monthToUse = selectedMonth === "all" ? currentDate.getMonth() + 1 : Number(selectedMonth);
    generatePayrollMutation.mutate({
      userId: selectedEmployee,
      month: monthToUse,
      year: selectedYear,
    });
  };

  const handleBulkGenerate = () => {
    const monthToUse = selectedMonth === "all" ? currentDate.getMonth() + 1 : Number(selectedMonth);
    bulkGenerateMutation.mutate({
      month: monthToUse,
      year: selectedYear,
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: any = {
      DRAFT: "secondary",
      PROCESSED: "default",
      PAID: "default",
    };
    const colors: any = {
      DRAFT: "bg-yellow-500",
      PROCESSED: "bg-blue-500",
      PAID: "bg-green-500",
    };
    return (
      <Badge variant={variants[status]} className={colors[status]}>
        {status}
      </Badge>
    );
  };

  const matchesSearchTerm = (name: string, empId: string) =>
    name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    empId.toLowerCase().includes(searchTerm.toLowerCase());

  const filteredPayrolls = payrollsData?.filter((payroll: any) => {
    const type = payroll.employeeType || payroll.user?.employeeType || "Full-time";
    if (isManager && employeeTypeFilter !== "all" && type !== employeeTypeFilter) return false;
    return matchesSearchTerm(payroll.user?.fullName || "", payroll.user?.employeeId || "");
  });

  const showSalarySheet = isManager && employeeTypeFilter === "Full-time";
  const fullTimeEmployees = (employeesData || []).filter(
    (emp: any) =>
      emp.isActive !== false &&
      (emp.employeeType || "Full-time") === "Full-time" &&
      matchesSearchTerm(emp.fullName || "", emp.employeeId || "")
  );

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <IndianRupee className="w-7 h-7 sm:w-8 sm:h-8" />
            {isManager ? "Payroll Management" : "My Salary Slips"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            {isManager
              ? "Generate, process, and manage employee payroll"
              : "Select any month to view and download your official salary slip"}
          </p>
        </div>

        {isManager && (
          <div className="flex flex-wrap gap-2 self-start sm:self-auto">
            <Dialog open={isGenerateDialogOpen} onOpenChange={setIsGenerateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  Generate Payroll
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Generate Payroll</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Employee</Label>
                    <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select employee" />
                      </SelectTrigger>
                      <SelectContent>
                        {employeesData?.filter((emp: any) => emp.id || emp._id).map((emp: any) => (
                          <SelectItem key={emp.id || emp._id} value={emp.id || emp._id}>
                            {emp.fullName} - {emp.employeeId} ({emp.employeeType || "Full-time"})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(() => {
                      const empObj = employeesData?.find((e: any) => (e.id || e._id) === selectedEmployee);
                      if (!empObj) return null;
                      const empType = empObj.employeeType || "Full-time";
                      return (
                        <div className="p-3 bg-muted/60 rounded-lg text-xs space-y-1 border border-border">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground">Employee Type:</span>
                            <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-700 border-indigo-200">
                              {empType}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground">
                            {empType === "Part-time"
                              ? "Rule: Hourly pay basis (regularHours × hourlyRate) + Overtime pay."
                              : empType === "Contract"
                              ? "Rule: Fixed contract retainer + Overtime pay."
                              : "Rule: Salary sheet — Rate ÷ month days × days worked, split Basic+DA 50% / HRA 40% / Conveyance 10%, less EPF, ESIC, PT, Advance and Other."}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Month</Label>
                      <Select
                        value={selectedMonth.toString()}
                        onValueChange={(val) => setSelectedMonth(parseInt(val))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {months.map((month, idx) => (
                            <SelectItem key={idx} value={(idx + 1).toString()}>
                              {month}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Year</Label>
                      <Input
                        type="number"
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleGeneratePayroll}
                    disabled={generatePayrollMutation.isPending}
                    className="gap-2"
                  >
                    {generatePayrollMutation.isPending && (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                    Generate
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog
              open={isBulkGenerateDialogOpen}
              onOpenChange={setIsBulkGenerateDialogOpen}
            >
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <Users className="w-4 h-4" />
                  Bulk Generate
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Bulk Generate Payroll</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <p className="text-sm text-muted-foreground">
                    Generate payroll for all active employees for the selected month.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Month</Label>
                      <Select
                        value={selectedMonth.toString()}
                        onValueChange={(val) => setSelectedMonth(parseInt(val))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {months.map((month, idx) => (
                            <SelectItem key={idx} value={(idx + 1).toString()}>
                              {month}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Year</Label>
                      <Input
                        type="number"
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleBulkGenerate}
                    disabled={bulkGenerateMutation.isPending}
                    className="gap-2"
                  >
                    {bulkGenerateMutation.isPending && (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    )}
                    Generate for All Employees
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>

      {/* Statistics Cards - Manager/Admin Only */}
      {isManager && statsData && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
              <Users className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsData.totalEmployees}</div>
              <p className="text-xs text-muted-foreground mt-1">
                For {selectedMonth === "all" ? "All Months" : months[Number(selectedMonth) - 1]} {selectedYear}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Net Pay</CardTitle>
              <IndianRupee className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(statsData.totalNetPay)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Gross: {formatCurrency(statsData.totalGrossPay)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Overtime Pay</CardTitle>
              <Clock className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(statsData.totalOvertimePay)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Extra hours compensation</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Status Breakdown</CardTitle>
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>Paid:</span>
                  <span className="font-medium">{statsData.statusBreakdown.paid}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Processed:</span>
                  <span className="font-medium">{statsData.statusBreakdown.processed}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Draft:</span>
                  <span className="font-medium">{statsData.statusBreakdown.draft}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className={cn("grid gap-4", isManager ? "sm:grid-cols-2 lg:grid-cols-5" : "sm:grid-cols-2 md:grid-cols-3")}>
            <div className="space-y-2">
              <Label>Month</Label>
              <Select
                value={selectedMonth.toString()}
                onValueChange={(val) => setSelectedMonth(val === "all" ? "all" : parseInt(val))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Month" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  {months.map((month, idx) => (
                    <SelectItem key={idx} value={(idx + 1).toString()}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Year</Label>
              <Input
                type="number"
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value) || new Date().getFullYear())}
              />
            </div>
            {isManager ? (
              <>
                <div className="space-y-2">
                  <Label>Employee Type</Label>
                  <Select value={employeeTypeFilter} onValueChange={(v) => v && setEmployeeTypeFilter(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="Full-time">Full-time (Salary Sheet)</SelectItem>
                      <SelectItem value="Part-time">Part-time</SelectItem>
                      <SelectItem value="Contract">Contract</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="processed">Processed</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Search</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Name or ID..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-2 sm:col-span-2 md:col-span-1 flex flex-col justify-end">
                <div className="text-xs text-muted-foreground bg-muted/60 p-2.5 rounded-lg border flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary shrink-0" />
                  <span>Choose any month to view and download your monthly salary slip.</span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Featured Single Month Payslip Card for Employee */}
      {!isManager && filteredPayrolls && filteredPayrolls.length === 1 && (() => {
        const slip = filteredPayrolls[0];
        const dailySalary = slip.dailySalary || Math.round((slip.basicSalary / 30) * 100) / 100;
        const extraPay = slip.extraWorkPay ?? Math.round(dailySalary * (slip.extraWorkDays || 0) * 100) / 100;
        const absentDed = slip.absentDeduction ?? Math.round(dailySalary * (slip.absentDays || 0) * 100) / 100;

        return (
          <Card className="border-primary/30 bg-gradient-to-br from-card via-card to-primary/5 shadow-md">
            <CardHeader className="pb-3 flex flex-row items-center justify-between border-b">
              <div className="space-y-1">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  <span>{months[slip.month - 1]} {slip.year} Salary Slip</span>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Employee: <span className="font-medium text-foreground">{slip.user?.fullName}</span> ({slip.user?.employeeId || "N/A"}) {slip.user?.designation ? `• ${slip.user?.designation}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(slip.status)}
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-muted/40 p-3 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Basic Monthly Salary</p>
                  <p className="text-base font-bold text-foreground mt-0.5">{formatCurrency(slip.basicSalary)}</p>
                  <p className="text-[11px] text-muted-foreground">{formatCurrency(dailySalary)}/day</p>
                </div>
                <div className="bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Extra Work Days</p>
                  <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    +{slip.extraWorkDays || 0} {slip.extraWorkDays === 1 ? "Day" : "Days"}
                  </p>
                  <p className="text-[11px] text-emerald-600/80 font-medium">+{formatCurrency(extraPay)}</p>
                </div>
                <div className="bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
                  <p className="text-xs text-rose-700 dark:text-rose-400 font-medium">Absent Deductions</p>
                  <p className="text-base font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                    -{slip.absentDays || 0} {slip.absentDays === 1 ? "Day" : "Days"}
                  </p>
                  <p className="text-[11px] text-rose-600/80 font-medium">
                    {(slip.paidLeaveDays || 0) > 0 ? `${slip.paidLeaveDays} Paid Leave Applied` : `-${formatCurrency(absentDed)}`}
                  </p>
                </div>
                <div className="bg-primary/10 p-3 rounded-lg border border-primary/20">
                  <p className="text-xs text-primary font-medium">Net Take-Home Salary</p>
                  <p className="text-xl font-extrabold text-primary mt-0.5">{formatCurrency(slip.netPay)}</p>
                  <p className="text-[11px] text-muted-foreground">Salary to be credited</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => window.open(`/payroll/${slip.id}`, "_blank")}
                >
                  <FileText className="w-4 h-4" />
                  View Full Payslip
                </Button>
                <Button
                  className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-sm"
                  onClick={() => window.open(`/payroll/${slip.id}?download=true`, "_blank")}
                >
                  <Download className="w-4 h-4" />
                  Download Salary Slip (PDF)
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {showSalarySheet && (
        <FullTimeSalarySheet
          payrolls={filteredPayrolls || []}
          employees={fullTimeEmployees}
          month={selectedMonth === "all" ? "all" : Number(selectedMonth)}
          year={selectedYear}
          monthLabel={selectedMonth === "all" ? "" : months[Number(selectedMonth) - 1]}
          onGenerate={(userId) =>
            generatePayrollMutation.mutate({
              userId,
              month: Number(selectedMonth),
              year: selectedYear,
              fromSheet: true,
            })
          }
          generatingUserId={generatePayrollMutation.isPending ? generatePayrollMutation.variables?.userId ?? null : null}
          onBulkGenerate={handleBulkGenerate}
          isBulkGenerating={bulkGenerateMutation.isPending}
          onProcess={(id) => processPayrollMutation.mutate(id)}
          onMarkPaid={(id) => markPaidMutation.mutate(id)}
          isActionPending={processPayrollMutation.isPending || markPaidMutation.isPending}
        />
      )}

      {/* Payroll List / Table */}
      <Card className={showSalarySheet ? "hidden" : undefined}>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            {isManager ? "Employee Payrolls" : (selectedMonth === "all" ? "All Salary Slips" : "Salary Slips")}
          </CardTitle>
          {filteredPayrolls && filteredPayrolls.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {filteredPayrolls.length} {isManager ? (filteredPayrolls.length === 1 ? "Employee" : "Employees") : (filteredPayrolls.length === 1 ? "Slip" : "Slips")}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredPayrolls && filteredPayrolls.length > 0 ? (
            <div className="rounded-md border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                        {isManager ? "Employee & Type" : "Salary Period"}
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                        Base / Rate
                      </th>
                      <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                        Overtime
                      </th>
                      <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                        Extra Days
                      </th>
                      <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                        Absent Days
                      </th>
                      <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                        Late Marks
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                        Salary to Give
                      </th>
                      <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredPayrolls.map((payroll: any) => {
                      const dailySalary = payroll.dailySalary || Math.round((payroll.basicSalary / 30) * 100) / 100;
                      const extraPay = payroll.extraWorkPay ?? Math.round(dailySalary * (payroll.extraWorkDays || 0) * 100) / 100;
                      const absentDed = payroll.absentDeduction ?? Math.round(dailySalary * (payroll.absentDays || 0) * 100) / 100;
                      const penaltyDays = Math.floor((payroll.lateCount || 0) / 3) * 0.5;
                      const lateDed = payroll.lateDeduction ?? Math.round(penaltyDays * dailySalary * 100) / 100;

                      return (
                        <tr
                          key={payroll.id}
                          className="hover:bg-muted/30 transition-colors"
                        >
                          {/* 1. Employee Name or Period */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {isManager ? (
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center font-bold text-xs text-primary shrink-0">
                                  {payroll.user?.fullName?.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() || "EM"}
                                </div>
                                <div>
                                  <p className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                                    {payroll.user?.fullName || "Unknown Employee"}
                                    {payroll.employeeType && (
                                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                                        payroll.employeeType === "Full-time"
                                          ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                          : payroll.employeeType === "Part-time"
                                          ? "bg-purple-50 text-purple-700 border-purple-200"
                                          : "bg-amber-50 text-amber-700 border-amber-200"
                                      }`}>
                                        {payroll.employeeType}
                                      </Badge>
                                    )}
                                  </p>
                                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    <span>{payroll.user?.employeeId || "—"}</span>
                                    {payroll.user?.designation && (
                                      <>
                                        <span>•</span>
                                        <span>{payroll.user.designation}</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center font-bold text-xs text-primary shrink-0">
                                  <Calendar className="w-4 h-4 text-primary" />
                                </div>
                                <div>
                                  <p className="font-semibold text-foreground text-sm">
                                    {months[payroll.month - 1]} {payroll.year}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {payroll.user?.designation ? `${payroll.user.designation} • ` : ""}ID: #{payroll.id.slice(-6).toUpperCase()}
                                  </p>
                                </div>
                              </div>
                            )}
                          </td>

                          {/* 2. Salary (Base Monthly & Daily) */}
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="font-semibold text-foreground">
                              {formatCurrency(payroll.basicSalary)}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {payroll.employeeType === "Part-time" ? `${formatCurrency(payroll.hourlyRate || 0)}/hr` : `${formatCurrency(dailySalary)}/d`}
                            </div>
                          </td>

                          {/* 2.5 Overtime Hours & Pay */}
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            {(payroll.overtimeHours || 0) > 0 ? (
                              <div>
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200">
                                  +{payroll.overtimeHours} hrs
                                </span>
                                <div className="text-xs font-semibold text-indigo-600 mt-0.5">
                                  +{formatCurrency(payroll.overtimePay || 0)}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground font-medium">—</span>
                            )}
                          </td>

                          {/* 3. Extra Days */}
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            {(payroll.extraWorkDays || 0) > 0 ? (
                              <div>
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400">
                                  +{payroll.extraWorkDays} {payroll.extraWorkDays === 1 ? "Day" : "Days"}
                                </span>
                                <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                                  +{formatCurrency(extraPay)}
                                </div>
                                {((payroll.extraSundayDays || 0) > 0 || (payroll.holidayWorkDays || 0) > 0) && (
                                  <div className="text-[10px] text-muted-foreground">
                                    {payroll.extraSundayDays ? `Sun: ${payroll.extraSundayDays}` : ""}
                                    {payroll.extraSundayDays && payroll.holidayWorkDays ? " • " : ""}
                                    {payroll.holidayWorkDays ? `Hol: ${payroll.holidayWorkDays}` : ""}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground font-medium">—</span>
                            )}
                          </td>

                          {/* 4. Absent Days */}
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            {(payroll.absentDays || 0) > 0 ? (
                              <div>
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400">
                                  -{payroll.absentDays} {payroll.absentDays === 1 ? "Day" : "Days"}
                                </span>
                                <div className="text-xs font-semibold text-rose-600 dark:text-rose-400 mt-0.5">
                                  -{formatCurrency(absentDed)}
                                </div>
                                {(payroll.paidLeaveDays || 0) > 0 && (
                                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                                    +{payroll.paidLeaveDays} Paid Leave
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div>
                                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">0 Days</span>
                                {(payroll.paidLeaveDays || 0) > 0 ? (
                                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                                    {payroll.paidLeaveDays} Paid Leave
                                  </div>
                                ) : (
                                  <div className="text-[10px] text-muted-foreground mt-0.5">₹0.00</div>
                                )}
                              </div>
                            )}
                          </td>

                          {/* 5. Late Marks */}
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            {(payroll.lateCount || 0) > 0 ? (
                              <div>
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400">
                                  {payroll.lateCount} Marks
                                </span>
                                <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
                                  {lateDed > 0 ? `-${formatCurrency(lateDed)}` : "₹0.00"}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  {penaltyDays > 0 ? `${penaltyDays}d penalty` : "No deduction"}
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground font-medium">0 Marks</span>
                            )}
                          </td>

                          {/* 6. Salary to Give */}
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="font-bold text-base text-foreground">
                              {formatCurrency(payroll.netPay)}
                            </div>
                            <div className="mt-1 flex items-center justify-end gap-1.5">
                              {getStatusBadge(payroll.status)}
                            </div>
                          </td>

                          {/* 7. Actions */}
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              {isManager && payroll.status === "DRAFT" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs px-2.5"
                                  onClick={() => processPayrollMutation.mutate(payroll.id)}
                                  disabled={processPayrollMutation.isPending}
                                >
                                  Process
                                </Button>
                              )}
                              {isManager && payroll.status === "PROCESSED" && (
                                <Button
                                  size="sm"
                                  className="h-8 text-xs px-2.5 gap-1.5"
                                  onClick={() => markPaidMutation.mutate(payroll.id)}
                                  disabled={markPaidMutation.isPending}
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Mark Paid
                                </Button>
                              )}
                              <Button
                                size="sm"
                                className="h-8 text-xs px-3 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                                title="Download Salary Slip PDF"
                                onClick={() => window.open(`/payroll/${payroll.id}?download=true`, "_blank")}
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>{isManager ? "Slip" : "Download Slip"}</span>
                              </Button>
                              {!isManager && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs px-2.5 gap-1"
                                  title="View Payslip Details"
                                  onClick={() => window.open(`/payroll/${payroll.id}`, "_blank")}
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  <span>View</span>
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-muted/30 border-t font-semibold">
                    <tr>
                      <td className="px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground font-bold">
                        Total ({filteredPayrolls.length} {isManager ? (filteredPayrolls.length === 1 ? "Employee" : "Employees") : (filteredPayrolls.length === 1 ? "Slip" : "Slips")})
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-foreground">
                        {formatCurrency(filteredPayrolls.reduce((sum: number, p: any) => sum + (p.basicSalary || 0), 0))}
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-emerald-600 dark:text-emerald-400">
                        +{formatCurrency(filteredPayrolls.reduce((sum: number, p: any) => {
                          const daily = p.dailySalary || Math.round((p.basicSalary / 30) * 100) / 100;
                          return sum + (p.extraWorkPay ?? Math.round(daily * (p.extraWorkDays || 0) * 100) / 100);
                        }, 0))}
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-rose-600 dark:text-rose-400">
                        -{formatCurrency(filteredPayrolls.reduce((sum: number, p: any) => {
                          const daily = p.dailySalary || Math.round((p.basicSalary / 30) * 100) / 100;
                          return sum + (p.absentDeduction ?? Math.round(daily * (p.absentDays || 0) * 100) / 100);
                        }, 0))}
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-amber-600 dark:text-amber-400">
                        -{formatCurrency(filteredPayrolls.reduce((sum: number, p: any) => {
                          const daily = p.dailySalary || Math.round((p.basicSalary / 30) * 100) / 100;
                          const penalty = Math.floor((p.lateCount || 0) / 3) * 0.5;
                          return sum + (p.lateDeduction ?? Math.round(penalty * daily * 100) / 100);
                        }, 0))}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-foreground text-base">
                        {formatCurrency(filteredPayrolls.reduce((sum: number, p: any) => sum + (p.netPay || 0), 0))}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                        —
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-base font-semibold text-foreground">
                {selectedMonth === "all"
                  ? `No salary slips found for ${selectedYear}`
                  : `No salary slip found for ${months[Number(selectedMonth) - 1]} ${selectedYear}`}
              </p>
              <p className="text-sm text-muted-foreground mt-1 mb-5">
                {isManager
                  ? "Generate payroll for employees to view salary calculations, extra days, absent deductions, and late marks."
                  : "Your salary slip for this period has not been generated by management yet. Please select a different month or check back later."}
              </p>
              {isManager && (
                <div className="flex justify-center gap-3">
                  <Button
                    onClick={handleBulkGenerate}
                    disabled={bulkGenerateMutation.isPending}
                    className="gap-2"
                  >
                    {bulkGenerateMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Users className="w-4 h-4" />
                    )}
                    Bulk Generate for {selectedMonth === "all" ? selectedYear : `${months[Number(selectedMonth) - 1]} ${selectedYear}`}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
