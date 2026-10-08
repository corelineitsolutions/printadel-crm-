"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Clock,
  MapPin,
  Calendar,
  TrendingUp,
  CheckCircle,
  XCircle,
  AlertCircle,
  Coffee,
  Loader2,
  Play,
  RotateCcw,
  Plus,
  Home,
  Download,
  BarChart3,
  CalendarDays,
  ListRestart,
  Image as ImageIcon,
  Eye,
  X,
  Wifi,
  WifiOff
} from "lucide-react";
import { attendanceAPI, api, productivityAPI } from "@/lib/api";
import {
  WorkActivitySelector,
  WorkEntry,
  HELP_SUPPORT,
  MAX_HELP_SUPPORT,
  countHelpSupport,
  toActivityPayload,
} from "@/components/productivity/work-activity-selector";
import { format, subDays, startOfMonth } from "date-fns";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/store/authStore";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";

interface Location {
  lat: number;
  lng: number;
  accuracy?: number;
}

const formatWorkingHours = (hours: number | undefined) => {
  if (!hours) return "0h 0m";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
};

type AttendanceBreak = { startTime: string; endTime?: string; durationMinutes?: number };

const getBreakMinutes = (b: AttendanceBreak, now: Date) => {
  if (b.endTime && typeof b.durationMinutes === "number") return b.durationMinutes;
  const end = b.endTime ? new Date(b.endTime) : now;
  return Math.max(0, Math.floor((end.getTime() - new Date(b.startTime).getTime()) / 60000));
};

const formatMinutes = (minutes: number) =>
  minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;

