"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Clock,
  Users,
  FolderKanban,
  CheckSquare,
  TrendingUp,
  Calendar,
  ArrowRight,
  Activity,
  Layout,
} from "lucide-react";
import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { api, notificationAPI, attendanceAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export default function DashboardPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "ADMIN";
  const isManager = user?.role === "MANAGER";
  const isHead = isAdmin || isManager;

  // Fetch dashboard analytics (For Admin/Manager)
  const { data: analyticsData, isLoading } = useQuery({
    queryKey: ["dashboard-analytics"],
    queryFn: async () => {
      const response = await api.get("/reports/dashboard-analytics");
      return response.data.data;
    },
    enabled: isHead,
  });

  // Fetch today's attendance (For Managers and Employees)
  const { data: todayAttendance } = useQuery({
    queryKey: ["attendance", "today"],
    queryFn: async () => {
      const response = await attendanceAPI.getTodayAttendance();
      return response.data.data;
    },
    enabled: user?.role !== "ADMIN",
  });
  // Fetch recent notifications
  const { data: notificationsData, isLoading: isLoadingNotifications } = useQuery({
    queryKey: ["recent-notifications"],
    queryFn: async () => {
      const response = await notificationAPI.getNotifications(false, 5);
      return response.data;
    },
  });

  const recentNotifications = notificationsData?.notifications || [];

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg p-4 sm:p-6 md:p-8 text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-2">
              Welcome Back, {user?.fullName}! 👋
            </h1>
            <p className="text-blue-100 text-sm sm:text-base md:text-lg">
              {format(new Date(), "EEEE, MMMM d, yyyy")}
            </p>
            <div className="flex items-center gap-2 sm:gap-3 mt-3 sm:mt-4 flex-wrap">
              <span className="px-2 py-1 sm:px-3 bg-white/20 rounded-full text-xs sm:text-sm">
                {user?.role}
              </span>
              {user?.designation && (
                <span className="px-2 py-1 sm:px-3 bg-white/20 rounded-full text-xs sm:text-sm">
                  {user.designation}
                </span>
              )}
            </div>
          </div>
          <div className="hidden sm:block">
            <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm">
              <Activity className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12" />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {isHead && (
          <StatCard
            title="Active Employees"
            value={analyticsData?.activeEmployees?.toString() || "0"}
            icon={Users}
            description="Total active users"
            className="border-l-4 border-blue-500"
          />
        )}
        <StatCard
          title={isManager ? "My Attendance" : "Today's Attendance"}
          value={
            todayAttendance?.punchInTime
              ? format(new Date(todayAttendance.punchInTime), "hh:mm a")
              : (isAdmin ? (analyticsData?.todayAttendance?.toString() || "0") : "Not Punched In")
          }
          icon={Clock}
          description={isAdmin ? "Employees present" : (todayAttendance?.punchInTime ? "Punched In" : "Click to mark")}
          className="border-l-4 border-green-500"
        />
        <StatCard
          title={isAdmin ? "Pending Tasks" : "Active Tasks"}
          value={
            isAdmin 
              ? (analyticsData?.pendingTasks?.toString() || "0")
              : (analyticsData?.activeTasks?.toString() || "0")
          }
          icon={CheckSquare}
          description={isAdmin ? "Company-wide" : "Your tasks"}
          className="border-l-4 border-orange-500"
        />
        <StatCard
          title="Active Projects"
          value={analyticsData?.activeProjects?.toString() || "0"}
          icon={Layout}
          description={isHead ? "In progress" : "Assigned to you"}
          className="border-l-4 border-purple-500"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Quick Actions / Main Links */}
        <div className="lg:col-span-2 space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <Card className="hover:shadow-lg transition-all duration-300 cursor-pointer overflow-hidden border-none shadow-md group">
              <Link href="/projects">
                <div className="p-1 bg-indigo-600 h-1 w-full opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                      <FolderKanban className="w-5 h-5" />
                    </div>
                    My Projects
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    View projects assigned to you and track progress
                  </p>
                  <Button className="w-full gap-2 group-hover:bg-indigo-600 group-hover:text-white transition-colors" variant="outline">
                    View Projects <ArrowRight className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Link>
            </Card>

            <Card className="hover:shadow-lg transition-all duration-300 cursor-pointer overflow-hidden border-none shadow-md group">
              <Link href="/tasks">
                <div className="p-1 bg-blue-600 h-1 w-full opacity-0 group-hover:opacity-100 transition-opacity" />
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                      <CheckSquare className="w-5 h-5" />
                    </div>
                    My Tasks
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    View and manage your tasks and subtasks
                  </p>
                  <Button className="w-full gap-2 group-hover:bg-blue-600 group-hover:text-white transition-colors" variant="outline">
                    View Tasks <ArrowRight className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Link>
            </Card>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {user?.role !== "ADMIN" && (
              <Card className="hover:shadow-lg transition-all duration-300 cursor-pointer border-none shadow-md group">
                <Link href="/attendance">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-green-50 text-green-600">
                        <Clock className="w-5 h-5" />
                      </div>
                      Punch In/Out
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      Mark your attendance for today
                    </p>
                    <Button className="w-full gap-2 bg-green-600 hover:bg-green-700">
                      Go to Attendance <ArrowRight className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Link>
              </Card>
            )}

            {user?.role !== "ADMIN" && (
              <Card className="hover:shadow-lg transition-all duration-300 cursor-pointer border-none shadow-md group">
                <Link href="/leave">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-orange-50 text-orange-600">
                        <Calendar className="w-5 h-5" />
                      </div>
                      Apply Leave
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      Request time off or check leave balance
                    </p>
                    <Button className="w-full gap-2" variant="outline">
                      Apply Leave <ArrowRight className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Link>
              </Card>
            )}
          </div>
        </div>

        {/* Sidebar Analytics */}
        <div className="space-y-6 col-span-1">
          <Card className="border-none shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4 text-slate-500" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {isLoadingNotifications ? (
                  <div className="flex justify-center p-4">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : recentNotifications.length === 0 ? (
                  <div className="flex items-center gap-3 text-sm italic py-8 justify-center flex-col">
                    <Activity className="w-8 h-8 text-slate-200" />
                    <span className="text-muted-foreground">No recent activity</span>
                  </div>
                ) : (
                  recentNotifications.map((notif: any) => (
                    <div key={notif.id || notif._id} className="flex gap-3 text-sm pb-3 border-b border-slate-50 last:border-0 last:pb-0">
                      <div className={cn(
                        "w-2 h-2 rounded-full mt-1.5 shrink-0",
                        notif.isRead ? "bg-slate-200" : "bg-blue-500"
                      )} />
                      <div className="flex-1 space-y-1">
                        <p className={cn("font-semibold text-slate-800 text-xs", !notif.isRead && "text-foreground")}>
                          {notif.title}
                        </p>
                        <p className="text-slate-500 text-[11px] line-clamp-2">
                          {notif.message}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                {recentNotifications.length > 0 && (
                  <Link href="/notifications" className="block text-center text-xs font-semibold text-primary hover:underline pt-2">
                    View All activity
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>

          {(user?.role === "ADMIN" || user?.role === "MANAGER") && (
            <Card className="border-none shadow-md overflow-hidden bg-gradient-to-br from-slate-50 to-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-slate-700">
                  <TrendingUp className="w-4 h-4" />
                  Team Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 pt-2">
                <div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-slate-500 font-medium">Team Attendance</span>
                    <span className="font-bold text-slate-700">{analyticsData?.performance?.attendanceRate || 0}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-1000"
                      style={{ width: `${analyticsData?.performance?.attendanceRate || 0}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-slate-500 font-medium">Task Completion</span>
                    <span className="font-bold text-slate-700">{analyticsData?.performance?.taskCompletionRate || 0}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                    <div
                      className="h-full bg-blue-500 transition-all duration-1000"
                      style={{ width: `${analyticsData?.performance?.taskCompletionRate || 0}%` }}
                    />
                  </div>
                </div>
                <div className="pt-2">
                  <p className="text-[10px] text-slate-400 text-center italic">
                    Analytics updated daily
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
