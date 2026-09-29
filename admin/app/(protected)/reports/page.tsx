"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  TrendingUp,
  Users,
  Clock,
  Calendar,
  IndianRupee,
  CheckSquare,
  Download,
  Loader2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/utils";

const formatWorkingHours = (hours: number | undefined) => {
  if (!hours) return "0h 0m";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
};

export default function ReportsPage() {
  const { user } = useAuthStore();
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);
  const [selectedTaskProject, setSelectedTaskProject] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<string>("all");
  const [selectedDept, setSelectedDept] = useState<string>("all");

  const role = user?.role?.toString().toUpperCase() || "";
  const isManager = role === "ADMIN" || role === "MANAGER";
  const isEmployee = role === "EMPLOYEE";

  // Fetch dashboard analytics
  const { data: analyticsData } = useQuery({
    queryKey: ["dashboard-analytics"],
    queryFn: async () => {
      const response = await api.get("/reports/dashboard-analytics");
      return response.data.data;
    },
  });

  // Fetch projects for filtering
  const { data: projectsData } = useQuery({
    queryKey: ["projects-list"],
    queryFn: async () => {
      const response = await api.get("/projects", {
        params: { limit: 100 }
      });
      return response.data.data.projects;
    },
  });

  // Fetch employees for filtering
  const { data: employeesData } = useQuery({
    queryKey: ["employees-list"],
    queryFn: async () => {
      const response = await api.get("/employees", {
        params: { limit: 500 }
      });
      return response.data.data.employees;
    },
    enabled: isManager,
  });

  // Fetch attendance report
  const { data: attendanceReport, isLoading: attendanceLoading, isError: attendanceError } = useQuery({
    queryKey: ["attendance-report", startDate, endDate, selectedUser, selectedDept],
    queryFn: async () => {
      const params: any = { startDate, endDate };
      if (selectedUser !== "all") params.userId = selectedUser;
      if (selectedDept !== "all") params.departmentFilter = selectedDept;
      const response = await api.get("/reports/attendance", { params });
      return response.data.data;
    },
    retry: 1,
  });

  // Fetch task report
  const { data: taskReport, isLoading: taskLoading } = useQuery({
    queryKey: ["task-report", startDate, endDate, selectedTaskProject, selectedUser],
    queryFn: async () => {
      const params: any = { startDate, endDate };
      if (selectedTaskProject !== "all") params.projectId = selectedTaskProject;
      if (selectedUser !== "all") params.userId = selectedUser;
      const response = await api.get("/reports/tasks", { params });
      return response.data.data;
    },
  });

  // Fetch leave report
  const { data: leaveReport, isLoading: leaveLoading } = useQuery({
    queryKey: ["leave-report", startDate, endDate, selectedUser, selectedDept],
    queryFn: async () => {
      const params: any = { startDate, endDate };
      if (selectedUser !== "all") params.userId = selectedUser;
      if (selectedDept !== "all") params.departmentFilter = selectedDept;
      const response = await api.get("/reports/leave", { params });
      return response.data.data;
    },
  });

  // Fetch payroll report (managers/admins only)
  const { data: payrollReport, isLoading: payrollLoading } = useQuery({
    queryKey: ["payroll-report", selectedMonth, selectedYear, selectedUser, selectedDept],
    queryFn: async () => {
      const params: any = { month: selectedMonth, year: selectedYear };
      if (selectedUser !== "all") params.userId = selectedUser;
      if (selectedDept !== "all") params.department = selectedDept;
      const response = await api.get("/reports/payroll", { params });
      return response.data.data;
    },
    enabled: isManager,
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <BarChart3 className="w-8 h-8" />
          Reports & Analytics
        </h1>
        <p className="text-muted-foreground mt-1">
          Comprehensive insights and analytics for all modules
        </p>
      </div>

      {/* Dashboard Analytics - Overview Cards */}
      {analyticsData && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Active Employees</CardTitle>
              <Users className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analyticsData.activeEmployees}</div>
              <p className="text-xs text-muted-foreground mt-1">Total active users</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Today's Attendance</CardTitle>
              <Clock className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analyticsData.todayAttendance}</div>
              <p className="text-xs text-muted-foreground mt-1">Employees present</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analyticsData.activeProjects}</div>
              <p className="text-xs text-muted-foreground mt-1">In progress</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pending Tasks</CardTitle>
              <CheckSquare className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analyticsData.pendingTasks}</div>
              <p className="text-xs text-muted-foreground mt-1">To do + In progress</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pending Leaves</CardTitle>
              <Calendar className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analyticsData.pendingLeaves}</div>
              <p className="text-xs text-muted-foreground mt-1">Awaiting approval</p>
            </CardContent>
          </Card>

          {isManager && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Monthly Payroll</CardTitle>
                <IndianRupee className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(analyticsData.monthlyPayroll)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Current month</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Date Range Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-6 items-end">
            <div className="space-y-2">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            <div className="space-y-2 lg:col-span-2">
              <Label>Quick Ranges</Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    const d = format(new Date(), "yyyy-MM-dd");
                    setStartDate(d);
                    setEndDate(d);
                  }}
                >
                  Daily
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    const today = new Date();
                    const lastWeek = new Date(today);
                    lastWeek.setDate(today.getDate() - 7);
                    setStartDate(format(lastWeek, "yyyy-MM-dd"));
                    setEndDate(format(today, "yyyy-MM-dd"));
                  }}
                >
                  Weekly
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    const today = new Date();
                    const start = new Date(today.getFullYear(), today.getMonth(), 1);
                    setStartDate(format(start, "yyyy-MM-dd"));
                    setEndDate(format(today, "yyyy-MM-dd"));
                  }}
                >
                  This Month
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    const today = new Date();
                    const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                    const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
                    setStartDate(format(firstDayLastMonth, "yyyy-MM-dd"));
                    setEndDate(format(lastDayLastMonth, "yyyy-MM-dd"));
                  }}
                >
                  Last Month
                </Button>
              </div>
            </div>

            {isManager && (
              <div className="space-y-2 lg:col-span-2">
                <Label>Filter by Employee</Label>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Employees" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employees</SelectItem>
                    {employeesData?.filter((emp: any) => emp._id || emp.id).map((emp: any) => (
                      <SelectItem key={emp._id || emp.id} value={emp._id || emp.id}>
                        {emp.fullName} ({emp.employeeId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Reports */}
      <Tabs defaultValue="attendance" className="space-y-4">
        <TabsList>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
          {isManager && <TabsTrigger value="payroll">Payroll</TabsTrigger>}
        </TabsList>

        {/* Attendance Report */}
        <TabsContent value="attendance">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Attendance Report</CardTitle>
                <Button size="sm" variant="outline" className="gap-2">
                  <Download className="w-4 h-4" />
                  Export
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {attendanceLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin" />
                </div>
              ) : attendanceError ? (
                <div className="py-8 text-center space-y-2">
                  <p className="text-destructive font-medium">⚠️ Failed to load attendance data</p>
                  <p className="text-xs text-muted-foreground">The backend server may be unavailable or the date range has no records. Check the browser console for details.</p>
                </div>
              ) : attendanceReport ? (
                <div className="space-y-6">
                  {/* ── Summary Stats ─────────────────────────────── */}
                  <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
                    <div className="p-3 border rounded-lg bg-blue-50/50 text-center">
                      <p className="text-xs text-muted-foreground font-medium">Present</p>
                      <p className="text-xl font-bold text-blue-700">{attendanceReport.statistics.presentDays}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-red-50/50 text-center">
                      <p className="text-xs text-muted-foreground font-medium">Absent</p>
                      <p className="text-xl font-bold text-red-700">{attendanceReport.statistics.absentDays}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-orange-50/50 text-center">
                      <p className="text-xs text-muted-foreground font-medium">Half Days</p>
                      <p className="text-xl font-bold text-orange-700">{attendanceReport.statistics.halfDays}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-emerald-50/50 text-center">
                      <p className="text-xs text-muted-foreground font-medium">Granted</p>
                      <p className="text-xl font-bold text-emerald-700">{attendanceReport.statistics.approvedLeaves || 0}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-violet-50/50 text-center">
                      <p className="text-xs text-muted-foreground font-medium">On Leave</p>
                      <p className="text-xl font-bold text-violet-700">{attendanceReport.statistics.leaveDays}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-amber-50/50 text-center">
                      <p className="text-xs text-muted-foreground font-medium">Late Days</p>
                      <p className="text-xl font-bold text-amber-700">{attendanceReport.statistics.lateDays || 0}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-indigo-50/50 text-center">
                      <p className="text-xs text-muted-foreground font-medium">Total Hrs</p>
                      <p className="text-xl font-bold text-indigo-700">{formatWorkingHours(attendanceReport.statistics.totalWorkingHours)}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-emerald-50/50 text-center">
                      <p className="text-xs text-muted-foreground font-medium">Rate</p>
                      <p className="text-xl font-bold text-emerald-700">{attendanceReport.statistics.attendanceRate?.toFixed(1)}%</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-red-100/50 text-center">
                      <p className="text-xs text-muted-foreground font-medium">Late Marks</p>
                      <p className="text-xl font-bold text-red-600">{attendanceReport.statistics.lateDays || 0}</p>
                    </div>
                    <div className="p-3 border rounded-lg bg-orange-100/50 text-center">
                      <p className="text-xs text-muted-foreground font-medium">Late Penalty</p>
                      <p className="text-xl font-bold text-orange-600">{attendanceReport.statistics.latePenaltyDays || 0} d</p>
                    </div>
                  </div>

                  {/* ── Employee Summary Table ─────────────────────── */}
                  {attendanceReport.employeeSummaries && attendanceReport.employeeSummaries.length > 0 ? (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Employee-wise Summary
                      </h3>
                      <div className="rounded-md border overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50 border-b">
                              <tr>
                                <th className="px-4 py-3 text-center font-medium whitespace-nowrap">Employee</th>
                                <th className="px-4 py-3 text-center font-medium whitespace-nowrap">Push In (1st)</th>
                                <th className="px-4 py-3 text-center font-medium whitespace-nowrap">Push Out (Last)</th>
                                <th className="px-4 py-3 text-center font-medium whitespace-nowrap">Total Hrs</th>
                                <th className="px-4 py-3 text-center font-medium whitespace-nowrap">Avg Daily Hrs</th>
                                <th className="px-4 py-3 text-center font-medium whitespace-nowrap">Present</th>
                                <th className="px-4 py-3 text-center font-medium whitespace-nowrap">Absent</th>
                                <th className="px-4 py-3 text-center font-medium whitespace-nowrap">Granted Leaves</th>
                                <th className="px-4 py-3 text-center font-medium whitespace-nowrap">Applied Leaves</th>
                                <th className="px-4 py-3 text-center font-medium whitespace-nowrap">Half Days</th>
                                <th className="px-4 py-3 text-center font-medium whitespace-nowrap">Late Marks</th>
                                <th className="px-4 py-3 text-center font-medium whitespace-nowrap">Penalty (Days)</th>
                                <th className="px-4 py-3 text-center font-medium whitespace-nowrap">Details</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {attendanceReport.employeeSummaries.map((emp: any) => {
                                // First punch in from daily records (ascending)
                                const firstPunchIn = emp.dailyWorkingHours?.find((d: any) => d.punchIn)?.punchIn;
                                // Last punch out from daily records
                                const lastPunchOut = [...(emp.dailyWorkingHours || [])]
                                  .reverse()
                                  .find((d: any) => d.punchOut)?.punchOut;

                                return (
                                  <tr
                                    key={emp.userId}
                                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                                    onClick={() => setExpandedEmployee(expandedEmployee === emp.userId ? null : emp.userId)}
                                  >
                                    <td className="px-4 py-3 font-medium whitespace-nowrap">
                                      <div>{emp.user?.fullName || "—"}</div>
                                      <div className="text-[10px] text-muted-foreground">{emp.user?.employeeId}</div>
                                    </td>
                                    <td className="px-4 py-3 text-center whitespace-nowrap">
                                      {firstPunchIn ? (
                                        <span className="text-green-700 font-medium">
                                          {format(new Date(firstPunchIn), "hh:mm a")}
                                        </span>
                                      ) : "—"}
                                    </td>
                                    <td className="px-4 py-3 text-center whitespace-nowrap">
                                      {lastPunchOut ? (
                                        <span className="text-red-700 font-medium">
                                          {format(new Date(lastPunchOut), "hh:mm a")}
                                        </span>
                                      ) : "—"}
                                    </td>
                                    <td className="px-4 py-3 text-center font-semibold whitespace-nowrap">
                                      {formatWorkingHours(emp.totalWorkingHours)}
                                    </td>
                                    <td className="px-4 py-3 text-center whitespace-nowrap">
                                      {formatWorkingHours(emp.avgDailyWorkingHours)}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50 text-[11px]">
                                        {emp.presentDays}
                                      </Badge>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50 text-[11px]">
                                        {emp.absentDays}
                                      </Badge>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50 text-[11px]">
                                        {emp.approvedLeaves || 0}
                                      </Badge>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <div className="flex flex-col items-center gap-0.5">
                                        <Badge variant="outline" className="border-purple-300 text-purple-700 bg-purple-50 text-[11px]">
                                          {emp.appliedLeaves || 0} applied
                                        </Badge>
                                        {emp.pendingLeaves > 0 && (
                                          <span className="text-[10px] text-amber-600">{emp.pendingLeaves} pending</span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <Badge variant="outline" className="border-orange-300 text-orange-700 bg-orange-50 text-[11px]">
                                        {emp.halfDaysTaken}
                                      </Badge>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <Badge variant="outline" className="border-red-300 text-red-700 bg-red-50 text-[11px]">
                                        {emp.lateDays || 0}
                                      </Badge>
                                    </td>
                                    <td className="px-4 py-3 text-center font-bold text-orange-600">
                                      {emp.latePenaltyDays || 0}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                      <Button variant="ghost" size="sm" className="h-7 text-xs">
                                        {expandedEmployee === emp.userId ? "▲ Hide" : "▼ View"}
                                      </Button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* ── Daily Drilldown ───────────────────────────── */}
                  {expandedEmployee && (() => {
                    const emp = attendanceReport.employeeSummaries?.find((e: any) => e.userId === expandedEmployee);
                    if (!emp) return null;
                    return (
                      <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                        <h4 className="font-semibold text-sm">
                          Daily Working Hours — <span className="text-primary">{emp.user?.fullName}</span>
                        </h4>
                        <div className="overflow-x-auto rounded-md border bg-background">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50 border-b">
                              <tr>
                                <th className="px-4 py-2 text-left font-medium">Date</th>
                                <th className="px-4 py-2 text-center font-medium">Push In</th>
                                <th className="px-4 py-2 text-center font-medium">Push Out</th>
                                <th className="px-4 py-2 text-center font-medium">Working Hrs</th>
                                <th className="px-4 py-2 text-center font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {(emp.dailyWorkingHours || []).map((day: any, idx: number) => (
                                <tr key={idx} className="hover:bg-muted/20 transition-colors">
                                  <td className="px-4 py-2 font-medium whitespace-nowrap">
                                    {format(new Date(day.date), "EEE, dd MMM yyyy")}
                                  </td>
                                  <td className="px-4 py-2 text-center whitespace-nowrap">
                                    {day.punchIn ? (
                                      <span className="text-green-700 font-medium">
                                        {format(new Date(day.punchIn), "hh:mm a")}
                                        {day.isLate && (
                                          <span className="ml-1 text-[10px] text-amber-600 font-bold">
                                            Late ({day.lateMinutes}m)
                                          </span>
                                        )}
                                      </span>
                                    ) : "—"}
                                  </td>
                                  <td className="px-4 py-2 text-center whitespace-nowrap">
                                    {day.punchOut ? (
                                      <span className="text-red-700 font-medium">
                                        {format(new Date(day.punchOut), "hh:mm a")}
                                      </span>
                                    ) : "—"}
                                  </td>
                                  <td className="px-4 py-2 text-center font-semibold whitespace-nowrap">
                                    {day.workingHours > 0 ? formatWorkingHours(day.workingHours) : "—"}
                                  </td>
                                  <td className="px-4 py-2 text-center">
                                    <Badge
                                      variant={
                                        day.isExtraDay ? "default" : 
                                        day.status === "PRESENT" ? "default" :
                                          day.status === "ABSENT" ? "destructive" :
                                            "secondary"
                                      }
                                      className={`text-[10px] h-5 ${day.isExtraDay ? "bg-cyan-600 hover:bg-cyan-700" : ""}`}
                                    >
                                      {day.isExtraDay ? "EXTRA DAY" : day.status}
                                    </Badge>
                                  </td>
                                </tr>
                              ))}
                              {(!emp.dailyWorkingHours || emp.dailyWorkingHours.length === 0) && (
                                <tr>
                                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                                    No daily records
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── All Daily Records (raw fallback) ─────────── */}
                  {!attendanceReport.employeeSummaries?.length && (
                    <div className="rounded-md border overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50 border-b">
                            <tr>
                              <th className="px-4 py-3 text-left font-medium">Date</th>
                              <th className="px-4 py-3 text-left font-medium">Employee</th>
                              <th className="px-4 py-3 text-left font-medium">Push In</th>
                              <th className="px-4 py-3 text-left font-medium">Push Out</th>
                              <th className="px-4 py-3 text-left font-medium">Working Hrs</th>
                              <th className="px-4 py-3 text-left font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {attendanceReport.attendances.map((record: any) => (
                              <tr key={record._id} className="hover:bg-muted/30 transition-colors">
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {format(new Date(record.date), "dd MMM yyyy")}
                                </td>
                                <td className="px-4 py-3 font-medium">{record.user?.fullName}</td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {record.punchInTime ? format(new Date(record.punchInTime), "hh:mm a") : "—"}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {record.punchOutTime ? format(new Date(record.punchOutTime), "hh:mm a") : "—"}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">{formatWorkingHours(record.workingHours)}</td>
                                <td className="px-4 py-3">
                                    <Badge
                                      variant={
                                        record.isExtraDay ? "default" : 
                                        record.status === "PRESENT" ? "default" : 
                                        record.status === "ABSENT" ? "destructive" : 
                                        "secondary"
                                      }
                                      className={`text-[10px] h-5 ${record.isExtraDay ? "bg-cyan-600 hover:bg-cyan-700" : ""}`}
                                    >
                                      {record.isExtraDay ? "EXTRA DAY" : record.status}
                                    </Badge>
                                </td>
                              </tr>
                            ))}
                            {attendanceReport.attendances.length === 0 && (
                              <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                                  No records found
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No data available for selected period
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>


        {/* Task Report */}
        <TabsContent value="tasks">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <CardTitle>Task Completion Report</CardTitle>
                <div className="flex items-center gap-3">
                  <div className="w-48 lg:w-64">
                    <Select value={selectedTaskProject} onValueChange={setSelectedTaskProject}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Filter by Project" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Projects</SelectItem>
                        {projectsData?.filter((p: any) => p._id || p.id).map((p: any) => (
                          <SelectItem key={p._id || p.id} value={p._id || p.id}>
                            {p.name} ({p.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button size="sm" variant="outline" className="h-9 gap-2">
                    <Download className="w-4 h-4" />
                    Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {taskLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin" />
                </div>
              ) : taskReport ? (
                <div className="rounded-md border overflow-hidden mt-6">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Task</th>
                          <th className="px-4 py-3 text-left font-medium">Project</th>
                          <th className="px-4 py-3 text-left font-medium">Assigned To</th>
                          <th className="px-4 py-3 text-left font-medium">Priority</th>
                          <th className="px-4 py-3 text-left font-medium">Hours (A/E)</th>
                          <th className="px-4 py-3 text-left font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {taskReport.tasks.map((task: any) => (
                          <tr key={task._id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 font-medium">{task.title}</td>
                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                              {task.projectId?.name || "N/A"}
                            </td>
                            <td className="px-4 py-3">
                              {Array.isArray(task.assignedTo)
                                ? task.assignedTo.map((u: any) => u.fullName).join(", ")
                                : task.assignedTo?.fullName || "Unassigned"}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={`text-[10px] h-5 ${task.priority === "URGENT" ? "border-red-500 text-red-500" :
                                task.priority === "HIGH" ? "border-orange-500 text-orange-500" :
                                  "border-blue-500 text-blue-500"
                                }`}>
                                {task.priority}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {task.actualHours?.toFixed(1) || 0} / {task.estimatedHours || 0} h
                            </td>
                            <td className="px-4 py-3">
                              <Badge className="text-[10px] h-5">
                                {task.status?.replace("_", " ") || "N/A"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                        {taskReport.tasks.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                              No task records found
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No data available for selected period
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Leave Report */}
        <TabsContent value="leave">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Leave Report</CardTitle>
                <Button size="sm" variant="outline" className="gap-2">
                  <Download className="w-4 h-4" />
                  Export
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {leaveLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin" />
                </div>
              ) : leaveReport ? (
                <div className="rounded-md border overflow-hidden mt-6">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Employee</th>
                          <th className="px-4 py-3 text-left font-medium">Type</th>
                          <th className="px-4 py-3 text-left font-medium">Duration</th>
                          <th className="px-4 py-3 text-left font-medium">Status</th>
                          <th className="px-4 py-3 text-left font-medium">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {leaveReport.leaves.map((leave: any) => (
                          <tr key={leave._id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 font-medium whitespace-nowrap">
                              {leave.user?.fullName}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {leave.type?.replace("_", " ") || "N/A"}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              {format(new Date(leave.startDate), "dd MMM")} - {format(new Date(leave.endDate), "dd MMM yyyy")}
                              <span className="ml-1 text-[10px] text-muted-foreground">
                                ({leave.totalDays} days)
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                variant={leave.status === "APPROVED" ? "default" : leave.status === "PENDING" ? "outline" : "destructive"}
                                className="text-[10px] h-5"
                              >
                                {leave.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 max-w-xs truncate" title={leave.reason}>
                              {leave.reason}
                            </td>
                          </tr>
                        ))}
                        {leaveReport.leaves.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                              No leave records found
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No data available for selected period
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payroll Report - Manager/Admin Only */}
        {
          isManager && (
            <TabsContent value="payroll">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Payroll Report</CardTitle>
                    <Button size="sm" variant="outline" className="gap-2">
                      <Download className="w-4 h-4" />
                      Export
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {payrollLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-8 h-8 animate-spin" />
                    </div>
                  ) : payrollReport ? (
                    <div className="rounded-md border overflow-hidden mt-6">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50 border-b">
                            <tr>
                              <th className="px-4 py-3 text-left font-medium">Employee</th>
                              <th className="px-4 py-3 text-left font-medium">Gross Pay</th>
                              <th className="px-4 py-3 text-left font-medium">Late Marks</th>
                              <th className="px-4 py-3 text-left font-medium">Late Ded.</th>
                              <th className="px-4 py-3 text-left font-medium">Deductions</th>
                              <th className="px-4 py-3 text-left font-medium">Overtime Pay</th>
                              <th className="px-4 py-3 text-left font-medium font-bold">Net Pay</th>
                              <th className="px-4 py-3 text-left font-medium">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {payrollReport.payrolls.map((payroll: any) => (
                              <tr key={payroll._id} className="hover:bg-muted/30 transition-colors">
                                <td className="px-4 py-3 font-medium whitespace-nowrap">
                                  {payroll.user?.fullName}
                                  <div className="text-[10px] text-muted-foreground">
                                    {payroll.user?.employeeId}
                                  </div>
                                </td>
                                <td className="px-4 py-3">{formatCurrency(payroll.grossPay)}</td>
                                <td className="px-4 py-3 text-center">{payroll.lateCount || 0}</td>
                                <td className="px-4 py-3 text-red-500">-{formatCurrency(payroll.lateDeduction || 0)}</td>
                                <td className="px-4 py-3 text-red-600">-{formatCurrency(payroll.deductions)}</td>
                                <td className="px-4 py-3 text-green-600">+{formatCurrency(payroll.overtimePay)}</td>
                                <td className="px-4 py-3 font-bold text-emerald-700">
                                  {formatCurrency(payroll.netPay)}
                                </td>
                                <td className="px-4 py-3">
                                  <Badge variant={payroll.status === "PAID" ? "default" : "outline"} className="text-[10px] h-5">
                                    {payroll.status}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                            {payrollReport.payrolls.length === 0 && (
                              <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                                  No payroll records found
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      No data available for selected period
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent >
          )
        }
      </Tabs >
    </div >
  );
}