export default function AttendancePage() {
  const queryClient = useQueryClient();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [location, setLocation] = useState<Location | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationPermission, setLocationPermission] = useState<PermissionState | null>(null);
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const { user, setPunchStatus, markActivityLoggedToday } = useAuthStore();
  const isAdminOrManager = user?.role === "ADMIN" || user?.role === "MANAGER";

  // Tabs state
  const [activeTab, setActiveTab] = useState("tracking");

  // Correction Modal State
  const [showCorrectionDialog, setShowCorrectionDialog] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [correctionData, setCorrectionData] = useState({
    date: "",
    requestedPunchIn: "",
    requestedPunchOut: "",
    reason: "",
  });

  const [localDateFilter, setLocalDateFilter] = useState("");

  const [showPunchOutDialog, setShowPunchOutDialog] = useState(false);
  const [workSummary, setWorkSummary] = useState("");
  const [activityEntries, setActivityEntries] = useState<WorkEntry[]>([]);

  const [imagePreviewModal, setImagePreviewModal] = useState<{
    isOpen: boolean;
    images: string[];
    title: string;
  }>({
    isOpen: false,
    images: [],
    title: "",
  });

  const [isWFHMode, setIsWFHMode] = useState(false);

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      return;
    }

    setIsDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
        });
        setLocationError(null);
        setLocationPermission("granted");
        setShowLocationPrompt(false);
        setIsDetectingLocation(false);
      },
      (error) => {
        if (error.code === 1) {
          setLocationPermission("denied");
          setShowLocationPrompt(true);
        }
        setLocationError(
          error.code === 1
            ? "Location access denied. Please enable location permissions."
            : "Unable to retrieve your location. Please try again."
        );
        setIsDetectingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  // Ask for location permission as soon as an employee opens the page
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      return;
    }

    let permissionStatus: PermissionStatus | null = null;
    const handlePermissionChange = () => {
      if (!permissionStatus) return;
      setLocationPermission(permissionStatus.state);
      if (permissionStatus.state === "granted") requestLocation();
    };

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((status) => {
          permissionStatus = status;
          setLocationPermission(status.state);
          status.addEventListener("change", handlePermissionChange);
          if (status.state === "granted") {
            requestLocation();
          } else {
            setShowLocationPrompt(true);
          }
        })
        .catch(() => requestLocation());
    } else {
      requestLocation();
    }

    return () => {
      permissionStatus?.removeEventListener("change", handlePermissionChange);
    };
  }, [requestLocation]);

  // Fetch today's attendance
  const { data: attendance, isLoading } = useQuery({
    queryKey: ["attendance", "today"],
    queryFn: async () => {
      const response = await attendanceAPI.getTodayAttendance();
      return response.data.data;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const { data: networkStatus, isFetching: isCheckingNetwork, refetch: recheckNetwork } = useQuery({
    queryKey: ["attendance", "network-status"],
    queryFn: async () => {
      const response = await attendanceAPI.getNetworkStatus();
      return response.data.data as {
        ip: string;
        ipIsPrivate?: boolean;
        onOfficeWifi: boolean;
        officeName: string | null;
        officeHasWifi?: boolean;
      };
    },
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });
  const onOfficeWifi = !!networkStatus?.onOfficeWifi;
  const canVerifyPresence = onOfficeWifi || !!location;

  // Sync punch status with Auth Store
  useEffect(() => {
    if (attendance) {
      // If they have a punchIn but no punchOut, they are active
      const active = !!attendance.punchInTime && !attendance.punchOutTime;
      setPunchStatus(active);
    } else {
      setPunchStatus(false);
    }
  }, [attendance, setPunchStatus]);

  // Fetch attendance history
  const { data: attendanceHistory } = useQuery({
    queryKey: ["attendance", "history"],
    queryFn: async () => {
      const response = await attendanceAPI.getMyAttendance();
      return response.data.data;
    },
  });

  // Attendance Report State & Query
  const [reportStartDate, setReportStartDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  );
  const [reportEndDate, setReportEndDate] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  );
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("all");

  // Fetch employees for filter (Managers/Admins only)
  const { data: employeesData } = useQuery({
    queryKey: ["employees", "list-simple"],
    queryFn: async () => {
      const response = await api.get("/employees?limit=1000");
      return response.data.data.employees;
    },
    enabled: isAdminOrManager,
  });

  const { data: myReport, isLoading: reportLoading } = useQuery({
    queryKey: ["my-attendance-report", reportStartDate, reportEndDate, selectedEmployeeId],
    queryFn: async () => {
      const params: any = {
        startDate: reportStartDate,
        endDate: reportEndDate
      };
      if (selectedEmployeeId !== "all") {
        params.userId = selectedEmployeeId;
      }
      const response = await api.get("/reports/attendance", { params });
      return response.data.data;
    },
    enabled: !!user,
    refetchInterval: reportStartDate === format(new Date(), "yyyy-MM-dd") && reportEndDate === format(new Date(), "yyyy-MM-dd") ? 30000 : false,
  });

  // Overtime Tracking State & Query
  const [overtimeEmployeeFilter, setOvertimeEmployeeFilter] = useState<string>("all");
  const [overtimeMonth, setOvertimeMonth] = useState<number>(new Date().getMonth() + 1);
  const [overtimeYear, setOvertimeYear] = useState<number>(new Date().getFullYear());

  const { data: overtimeData, isLoading: isOvertimeLoading } = useQuery({
    queryKey: ["overtime-report", overtimeEmployeeFilter, overtimeMonth, overtimeYear],
    queryFn: async () => {
      const params: any = {
        month: overtimeMonth,
        year: overtimeYear,
      };
      if (overtimeEmployeeFilter !== "all") {
        params.employeeId = overtimeEmployeeFilter;
      }
      const response = await attendanceAPI.getOvertime(params);
      return response.data?.data;
    },
    enabled: activeTab === "overtime",
  });

  // Calculate Day-wise Summary for Managers/Admins
  const dayWiseStats = useMemo(() => {
    if (!myReport?.attendances || !isAdminOrManager || selectedEmployeeId !== "all") return null;

    const statsMap: Record<string, any> = {};

    myReport.attendances.forEach((record: any) => {
      // Don't count System Admin in summary
      if (record.user?.fullName === "System Admin") return;

      const dateKey = format(new Date(record.date), "yyyy-MM-dd");
      if (!statsMap[dateKey]) {
        statsMap[dateKey] = {
          date: record.date,
          present: 0,
          absent: 0,
          halfDay: 0,
          leave: 0,
          wfh: 0,
          holiday: 0,
          weekend: 0
        };
      }

      const s = statsMap[dateKey];
      const status = record.status as string;
      if (status === "PRESENT") s.present++;
      else if (status === "WORK_FROM_HOME") s.wfh++;
      else if (status === "ABSENT") s.absent++;
      else if (status.startsWith("HALF_DAY")) s.halfDay++;
      else if (["LEAVE", "SICK", "CASUAL", "VACATION", "UNPAID"].some(type => status.includes(type))) s.leave++;
      else if (status === "HOLIDAY") s.holiday++;
      else if (status === "WEEKEND") s.weekend++;
    });

    return Object.values(statsMap).sort((a: any, b: any) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [myReport?.attendances, isAdminOrManager, selectedEmployeeId]);

  // Filtered attendances for the Detailed Log
  const filteredAttendances = useMemo(() => {
    if (!myReport?.attendances) return [];

    // Filter out System Admin and apply date filter
    return myReport.attendances.filter((rec: any) => {
      if (rec.user?.fullName === "System Admin") return false;
      if (!localDateFilter) return true;
      return format(new Date(rec.date), "yyyy-MM-dd") === localDateFilter;
    });
  }, [myReport?.attendances, localDateFilter]);

  // Punch In mutation
  const punchInMutation = useMutation({
    mutationFn: (isWFH: boolean) => {
      if (!canVerifyPresence) throw new Error("Location not available");
      return attendanceAPI.punchIn(location, isWFH);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success("Punched in successfully!");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to punch in");
    },
  });

  // Punch Out mutation
  const punchOutMutation = useMutation({
    mutationFn: async ({ summary, activities }: { summary: string; activities: WorkEntry[] }) => {
      if (!canVerifyPresence) throw new Error("Location not available");
      await attendanceAPI.punchOut(location, summary);

      let activityError: string | null = null;
      if (activities.length > 0) {
        try {
          await productivityAPI.logActivities({
            entries: toActivityPayload(activities),
            notes: summary.trim(),
            isLogoutSession: true,
          });
        } catch (error: any) {
          activityError =
            error.response?.data?.message || "Job card activity could not be recorded";
        }
      }
      return { activityError };
    },
    onSuccess: ({ activityError }) => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["jobCards"] });
      toast.success("Punched out successfully!");
      if (activityError) {
        toast.error(`Punched out, but ${activityError}`);
      } else {
        markActivityLoggedToday();
      }
      setShowPunchOutDialog(false);
      setWorkSummary("");
      setActivityEntries([]);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to punch out");
    },
  });

  // Start Break mutation
  const startBreakMutation = useMutation({
    mutationFn: () => attendanceAPI.startBreak(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success("Break started - time not counted in working hours");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to start break");
    },
  });

  // End Break mutation
  const endBreakMutation = useMutation({
    mutationFn: () => attendanceAPI.endBreak(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success("Break ended - welcome Back!");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to end break");
    },
  });

  // Request Correction mutation
  const correctionMutation = useMutation({
    mutationFn: (data: any) => attendanceAPI.requestCorrection(data),
    onSuccess: () => {
      toast.success("Correction request submitted!");
      setShowCorrectionDialog(false);
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to submit request");
    },
  });

  // Manual Status Update mutation (Admin/Manager)
  const updateStatusMutation = useMutation({
    mutationFn: (data: { id: string; status: string; date: string; userId: string }) =>
      attendanceAPI.updateStatus(data.id, { status: data.status, date: data.date, userId: data.userId }),
    onSuccess: () => {
      toast.success("Attendance status updated successfully!");
      queryClient.invalidateQueries({ queryKey: ["my-attendance-report"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to update status");
    },
  });

  const openCorrectionDialog = (record?: any) => {
    if (record) {
      setSelectedRecord(record);
      setCorrectionData({
        date: format(new Date(record.date), "yyyy-MM-dd"),
        requestedPunchIn: record.punchInTime
          ? format(new Date(record.punchInTime), "HH:mm")
          : "",
        requestedPunchOut: record.punchOutTime
          ? format(new Date(record.punchOutTime), "HH:mm")
          : "",
        reason: "",
      });
    } else {
      setSelectedRecord(null);
      setCorrectionData({
        date: format(new Date(), "yyyy-MM-dd"),
        requestedPunchIn: "",
        requestedPunchOut: "",
        reason: "",
      });
    }
    setShowCorrectionDialog(true);
  };

  const handleCorrectionSubmit = () => {
    // Combine date and time
    const { date, requestedPunchIn, requestedPunchOut, reason } = correctionData;

    let punchInISO;
    let punchOutISO;

    if (requestedPunchIn) {
      punchInISO = new Date(`${date}T${requestedPunchIn}:00`).toISOString();
    }
    if (requestedPunchOut) {
      punchOutISO = new Date(`${date}T${requestedPunchOut}:00`).toISOString();
    }

    // Sanitize attendanceId: If it starts with 'v' (virtual ID for absentee/holiday), set to undefined
    const rawId = selectedRecord?.id || selectedRecord?._id;
    const sanitizedId = (typeof rawId === 'string' && rawId.startsWith('v')) ? undefined : rawId;

    correctionMutation.mutate({
      attendanceId: sanitizedId,
      date,
      reason,
      requestedPunchIn: punchInISO,
      requestedPunchOut: punchOutISO,
    });
  };

  const exportToCSV = () => {
    if (!myReport?.attendances?.length) return;

    const headers = ["Employee", "Date", "Punch In", "Punch Out", "Working Hours", "Status"];
    const rows = myReport.attendances.map((rec: any) => [
      `"${rec.user?.fullName || "—"}"`,
      format(new Date(rec.date), "yyyy-MM-dd"),
      rec.punchInTime ? format(new Date(rec.punchInTime), "hh:mm a") : "—",
      rec.punchOutTime ? format(new Date(rec.punchOutTime), "hh:mm a") : "—",
      rec.workingHours?.toFixed(2) || "0.00",
      rec.status || "—"
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row: string[]) => row.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.style.display = 'none';
    link.href = url;
    link.download = `attendance_report_${reportStartDate}_to_${reportEndDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  const isPunchedIn = attendance?.punchInTime && !attendance?.punchOutTime;
  const isPunchedOut = attendance?.punchOutTime;
  const isOnBreak = !!attendance?.breaks?.some((b: any) => !b.endTime);
  const todayBreaks: AttendanceBreak[] = attendance?.breaks || [];
  const activeBreak = todayBreaks.find((b) => !b.endTime);
  const totalBreakMinutes = todayBreaks.reduce((sum, b) => sum + getBreakMinutes(b, currentTime), 0);

  // Calculate working time
  const calculateWorkingTime = () => {
    if (!attendance?.punchInTime) return "0h 0m";

    const punchIn = new Date(attendance.punchInTime);
    const now = attendance.punchOutTime
      ? new Date(attendance.punchOutTime)
      : currentTime;

    // Total time since punch in
    let totalMinutes = Math.floor((now.getTime() - punchIn.getTime()) / 1000 / 60);

    // Subtract completed breaks
    const breakDuration = attendance.breakDuration || 0;

    // If currently on break, subtract time since current break started
    let activeBreakMinutes = 0;
    if (isOnBreak) {
      const activeBreak = attendance.breaks.find((b: any) => !b.endTime);
      if (activeBreak) {
        activeBreakMinutes = Math.floor((currentTime.getTime() - new Date(activeBreak.startTime).getTime()) / 1000 / 60);
      }
    }

    const workingMinutes = Math.max(0, totalMinutes - breakDuration - activeBreakMinutes);
    const hours = Math.floor(workingMinutes / 60);
    const minutes = workingMinutes % 60;

    return `${hours}h ${minutes}m`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Attendance</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Track your daily attendance and working hours
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdminOrManager && (
            <>
              <Link href="/attendance/corrections">
                <Button variant="outline" className="gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Correction Requests
                </Button>
              </Link>
              <Link href="/attendance/wfh">
                <Button variant="outline" className="gap-2">
                  <Home className="w-4 h-4" />
                  Manage WFH Auths
                </Button>
              </Link>
            </>
          )}
          <Button onClick={() => openCorrectionDialog()} variant="secondary" className="gap-2 text-white bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4" />
            Report Missing
          </Button>
        </div>
      </div>

      {/* Main Content with Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="mb-2 h-auto w-full flex flex-wrap justify-start gap-1 sm:w-auto sm:inline-flex">
          <TabsTrigger value="tracking" className="gap-2">
            <ListRestart className="w-4 h-4" />
            Daily Tracking
          </TabsTrigger>
          <TabsTrigger value="report" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            Attendance Report
          </TabsTrigger>
          <TabsTrigger value="overtime" className="gap-2">
            <Clock className="w-4 h-4" />
            Overtime Tracking
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Daily Tracking (Existing View) */}
        <TabsContent value="tracking" className="space-y-6">
          {/* Main Attendance Card + Stats */}
            <div className="grid gap-6 md:grid-cols-3">
              {/* Punch In/Out Card */}
              <Card className="md:col-span-2">
                <CardContent className="p-8">
                  {/* Current Time Display */}
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <p className="text-sm text-muted-foreground">Current Time</p>
                      <h2 className="text-4xl font-bold">
                        {format(currentTime, "hh:mm:ss a")}
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        {format(currentTime, "EEEE, MMMM d, yyyy")}
                      </p>
                    </div>
                    <Clock className="w-16 h-16 text-primary" />
                  </div>

                  {/* Location Status & Mode selection */}
                  <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg border">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="w-4 h-4" />
                        <span className="font-semibold text-sm">Location Status</span>
                      </div>
                      {isDetectingLocation ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Detecting your location...</span>
                        </div>
                      ) : locationError ? (
                        <div className="space-y-2">
                          <div className="flex items-start gap-2 text-sm text-red-600">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{locationError}</span>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() =>
                              locationPermission === "denied"
                                ? setShowLocationPrompt(true)
                                : requestLocation()
                            }
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Retry Location
                          </Button>
                        </div>
                      ) : location ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-sm text-green-600 min-w-0">
                              <CheckCircle className="w-4 h-4 shrink-0" />
                              <span className="truncate">
                                Location detected
                                {location.accuracy ? ` (±${location.accuracy} m)` : ""}
                              </span>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 gap-1 text-xs shrink-0"
                              onClick={requestLocation}
                            >
                              <RotateCcw className="w-3 h-3" />
                              Refresh
                            </Button>
                          </div>
                          {location.accuracy !== undefined && location.accuracy > 1000 && (
                            <p className="text-xs text-amber-600">
                              Location is imprecise. Turn on Wi-Fi and Windows location services, then refresh — or use your phone.
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm text-muted-foreground">Location not detected</span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 gap-1 text-xs shrink-0"
                            onClick={requestLocation}
                          >
                            <MapPin className="w-3 h-3" />
                            Allow location
                          </Button>
                        </div>
                      )}

                      <div className="mt-3 pt-3 border-t flex items-center justify-between gap-2">
                        <div
                          className={`flex items-center gap-2 text-sm min-w-0 ${
                            onOfficeWifi ? "text-green-600" : "text-muted-foreground"
                          }`}
                        >
                          {onOfficeWifi ? <Wifi className="w-4 h-4 shrink-0" /> : <WifiOff className="w-4 h-4 shrink-0" />}
                          <span className="truncate">
                            {networkStatus === undefined
                              ? "Checking office Wi-Fi..."
                              : onOfficeWifi
                                ? `Connected to ${networkStatus.officeName || "office"} Wi-Fi`
                                : "Not on office Wi-Fi"}
                          </span>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 gap-1 text-xs shrink-0"
                          onClick={() => recheckNetwork()}
                          disabled={isCheckingNetwork}
                        >
                          <RotateCcw className={`w-3 h-3 ${isCheckingNetwork ? "animate-spin" : ""}`} />
                          Check
                        </Button>
                      </div>
                      {onOfficeWifi && !location && (
                        <p className="text-xs text-muted-foreground mt-1">
                          You can punch in and out without location while on the office Wi-Fi.
                        </p>
                      )}
                      {networkStatus?.ip && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Your network IP: <span className="font-mono">{networkStatus.ip}</span>
                        </p>
                      )}
                      {networkStatus?.ipIsPrivate && (
                        <p className="text-xs text-amber-600 mt-1">
                          The server cannot see your public IP, so office Wi-Fi cannot be detected. Ask your administrator to update the backend.
                        </p>
                      )}
                    </div>

                    {!isPunchedIn && !isPunchedOut && (
                      <div className="p-4 rounded-lg border flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-semibold flex items-center gap-2">
                            <Home className="w-4 h-4" />
                            WFH Mode
                          </Label>
                          <p className="text-xs text-muted-foreground">Requires prior authorizaton</p>
                        </div>
                        <Switch
                          checked={isWFHMode}
                          onCheckedChange={setIsWFHMode}
                        />
                      </div>
                    )}
                  </div>

                  {/* Punch In/Out Buttons */}
                  <div className="space-y-4">
                    {!isPunchedIn && !isPunchedOut && (
                      <Button
                        size="lg"
                        className={`w-full h-12 ${isWFHMode ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"}`}
                        onClick={() => punchInMutation.mutate(isWFHMode)}
                        disabled={!canVerifyPresence || punchInMutation.isPending || (isDetectingLocation && !onOfficeWifi)}
                      >
                        {punchInMutation.isPending ? (
                          <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            Punching In...
                          </>
                        ) : (
                          <>
                            {isWFHMode ? <Home className="w-5 h-5 mr-2" /> : <CheckCircle className="w-5 h-5 mr-2" />}
                            Punch In {isWFHMode ? "(WFH)" : "(Office)"}
                          </>
                        )}
                      </Button>
                    )}

                    {isPunchedIn && !isOnBreak && (
                      <div className="space-y-3">
                        <Button
                          size="lg"
                          variant="outline"
                          className="w-full border-orange-300 text-orange-700 hover:bg-orange-50 h-12"
                          onClick={() => startBreakMutation.mutate()}
                          disabled={startBreakMutation.isPending}
                        >
                          {startBreakMutation.isPending ? (
                            <>
                              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                              Starting Break...
                            </>
                          ) : (
                            <>
                              <Coffee className="w-5 h-5 mr-2" />
                              Start Break
                            </>
                          )}
                        </Button>

                        <Button
                          size="lg"
                          className="w-full bg-red-600 hover:bg-red-700 h-12"
                          onClick={() => setShowPunchOutDialog(true)}
                          disabled={
                            !canVerifyPresence ||
                            punchOutMutation.isPending ||
                            (isDetectingLocation && !onOfficeWifi) ||
                            isOnBreak
                          }
                        >
                          {punchOutMutation.isPending ? (
                            <>
                              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                              Punching Out...
                            </>
                          ) : (
                            <>
                              <XCircle className="w-5 h-5 mr-2" />
                              Punch Out
                            </>
                          )}
                        </Button>
                      </div>
                    )}

                    {isOnBreak && (
                      <div className="space-y-3">
                        <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                          <div className="flex items-center gap-2 text-orange-700 mb-2">
                            <Coffee className="w-5 h-5 animate-pulse" />
                            <span className="font-semibold">You are on break</span>
                          </div>
                          {activeBreak && (
                            <p className="text-sm font-medium text-orange-700 mb-1">
                              Started at {format(new Date(activeBreak.startTime), "hh:mm a")} ·{" "}
                              {formatMinutes(getBreakMinutes(activeBreak, currentTime))} so far
                            </p>
                          )}
                          <p className="text-sm text-orange-600">
                            Break time is not counted in working hours
                          </p>
                        </div>

                        <Button
                          size="lg"
                          className="w-full bg-green-600 hover:bg-green-700 h-12"
                          onClick={() => endBreakMutation.mutate()}
                          disabled={endBreakMutation.isPending}
                        >
                          {endBreakMutation.isPending ? (
                            <>
                              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                              Ending Break...
                            </>
                          ) : (
                            <>
                              <Play className="w-5 h-5 mr-2" />
                              End Break & Resume Work
                            </>
                          )}
                        </Button>
                      </div>
                    )}

                    {isPunchedOut && (
                      <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center gap-2 text-green-700">
                          <CheckCircle className="w-5 h-5" />
                          <span className="font-semibold">
                            Attendance marked for today!
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Today's Attendance Summary */}
                  {attendance && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Punch In</p>
                        <p className="font-semibold">
                          {attendance.punchInTime
                            ? format(new Date(attendance.punchInTime), "hh:mm a")
                            : "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Punch Out</p>
                        <p className="font-semibold">
                          {attendance.punchOutTime
                            ? format(new Date(attendance.punchOutTime), "hh:mm a")
                            : "-"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Working Time</p>
                        <p className="font-semibold text-green-600">
                          {calculateWorkingTime()}
                        </p>
                      </div>
                    </div>
                  )}

                  {todayBreaks.length > 0 && (
                    <div className="mt-6 pt-6 border-t">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold flex items-center gap-2">
                          <Coffee className="w-4 h-4 text-orange-600" />
                          Breaks Today ({todayBreaks.length})
                        </p>
                        <span className="text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
                          Total {formatMinutes(totalBreakMinutes)}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {todayBreaks.map((b, idx) => (
                          <div
                            key={`${b.startTime}-${idx}`}
                            className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                          >
                            <span className="text-muted-foreground">Break {idx + 1}</span>
                            <span className="font-medium">
                              {format(new Date(b.startTime), "hh:mm a")} –{" "}
                              {b.endTime ? format(new Date(b.endTime), "hh:mm a") : (
                                <span className="text-orange-600">Ongoing</span>
                              )}
                            </span>
                            <span className="font-semibold text-orange-700 tabular-nums">
                              {formatMinutes(getBreakMinutes(b, currentTime))}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Stats Cards */}
              <div className="space-y-4">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-3">
                      <TrendingUp className="w-8 h-8 text-blue-600" />
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                        This Month
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold">
                      {attendanceHistory?.summary?.presentDays || 0}
                    </h3>
                    <p className="text-sm text-muted-foreground">Days Present</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-3">
                      <Clock className="w-8 h-8 text-green-600" />
                      <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                        Total
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold">
                      {Math.round(attendanceHistory?.summary?.totalHours || 0)}h
                    </h3>
                    <p className="text-sm text-muted-foreground">Hours Worked</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-3">
                      <Coffee className="w-8 h-8 text-orange-600" />
                      <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">
                        WFH
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold">
                      {attendanceHistory?.summary?.wfhDays || 0}
                    </h3>
                    <p className="text-sm text-muted-foreground">Work From Home</p>
                  </CardContent>
                </Card>
              </div>
            </div>

          {/* Attendance History */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Recent History
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-primary"
                  onClick={() => setActiveTab("report")}
                >
                  View Full Report
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {attendanceHistory?.attendances
                    ?.slice(0, 10)
                    .map((record: any) => (
                      <div
                        key={record.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors gap-3"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Calendar className="w-6 h-6 text-primary" />
                          </div>
                          <div>
                            <p className="font-semibold">
                              {format(new Date(record.date), "EEEE, MMM d, yyyy")}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {record.punchInTime &&
                                format(new Date(record.punchInTime), "hh:mm a")}
                              {record.punchOutTime &&
                                ` - ${format(
                                  new Date(record.punchOutTime),
                                  "hh:mm a"
                                )}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                          <div className="text-right">
                            <p className="font-semibold whitespace-nowrap">
                              {formatWorkingHours(record.workingHours)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Working Hours
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-blue-600"
                            onClick={() => openCorrectionDialog(record)}
                          >
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                          <span
                            className={`px-3 py-1 text-xs rounded-full font-medium ${record.status === "PRESENT"
                              ? "bg-green-100 text-green-800"
                              : record.status === "WORK_FROM_HOME"
                                ? "bg-orange-100 text-orange-800"
                                : record.status === "WEEKEND"
                                  ? "bg-blue-100 text-blue-800"
                                  : record.status === "HOLIDAY"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-gray-100 text-gray-800"
                              }`}
                          >
                            {record.status?.replace("_", " ")}
                          </span>
                        </div>
                      </div>
                    ))}

                  {(!attendanceHistory?.attendances ||
                    attendanceHistory.attendances.length === 0) && (
                      <div className="text-center py-12 text-muted-foreground">
                        <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>No attendance records found</p>
                        <p className="text-sm mt-1">
                          Punch in to start tracking your attendance
                        </p>
                      </div>
                    )}
                </div>
              </CardContent>
            </Card>
        </TabsContent>

        {/* Tab 2: Attendance Report (Detailed Range Analysis) */}
        <TabsContent value="report" className="space-y-6">
          {/* Filters are now integrated into the Detailed Log Table below */}

          {/* Attendance Overview: Day-wise for Managers (Multi-employee) or Grid for Individual */}
          {myReport && (
            isAdminOrManager && selectedEmployeeId === "all" ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-primary" />
                    Day-wise Attendance Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 border-b">
                          <tr>
                            <th className="px-4 py-2.5 text-left font-bold">Date</th>
                            <th className="px-4 py-2.5 text-center font-bold bg-green-50 text-green-700">Present</th>
                            <th className="px-4 py-2.5 text-center font-bold bg-blue-50 text-blue-700">WFH</th>
                            <th className="px-4 py-2.5 text-center font-bold bg-purple-50 text-purple-700">Leave</th>
                            <th className="px-4 py-2.5 text-center font-bold bg-red-50 text-red-700">Absent</th>
                            <th className="px-4 py-2.5 text-center font-bold bg-gray-50 text-gray-700">Off/Sun</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {dayWiseStats?.map((day: any) => (
                            <tr key={day.date} className="hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-2.5 font-bold">
                                {format(new Date(day.date), "dd MMM yyyy (EEE)")}
                              </td>
                              <td className="px-4 py-2.5 text-center text-green-700 font-black text-sm">{day.present}</td>
                              <td className="px-4 py-2.5 text-center text-blue-700 font-black text-sm">{day.wfh}</td>
                              <td className="px-4 py-2.5 text-center text-purple-700 font-black text-sm">{day.leave}</td>
                              <td className="px-4 py-2.5 text-center text-red-700 font-black text-sm">{day.absent}</td>
                              <td className="px-4 py-2.5 text-center text-gray-500">
                                {day.weekend + day.holiday > 0 ? (
                                  <Badge variant="outline" className={`text-[10px] h-4.5 font-bold ${day.holiday > 0 ? 'bg-amber-100 border-amber-200 text-amber-800' : 'bg-blue-100 border-blue-200 text-blue-800'}`}>
                                    {day.holiday > 0 ? 'Holiday' : 'Sunday'}
                                  </Badge>
                                ) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                <div className="p-4 rounded-xl border bg-blue-50/30 flex flex-col items-center justify-center text-center">
                  <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-1">Present</p>
                  <p className="text-2xl font-bold text-blue-900">{myReport.statistics.presentDays}</p>
                </div>
                <div className="p-4 rounded-xl border bg-red-50/30 flex flex-col items-center justify-center text-center">
                  <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest mb-1">Absent</p>
                  <p className="text-2xl font-bold text-red-900">{myReport.statistics.absentDays}</p>
                </div>
                <div className="p-4 rounded-xl border bg-cyan-50/30 flex flex-col items-center justify-center text-center">
                  <p className="text-[10px] font-bold text-cyan-600 uppercase tracking-widest mb-1">Extra Days</p>
                  <p className="text-2xl font-bold text-cyan-900">{myReport.statistics.extraDays}</p>
                </div>
                <div className="p-4 rounded-xl border bg-purple-50/30 flex flex-col items-center justify-center text-center">
                  <p className="text-[10px] font-bold text-purple-600 uppercase tracking-widest mb-1">Late</p>
                  <p className="text-2xl font-bold text-purple-900">{myReport.statistics.lateDays}</p>
                </div>
                <div className="p-4 rounded-xl border bg-amber-50/30 flex flex-col items-center justify-center text-center">
                  <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">Leaves</p>
                  <p className="text-2xl font-bold text-amber-900">{myReport.statistics.leaveDays}</p>
                </div>
                <div className="p-4 rounded-xl border bg-emerald-50/30 flex flex-col items-center justify-center text-center">
                  <p className="text-2xl font-bold text-emerald-900">{formatWorkingHours(myReport.statistics.totalWorkingHours)}</p>
                </div>
                <div className="p-4 rounded-xl border bg-indigo-50/30 flex flex-col items-center justify-center text-center">
                  <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-1">Avg Hrs</p>
                  <p className="text-2xl font-bold text-indigo-900">{formatWorkingHours(myReport.statistics.avgWorkingHours)}</p>
                </div>
                <div className="p-4 rounded-xl border bg-gray-50 flex flex-col items-center justify-center text-center">
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1">Rate</p>
                  <p className="text-2xl font-bold text-gray-900">{myReport.statistics.attendanceRate.toFixed(0)}%</p>
                </div>
              </div>
            )
          )}

          {/* Detailed Log Table */}
          <Card>
            <CardHeader className="flex flex-col space-y-4 pb-6 border-b">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <CardTitle className="text-base font-bold uppercase tracking-wider text-muted-foreground/80">Detailed Attendance Log</CardTitle>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md border">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">Search Day:</span>
                    <div className="relative">
                      <Input
                        type="date"
                        className="h-7 w-32 text-[10px] pr-6 bg-background border-none focus-visible:ring-0"
                        value={localDateFilter}
                        onChange={(e) => setLocalDateFilter(e.target.value)}
                      />
                      {localDateFilter && (
                        <button
                          className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setLocalDateFilter("")}
                        >
                          <XCircle className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 h-9 px-4 text-xs font-semibold"
                    onClick={exportToCSV}
                    disabled={!myReport?.attendances || myReport.attendances.length === 0}
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                  </Button>
                </div>
              </div>

              {/* Enhanced Filter Row - Matches User Requirement */}
              <div className="flex flex-col md:flex-row md:items-end gap-5 pt-2">
                <div className="flex-1 space-y-2">
                  <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">Employee Filter</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    {isAdminOrManager && (
                      <select
                        className="flex h-10 w-full sm:w-[280px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-medium"
                        value={selectedEmployeeId}
                        onChange={(e) => setSelectedEmployeeId(e.target.value)}
                      >
                        <option value="all">All Employees</option>
                        {employeesData?.filter((emp: any) => emp.fullName !== "System Admin").map((emp: any) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.fullName}
                          </option>
                        ))}
                      </select>
                    )}
                    <div className="flex gap-1.5">
                      <Button
                        variant="outline"
                        className={`h-10 px-6 font-bold text-sm ${reportStartDate === format(new Date(), "yyyy-MM-dd") && reportEndDate === format(new Date(), "yyyy-MM-dd") ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'hover:bg-muted font-normal'}`}
                        onClick={() => {
                          setReportStartDate(format(new Date(), "yyyy-MM-dd"));
                          setReportEndDate(format(new Date(), "yyyy-MM-dd"));
                        }}
                      >
                        Today
                      </Button>
                      <Button
                        variant="outline"
                        className={`h-10 px-6 font-bold text-sm ${reportEndDate === format(new Date(), "yyyy-MM-dd") && reportStartDate === format(subDays(new Date(), 7), "yyyy-MM-dd") ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'hover:bg-muted font-normal'}`}
                        onClick={() => {
                          setReportStartDate(format(subDays(new Date(), 7), "yyyy-MM-dd"));
                          setReportEndDate(format(new Date(), "yyyy-MM-dd"));
                        }}
                      >
                        Last 7 Days
                      </Button>
                      <Button
                        variant="outline"
                        className={`h-10 px-6 font-bold text-sm ${reportEndDate === format(new Date(), "yyyy-MM-dd") && reportStartDate === format(startOfMonth(new Date()), "yyyy-MM-dd") ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'hover:bg-muted font-normal'}`}
                        onClick={() => {
                          setReportStartDate(format(startOfMonth(new Date()), "yyyy-MM-dd"));
                          setReportEndDate(format(new Date(), "yyyy-MM-dd"));
                        }}
                      >
                        This Month
                      </Button>
                      <Button
                        variant="outline"
                        className={`h-10 px-6 font-bold text-sm ${reportEndDate === format(new Date(new Date().getFullYear(), new Date().getMonth(), 0), "yyyy-MM-dd") && reportStartDate === format(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1), "yyyy-MM-dd") ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'hover:bg-muted font-normal'}`}
                        onClick={() => {
                          const today = new Date();
                          const firstDayLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                          const lastDayLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
                          setReportStartDate(format(firstDayLastMonth, "yyyy-MM-dd"));
                          setReportEndDate(format(lastDayLastMonth, "yyyy-MM-dd"));
                        }}
                      >
                        Last Month
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 items-end">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">From</Label>
                    <Input
                      type="date"
                      className="h-10 w-36 text-xs font-medium"
                      value={reportStartDate}
                      onChange={(e) => setReportStartDate(e.target.value)}
                      max={format(new Date(), "yyyy-MM-dd")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">To</Label>
                    <Input
                      type="date"
                      className="h-10 w-36 text-xs font-medium"
                      value={reportEndDate}
                      onChange={(e) => setReportEndDate(e.target.value)}
                      max={format(new Date(), "yyyy-MM-dd")}
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {reportLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : filteredAttendances.length > 0 ? (
                <div className="rounded-md border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">Employee / Date</th>
                          <th className="px-4 py-3 text-center font-medium">Punch In</th>
                          <th className="px-4 py-3 text-center font-medium">Punch Out</th>
                          <th className="px-4 py-3 text-center font-medium">Breaks</th>
                          <th className="px-4 py-3 text-center font-medium">Working Hrs</th>
                          <th className="px-4 py-3 text-left font-medium">Work Summary</th>
                          <th className="px-4 py-3 text-center font-medium">Status</th>
                          <th className="px-4 py-3 text-center font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredAttendances.map((record: any) => (
                          <tr key={record._id || record.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary border border-primary/20">
                                  {record.user?.fullName?.split(' ').map((n: any) => n[0]).join('') || '?'}
                                </div>
                                <div className="flex flex-col">
                                  <span className="font-bold text-sm">{record.user?.fullName || "—"}</span>
                                  <span className="text-[10px] text-muted-foreground font-medium">
                                    {format(new Date(record.date), "dd MMM yyyy")} ({format(new Date(record.date), "EEE")})
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center whitespace-nowrap">
                              {record.punchInTime ? (
                                <div className="flex flex-col items-center">
                                  <span>{format(new Date(record.punchInTime), "hh:mm a")}</span>
                                  {record.isLate && (
                                    <Badge variant="outline" className="text-[9px] h-4 bg-amber-50 border-amber-200 text-amber-700">
                                      Late {record.lateMinutes}m
                                    </Badge>
                                  )}
                                </div>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-3 text-center whitespace-nowrap">
                              {record.punchOutTime ? format(new Date(record.punchOutTime), "hh:mm a") : "—"}
                            </td>
                            <td className="px-4 py-3 text-center whitespace-nowrap">
                              {record.breaks?.length ? (
                                <div className="flex flex-col items-center gap-0.5 text-xs">
                                  {record.breaks.map((b: AttendanceBreak, idx: number) => (
                                    <span key={`${b.startTime}-${idx}`}>
                                      {format(new Date(b.startTime), "hh:mm a")} –{" "}
                                      {b.endTime ? format(new Date(b.endTime), "hh:mm a") : "Ongoing"}
                                      <span className="text-muted-foreground"> ({formatMinutes(getBreakMinutes(b, currentTime))})</span>
                                    </span>
                                  ))}
                                  <span className="font-semibold text-orange-700">
                                    Total {formatMinutes(record.breaks.reduce((sum: number, b: AttendanceBreak) => sum + getBreakMinutes(b, currentTime), 0))}
                                  </span>
                                </div>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-3 text-center font-semibold whitespace-nowrap">
                              {formatWorkingHours(record.workingHours)}
                            </td>
                            <td className="px-4 py-3 min-w-[200px]">
                              {record.workSummary ? (
                                <p className="text-xs text-muted-foreground line-clamp-2" title={record.workSummary}>
                                  {record.workSummary}
                                </p>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">No summary</span>
                              )}
                              {record.workImages && record.workImages.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setImagePreviewModal({
                                      isOpen: true,
                                      images: record.workImages,
                                      title: `Design Submissions — ${record.user?.fullName || "Employee"} (${format(new Date(record.date), "dd MMM yyyy")})`,
                                    })
                                  }
                                  className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-purple-100 hover:bg-purple-200 text-purple-800 dark:bg-purple-950/80 dark:hover:bg-purple-900 dark:text-purple-300 border border-purple-300/60 transition-colors"
                                >
                                  <ImageIcon className="w-3 h-3" />
                                  <span>{record.workImages.length} {record.workImages.length === 1 ? "Design" : "Designs"}</span>
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {isAdminOrManager ? (
                                <Select
                                  value={record.status}
                                  onValueChange={(newStatus) => {
                                    updateStatusMutation.mutate({
                                      id: record._id || record.id,
                                      status: newStatus,
                                      date: record.date,
                                      userId: record.userId?._id || record.userId || record.user?.id || record.user?._id || record.user
                                    });
                                  }}
                                  disabled={updateStatusMutation.isPending}
                                >
                                  <SelectTrigger className="h-8 w-[130px] text-[10px] font-medium border-none bg-transparent hover:bg-muted focus:ring-0 px-1">
                                    <SelectValue>
                                      <Badge
                                        variant={
                                          record.isExtraDay ? "default" :
                                          record.status === "PRESENT" ? "default" :
                                            record.status === "WORK_FROM_HOME" ? "secondary" :
                                              record.status === "ABSENT" ? "destructive" :
                                                record.status === "WEEKEND" ? "outline" :
                                                  record.status === "HOLIDAY" ? "outline" : "outline"
                                        }
                                        className={`text-[10px] h-5 cursor-pointer pointer-events-none ${
                                          record.isExtraDay ? "bg-cyan-600 hover:bg-cyan-700" :
                                          record.status?.startsWith("HALF_DAY") ? "bg-purple-100 text-purple-800 hover:bg-purple-200 border-none" :
                                          ["SICK", "CASUAL", "VACATION", "UNPAID", "LEAVE"].some(s => record.status?.includes(s)) ? "bg-amber-100 text-amber-800 hover:bg-amber-200 border-none" : ""
                                        }`}
                                      >
                                        {record.isExtraDay ? "EXTRA DAY" : record.status?.replace("_", " ")}
                                      </Badge>
                                    </SelectValue>
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="PRESENT">Present</SelectItem>
                                    <SelectItem value="ABSENT">Absent</SelectItem>
                                    <SelectItem value="WORK_FROM_HOME">Work From Home</SelectItem>
                                    <SelectItem value="WEEKEND">Weekend</SelectItem>
                                    <SelectItem value="HOLIDAY">Holiday</SelectItem>
                                    <SelectItem value="HALF_DAY">Half Day</SelectItem>
                                    <SelectItem value="LEAVE">Leave</SelectItem>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Badge
                                  variant={
                                    record.isExtraDay ? "default" :
                                    record.status === "PRESENT" ? "default" :
                                      record.status === "WORK_FROM_HOME" ? "secondary" :
                                        record.status === "ABSENT" ? "destructive" :
                                          record.status === "WEEKEND" ? "outline" :
                                            record.status === "HOLIDAY" ? "outline" : "outline"
                                  }
                                  className={`text-[10px] h-5 ${
                                    record.isExtraDay ? "bg-cyan-600 hover:bg-cyan-700 text-white" :
                                    record.status?.startsWith("HALF_DAY") ? "bg-purple-100 text-purple-800 hover:bg-purple-200 border-none" :
                                    ["SICK", "CASUAL", "VACATION", "UNPAID", "LEAVE"].some(s => record.status?.includes(s)) ? "bg-amber-100 text-amber-800 hover:bg-amber-200 border-none" : ""
                                  }`}
                                >
                                  {record.isExtraDay ? "EXTRA DAY" : record.status?.replace("_", " ")}
                                </Badge>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-primary"
                                onClick={() => openCorrectionDialog(record)}
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No records found for this period</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Overtime System */}
        <TabsContent value="overtime" className="space-y-6">
          {/* Overtime Top Summary Cards */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-indigo-200 bg-indigo-50/40">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-indigo-800">
                    Total Overtime Hours
                  </p>
                  <h3 className="text-2xl sm:text-3xl font-bold text-indigo-900 mt-1">
                    {overtimeData?.summary?.totalOvertimeHours || 0}{" "}
                    <span className="text-sm font-normal text-indigo-700">hrs</span>
                  </h3>
                  <p className="text-[11px] text-indigo-600 mt-0.5">
                    {overtimeData?.summary?.totalOvertimeMinutes || 0} minutes beyond standard shift
                  </p>
                </div>
                <div className="p-3 bg-indigo-100 text-indigo-700 rounded-xl">
                  <Clock className="w-6 h-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Overtime Records
                  </p>
                  <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
                    {overtimeData?.summary?.totalRecords || 0}
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Logged shift extensions
                  </p>
                </div>
                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                  <TrendingUp className="w-6 h-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-emerald-200 bg-emerald-50/40">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                    Est. Overtime Payout
                  </p>
                  <h3 className="text-2xl sm:text-3xl font-bold text-emerald-900 mt-1">
                    ₹{overtimeData?.summary?.employeeBreakdown?.reduce(
                      (acc: number, item: any) => acc + (item.estimatedOvertimePay || 0),
                      0
                    )?.toLocaleString("en-IN") || 0}
                  </h3>
                  <p className="text-[11px] text-emerald-700 mt-0.5">
                    Connected automatically into Payroll
                  </p>
                </div>
                <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl">
                  <CheckCircle className="w-6 h-6" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Staff with Overtime
                  </p>
                  <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
                    {overtimeData?.summary?.employeeBreakdown?.length || 0}
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Eligible for OT compensation
                  </p>
                </div>
                <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                  <BarChart3 className="w-6 h-6" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filter Bar */}
          <Card>
            <CardContent className="p-4 flex flex-wrap gap-4 items-center justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Month</Label>
                  <Select
                    value={overtimeMonth.toString()}
                    onValueChange={(val) => setOvertimeMonth(Number(val))}
                  >
                    <SelectTrigger className="w-32 h-9 text-xs">
                      <SelectValue placeholder="Month" />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        "January", "February", "March", "April", "May", "June",
                        "July", "August", "September", "October", "November", "December"
                      ].map((m, idx) => (
                        <SelectItem key={idx} value={(idx + 1).toString()}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Year</Label>
                  <Select
                    value={overtimeYear.toString()}
                    onValueChange={(val) => setOvertimeYear(Number(val))}
                  >
                    <SelectTrigger className="w-28 h-9 text-xs">
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {[2025, 2026, 2027].map((yr) => (
                        <SelectItem key={yr} value={yr.toString()}>
                          {yr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isAdminOrManager && (
                  <div className="space-y-1">
                    <Label className="text-xs">Employee Filter</Label>
                    <Select
                      value={overtimeEmployeeFilter}
                      onValueChange={setOvertimeEmployeeFilter}
                    >
                      <SelectTrigger className="w-52 h-9 text-xs">
                        <SelectValue placeholder="All Employees" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Employees</SelectItem>
                        {employeesData?.map((emp: any) => {
                          const eId = emp._id || emp.id;
                          return (
                            <SelectItem key={eId} value={eId}>
                              {emp.fullName} ({emp.employeeType || emp.role})
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="text-xs text-muted-foreground flex items-center gap-1.5 bg-slate-50 p-2 rounded-lg border">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <span>
                  Overtime is automatically credited to the monthly payslip in the{" "}
                  <Link href="/payroll" className="text-indigo-600 font-semibold hover:underline">
                    Payroll Module
                  </Link>
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Employee Breakdown Cards (For Managers/Admins) */}
          {isAdminOrManager && overtimeData?.summary?.employeeBreakdown?.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-slate-800">Employee Overtime Breakdown</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {overtimeData.summary.employeeBreakdown.map((item: any, idx: number) => (
                  <Card key={idx} className="border-slate-200">
                    <CardContent className="p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-slate-900 truncate">
                          {item.fullName}
                        </span>
                        {item.employeeType && (
                          <Badge variant="outline" className="text-[10px]">
                            {item.employeeType}
                          </Badge>
                        )}
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">OT Hours:</span>
                        <span className="font-bold text-indigo-600">+{item.totalOvertimeHours} hrs</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground">Est. Pay:</span>
                        <span className="font-bold text-emerald-600">₹{item.estimatedOvertimePay?.toLocaleString("en-IN") || 0}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Overtime Records Detailed Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Overtime Records Log</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isOvertimeLoading ? (
                <div className="flex justify-center items-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                </div>
              ) : !overtimeData?.records || overtimeData.records.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-3 opacity-40 text-indigo-400" />
                  <p className="font-semibold text-slate-700">No overtime records logged for this period</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Hours worked beyond standard shifts will automatically appear here.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider border-b">
                      <tr>
                        <th className="py-3 px-4">Date</th>
                        {isAdminOrManager && <th className="py-3 px-4">Employee</th>}
                        <th className="py-3 px-4">Punch In - Out</th>
                        <th className="py-3 px-4 text-center">Total Working Hours</th>
                        <th className="py-3 px-4 text-center">Overtime Hours</th>
                        <th className="py-3 px-4 text-right">OT Rate</th>
                        <th className="py-3 px-4 text-right">Calculated Pay</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {overtimeData.records.map((rec: any) => (
                        <tr key={rec.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 font-mono text-xs whitespace-nowrap">
                            {format(new Date(rec.date), "dd MMM yyyy")}
                          </td>

                          {isAdminOrManager && (
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center font-bold text-xs">
                                  {rec.user?.fullName?.charAt(0) || "U"}
                                </div>
                                <div>
                                  <span className="font-semibold text-slate-900 block text-xs">
                                    {rec.user?.fullName}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-muted-foreground">
                                      {rec.user?.employeeId}
                                    </span>
                                    {rec.user?.employeeType && (
                                      <Badge variant="outline" className="text-[9px] px-1 py-0">
                                        {rec.user.employeeType}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          )}

                          <td className="py-3 px-4 text-xs font-mono text-slate-600">
                            {rec.punchInTime ? format(new Date(rec.punchInTime), "hh:mm a") : "—"}
                            {" → "}
                            {rec.punchOutTime ? format(new Date(rec.punchOutTime), "hh:mm a") : "—"}
                          </td>

                          <td className="py-3 px-4 text-center text-xs font-semibold text-slate-800">
                            {rec.workingHours?.toFixed(1) || 0} hrs
                          </td>

                          <td className="py-3 px-4 text-center">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                              +{rec.overtimeHours} hrs
                            </span>
                          </td>

                          <td className="py-3 px-4 text-right text-xs font-mono text-slate-600">
                            ₹{rec.overtimeRate || 0}/hr
                          </td>

                          <td className="py-3 px-4 text-right text-xs font-bold text-emerald-700">
                            ₹{rec.overtimePay?.toLocaleString("en-IN") || 0}
                          </td>

                          <td className="py-3 px-4 text-center">
                            <Badge variant="outline" className="text-[10px] text-slate-600 bg-slate-50">
                              {rec.status || "PRESENT"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Correction Dialog */}
      <Dialog open={showCorrectionDialog} onOpenChange={setShowCorrectionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedRecord ? "Attendance Correction" : "Report Missing Attendance"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={correctionData.date}
                onChange={(e) => setCorrectionData({ ...correctionData, date: e.target.value })}
                disabled={!!selectedRecord}
                max={format(new Date(), "yyyy-MM-dd")}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Required Punch In</Label>
                <Input
                  type="time"
                  value={correctionData.requestedPunchIn}
                  onChange={(e) => setCorrectionData({ ...correctionData, requestedPunchIn: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Required Punch Out</Label>
                <Input
                  type="time"
                  value={correctionData.requestedPunchOut}
                  onChange={(e) => setCorrectionData({ ...correctionData, requestedPunchOut: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reason for Request</Label>
              <Textarea
                placeholder="e.g. Forgot to punch in, Bio-metric failure, Outside meeting..."
                value={correctionData.reason}
                onChange={(e) => setCorrectionData({ ...correctionData, reason: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCorrectionDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCorrectionSubmit}
              disabled={correctionMutation.isPending || !correctionData.reason || !correctionData.date}
            >
              {correctionMutation.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Location Permission Dialog */}
      <Dialog open={showLocationPrompt && !isPunchedOut && !onOfficeWifi} onOpenChange={setShowLocationPrompt}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2 pr-6">
              <MapPin className="w-5 h-5 text-primary shrink-0" />
              Allow Location Access
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Your location is needed to punch in and punch out. You must be within your
              office radius (100 m) or connected to the office Wi-Fi to mark attendance.
            </p>
            {locationPermission === "denied" ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 space-y-1.5">
                <p className="font-semibold">Location is blocked for this site</p>
                <ol className="list-decimal pl-5 space-y-1 text-xs">
                  <li>Tap the lock / settings icon next to the website address.</li>
                  <li>Open <strong>Permissions</strong> → <strong>Location</strong>.</li>
                  <li>Choose <strong>Allow</strong>, then tap <strong>Try Again</strong> below.</li>
                </ol>
                <p className="text-xs">Also make sure your phone&apos;s Location (GPS) is turned on.</p>
              </div>
            ) : (
              <p className="text-muted-foreground">
                Tap <strong>Allow Location</strong>, then choose <strong>Allow</strong> in your
                browser&apos;s popup.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLocationPrompt(false)}>
              Not Now
            </Button>
            <Button onClick={requestLocation} disabled={isDetectingLocation} className="gap-2">
              {isDetectingLocation ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MapPin className="w-4 h-4" />
              )}
              {locationPermission === "denied" ? "Try Again" : "Allow Location"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Punch Out Summary Dialog */}
      <Dialog
        open={showPunchOutDialog}
        onOpenChange={setShowPunchOutDialog}
      >
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader className="text-left">
            <DialogTitle className="pr-6 leading-tight">Punch Out — Activity & Productivity</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <WorkActivitySelector
              entries={activityEntries}
              onChange={setActivityEntries}
              enabled={showPunchOutDialog}
            />
            {activityEntries.length === 0 && (
              <p className="text-xs text-amber-700">
                Select at least one job card (or General Operations), or use Skip &amp; Punch Out.
              </p>
            )}

            <div className="space-y-2 border-t pt-3">
              <Label>What did you do today? *</Label>
              <Textarea
                placeholder="Briefly describe your tasks and accomplishments today..."
                value={workSummary}
                onChange={(e) => setWorkSummary(e.target.value)}
                rows={4}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                This summary will be visible to your manager in the attendance log.
              </p>
            </div>

          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPunchOutDialog(false)}
              disabled={punchOutMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => punchOutMutation.mutate({ summary: workSummary, activities: [] })}
              disabled={punchOutMutation.isPending}
            >
              Skip & Punch Out
            </Button>
            <Button
              onClick={() => {
                if (countHelpSupport(activityEntries) > MAX_HELP_SUPPORT) {
                  toast.error(`"${HELP_SUPPORT}" can be selected for only ${MAX_HELP_SUPPORT} job cards`);
                  return;
                }
                punchOutMutation.mutate({
                  summary: workSummary,
                  activities: activityEntries,
                });
              }}
              disabled={
                punchOutMutation.isPending ||
                activityEntries.length === 0 ||
                !workSummary.trim()
              }
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {punchOutMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Punching Out...
                </>
              ) : (
                "Complete Punch Out"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox / Preview Dialog for uploaded design images */}
      <Dialog
        open={imagePreviewModal.isOpen}
        onOpenChange={(open) => setImagePreviewModal((prev) => ({ ...prev, isOpen: open }))}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-purple-600" />
              <span>{imagePreviewModal.title || "Design Submissions"}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-3">
            {imagePreviewModal.images.map((imgUrl, i) => {
              const fullUrl = imgUrl.startsWith("http") || imgUrl.startsWith("data:")
                ? imgUrl
                : `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}${imgUrl}`;
              return (
                <div key={i} className="border rounded-lg overflow-hidden bg-muted/20 group relative flex flex-col shadow-sm">
                  <div className="relative aspect-video w-full overflow-hidden bg-black/5 flex items-center justify-center">
                    <img
                      src={fullUrl}
                      alt={`Design ${i + 1}`}
                      className="w-full h-full object-contain hover:scale-105 transition-transform duration-200"
                    />
                  </div>
                  <div className="p-2.5 bg-background flex items-center justify-between text-xs border-t">
                    <span className="font-medium text-foreground">Design #{i + 1}</span>
                    <a
                      href={fullUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-purple-600 hover:underline flex items-center gap-1 text-[11px]"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View Full
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
