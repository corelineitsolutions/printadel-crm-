"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Activity,
  Clock,
  Printer,
  Calendar,
  User,
  Users,
  Search,
  CheckCircle,
  Plus,
  Loader2,
  TrendingUp,
  BarChart3,
  Layers,
  Sparkles,
  LogOut,
  FolderOpen,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { productivityAPI, jobCardAPI, employeeAPI } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

const ACTIVITY_COLORS: Record<string, string> = {
  "Printing": "bg-purple-100 text-purple-800 border-purple-300",
  "Design / Pre-press": "bg-blue-100 text-blue-800 border-blue-300",
  "Cutting & Finishing": "bg-amber-100 text-amber-800 border-amber-300",
  "Binding": "bg-indigo-100 text-indigo-800 border-indigo-300",
  "Packaging": "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Delivery / Dispatch": "bg-cyan-100 text-cyan-800 border-cyan-300",
  "Machine Maintenance": "bg-rose-100 text-rose-800 border-rose-300",
  "Help / Support": "bg-teal-100 text-teal-800 border-teal-300",
  "Other": "bg-slate-100 text-slate-800 border-slate-300",
};

export default function ProductivityPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "ADMIN";
  const isManager = user?.role === "MANAGER";
  const isPrivileged = isAdmin || isManager;

  const [activeTab, setActiveTab] = useState<string>(isPrivileged ? "all" : "my");
  const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState<string>("all");
  const [selectedActivityFilter, setSelectedActivityFilter] = useState<string>("all");
  const [showLogModal, setShowLogModal] = useState<boolean>(false);

  // Manual Log Activity form state
  const [formJobCardId, setFormJobCardId] = useState<string>("general");
  const [formActivityType, setFormActivityType] = useState<string>("Printing");
  const [formDurationMinutes, setFormDurationMinutes] = useState<number>(60);
  const [formNotes, setFormNotes] = useState<string>("");

  // Fetch employees for filter
  const { data: employeesData } = useQuery({
    queryKey: ["employeesList"],
    queryFn: async () => {
      const res = await employeeAPI.getAllEmployees({ limit: 100 });
      return res.data;
    },
    enabled: isPrivileged,
  });

  // Fetch job cards for dropdown
  const { data: jobCardsData } = useQuery({
    queryKey: ["jobCardsMini"],
    queryFn: async () => {
      const res = await jobCardAPI.getAllJobCards({ limit: 100 });
      return res.data;
    },
  });

  // Fetch activity types
  const { data: activityTypesData } = useQuery({
    queryKey: ["activityTypes"],
    queryFn: async () => {
      const res = await productivityAPI.getActivityTypes();
      return res.data;
    },
  });

  // Fetch Stats
  const { data: statsData, isLoading: isStatsLoading } = useQuery({
    queryKey: ["productivityStats", activeTab, selectedEmployeeFilter],
    queryFn: async () => {
      const params: any = {};
      if (activeTab === "my" || !isPrivileged) {
        params.userId = user?.id;
      } else if (selectedEmployeeFilter !== "all") {
        params.userId = selectedEmployeeFilter;
      }
      const res = await productivityAPI.getStats(params);
      return res.data;
    },
  });

  // Fetch Logs
  const { data: logsData, isLoading: isLogsLoading } = useQuery({
    queryKey: [
      "productivityLogs",
      activeTab,
      selectedEmployeeFilter,
      selectedActivityFilter,
    ],
    queryFn: async () => {
      const params: any = { limit: 50 };
      if (selectedActivityFilter !== "all") {
        params.activityType = selectedActivityFilter;
      }

      if (activeTab === "my" || !isPrivileged) {
        const res = await productivityAPI.getMyLogs(params);
        return res.data;
      } else {
        if (selectedEmployeeFilter !== "all") {
          params.userId = selectedEmployeeFilter;
        }
        const res = await productivityAPI.getAllLogs(params);
        return res.data;
      }
    },
  });

  // Log Activity Mutation
  const logActivityMutation = useMutation({
    mutationFn: (data: any) => productivityAPI.logActivity(data),
    onSuccess: () => {
      toast.success("Activity logged successfully!");
      queryClient.invalidateQueries({ queryKey: ["productivityLogs"] });
      queryClient.invalidateQueries({ queryKey: ["productivityStats"] });
      queryClient.invalidateQueries({ queryKey: ["jobCards"] });
      setShowLogModal(false);
      setFormNotes("");
      setFormDurationMinutes(60);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Failed to log activity");
    },
  });

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formActivityType) {
      toast.error("Please select an activity type");
      return;
    }

    logActivityMutation.mutate({
      jobCardId: formJobCardId === "general" ? undefined : formJobCardId,
      activityType: formActivityType,
      durationMinutes: Number(formDurationMinutes),
      notes: formNotes.trim() || undefined,
      isLogoutSession: false,
    });
  };

  const employees = employeesData?.data?.employees || [];
  const jobCards = jobCardsData?.data || [];
  const activityTypes = activityTypesData?.data || [
    "Printing",
    "Design / Pre-press",
    "Cutting & Finishing",
    "Binding",
    "Packaging",
    "Delivery / Dispatch",
    "Machine Maintenance",
    "Help / Support",
    "Other",
  ];
  const logs = logsData?.data || [];
  const stats = statsData?.data || { totalHours: 0, totalSessions: 0, activityBreakdown: [] };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2.5 text-slate-900">
            <span className="p-2 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white shadow-md shadow-teal-100">
              <Activity className="w-6 h-6" />
            </span>
            Productivity & Shift Tracking
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Track daily work, logout logs, print operations, and employee hours spent per Job Card
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-100"
            onClick={() => setShowLogModal(true)}
          >
            <Plus className="w-4 h-4" />
            Log Work Session
          </Button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Total Hours Tracked
              </p>
              <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
                {stats.totalHours || 0} <span className="text-sm font-normal text-muted-foreground">hrs</span>
              </h3>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <Clock className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Work Sessions Logged
              </p>
              <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
                {stats.totalSessions || 0}
              </h3>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <BarChart3 className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Top Activity
              </p>
              <h3 className="text-lg font-bold text-slate-900 mt-1 truncate max-w-[170px]">
                {stats.activityBreakdown?.[0]?.activityType || "None"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {stats.activityBreakdown?.[0]?.totalHours || 0} hrs recorded
              </p>
            </div>
            <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
              <Printer className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Logout Submissions
              </p>
              <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
                {logs.filter((l: any) => l.isLogoutSession).length}
              </h3>
              <p className="text-xs text-muted-foreground">Auto-saved at sign-out</p>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <LogOut className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Breakdown Distribution */}
      {stats.activityBreakdown && stats.activityBreakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              Activity Distribution & Hours Allocation
            </CardTitle>
            <CardDescription>
              Time spent across different print floor operations and services
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {stats.activityBreakdown.map((item: any, idx: number) => {
                const colorClass = ACTIVITY_COLORS[item.activityType] || "bg-slate-100 text-slate-800";
                return (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border bg-slate-50/50 flex flex-col justify-between space-y-2"
                  >
                    <Badge variant="outline" className={`text-xs px-2 py-0.5 font-medium border ${colorClass} w-fit`}>
                      {item.activityType}
                    </Badge>
                    <div>
                      <div className="text-lg font-bold text-slate-900">
                        {item.totalHours} <span className="text-xs font-normal text-muted-foreground">hrs</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {item.count} session(s)
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* View Tabs & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {isPrivileged ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
            <TabsList>
              <TabsTrigger value="all" className="gap-2">
                <Users className="w-4 h-4" />
                All Team Members
              </TabsTrigger>
              <TabsTrigger value="my" className="gap-2">
                <User className="w-4 h-4" />
                My Productivity
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : (
          <div className="font-semibold text-slate-800 flex items-center gap-2">
            <User className="w-4 h-4 text-emerald-600" />
            My Productivity Records
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {/* Employee Filter for Admins */}
          {isPrivileged && activeTab === "all" && (
            <div className="w-48">
              <Select
                value={selectedEmployeeFilter}
                onValueChange={setSelectedEmployeeFilter}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="All Employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {employees.map((emp: any) => {
                    const empId = emp._id || emp.id;
                    return (
                      <SelectItem key={empId} value={empId}>
                        {emp.fullName}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Activity Type Filter */}
          <div className="w-48">
            <Select
              value={selectedActivityFilter}
              onValueChange={setSelectedActivityFilter}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Activities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Activities</SelectItem>
                {activityTypes.map((act: string) => (
                  <SelectItem key={act} value={act}>
                    {act}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <Card>
        <CardContent className="p-0">
          {isLogsLoading ? (
            <div className="flex justify-center items-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Activity className="w-12 h-12 text-slate-300 mb-3" />
              <h3 className="text-base font-semibold text-slate-700">No productivity sessions found</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Activity records submitted during the day or at logout will appear here with hours logged.
              </p>
              <Button
                variant="outline"
                className="mt-4 gap-2"
                onClick={() => setShowLogModal(true)}
              >
                <Plus className="w-4 h-4" />
                Log Your Work
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b">
                  <tr>
                    <th className="py-3.5 px-4">Date & Time</th>
                    {isPrivileged && activeTab === "all" && (
                      <th className="py-3.5 px-4">Employee</th>
                    )}
                    <th className="py-3.5 px-4">Activity Type</th>
                    <th className="py-3.5 px-4">Job Card / Order</th>
                    <th className="py-3.5 px-4">Duration</th>
                    <th className="py-3.5 px-4">Session Notes</th>
                    <th className="py-3.5 px-4 text-right">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log: any) => {
                    const logId = log._id || log.id;
                    const activityColor = ACTIVITY_COLORS[log.activityType] || "bg-slate-100 text-slate-800 border-slate-200";

                    return (
                      <tr key={logId} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                          {format(new Date(log.timestamp), "dd MMM yyyy, HH:mm")}
                        </td>

                        {isPrivileged && activeTab === "all" && (
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center font-bold text-xs text-slate-700">
                                {log.userId?.fullName?.charAt(0) || "U"}
                              </div>
                              <div>
                                <span className="font-semibold text-slate-900 block leading-tight">
                                  {log.userId?.fullName || "Employee"}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  {log.userId?.employeeType || log.userId?.designation || ""}
                                </span>
                              </div>
                            </div>
                          </td>
                        )}

                        <td className="py-3 px-4">
                          <Badge variant="outline" className={`border ${activityColor} text-xs font-medium`}>
                            {log.activityType}
                          </Badge>
                        </td>

                        <td className="py-3 px-4">
                          {log.jobCardId ? (
                            <div>
                              <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-indigo-700">
                                <Printer className="w-3.5 h-3.5 text-purple-600" />
                                {log.jobCardId.jobCardNumber}
                              </div>
                              <div className="text-xs text-slate-500 truncate max-w-[200px]">
                                {log.jobCardId.title}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">
                              General Floor Work
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 font-bold text-slate-800">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            {log.hoursSpent} hrs
                            <span className="text-xs font-normal text-muted-foreground">
                              ({log.durationMinutes}m)
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-4 max-w-xs truncate text-xs text-slate-600">
                          {log.notes || "—"}
                        </td>

                        <td className="py-3 px-4 text-right">
                          {log.isLogoutSession ? (
                            <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-800 border-amber-200">
                              <LogOut className="w-3 h-3 mr-1" />
                              Logout Popup
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-slate-500">
                              Manual Log
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* LOG WORK SESSION MODAL */}
      <Dialog open={showLogModal} onOpenChange={setShowLogModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-600" />
              Log Print Floor Work Session
            </DialogTitle>
            <DialogDescription>
              Record the job card worked on and the activity performed.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleManualSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="jobCard">Job Card / Order</Label>
              <Select
                value={formJobCardId}
                onValueChange={setFormJobCardId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Job Card" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">
                    -- General Floor / Shop Operations --
                  </SelectItem>
                  {jobCards.map((card: any) => {
                    const cId = card._id || card.id;
                    return (
                      <SelectItem key={cId} value={cId}>
                        {card.jobCardNumber} — {card.title} ({card.clientName})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="activity">Activity Type *</Label>
              <Select
                value={formActivityType}
                onValueChange={setFormActivityType}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Activity" />
                </SelectTrigger>
                <SelectContent>
                  {activityTypes.map((act: string) => (
                    <SelectItem key={act} value={act}>
                      {act}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="duration">Duration (Minutes)</Label>
              <div className="grid grid-cols-4 gap-2">
                {[30, 60, 120, 240].map((mins) => (
                  <Button
                    key={mins}
                    type="button"
                    variant={formDurationMinutes === mins ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={() => setFormDurationMinutes(mins)}
                  >
                    {mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                  </Button>
                ))}
              </div>
              <Input
                type="number"
                min="10"
                max="720"
                value={formDurationMinutes}
                onChange={(e) => setFormDurationMinutes(Number(e.target.value))}
                className="mt-2 text-sm"
                placeholder="Or enter custom minutes"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Work Notes / Machine / Output Details</Label>
              <Textarea
                id="notes"
                placeholder="e.g., Completed 500 impressions on Heidelberg 4-color press, checked color density."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={3}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowLogModal(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={logActivityMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {logActivityMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Work Session"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
