"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Calendar as CalendarIcon,
  Plus,
  Check,
  X,
  Clock,
  Loader2,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { leaveAPI } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

const leaveSchema = z.object({
  leaveType: z.enum(["SICK", "CASUAL", "VACATION", "WORK_FROM_HOME", "UNPAID"]),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  isHalfDay: z.boolean().default(false),
  reason: z.string().min(10, "Reason must be at least 10 characters"),
});

type LeaveFormData = z.infer<typeof leaveSchema>;

export default function LeavePage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [selectedTab, setSelectedTab] = useState(user?.role === "ADMIN" ? "approvals" : "apply");

  const canApproveLeaves = user?.role === "ADMIN" || user?.role === "MANAGER";
  const canApplyLeave = user?.role === "EMPLOYEE" || user?.role === "MANAGER";
  const showMyHistory = user?.role !== "ADMIN";

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<LeaveFormData>({
    resolver: zodResolver(leaveSchema),
    defaultValues: {
      leaveType: "CASUAL",
      isHalfDay: false,
    },
  });

  // Fetch leave balance
  const { data: balanceData } = useQuery({
    queryKey: ["leaveBalance"],
    queryFn: async () => {
      const response = await leaveAPI.getMyLeaveBalance();
      return response.data;
    },
  });

  // Fetch my leaves
  const { data: myLeavesData, isLoading } = useQuery({
    queryKey: ["myLeaves", user?.id],
    queryFn: async () => {
      const response = await leaveAPI.getMyLeaves({
        limit: 50,
        userId: user?.id
      });
      return response.data;
    },
    enabled: !!user?.id,
  });

  // Fetch pending approvals (for managers)
  const { data: pendingLeavesData } = useQuery({
    queryKey: ["pendingLeaves"],
    queryFn: async () => {
      if (!canApproveLeaves) return null;
      const response = await leaveAPI.getAllLeaves({ status: "PENDING", limit: 50 });
      return response.data;
    },
    enabled: canApproveLeaves,
  });

  // Fetch approved leaves (for managers)
  const { data: approvedLeavesData, isLoading: loadingApproved } = useQuery({
    queryKey: ["approvedLeaves"],
    queryFn: async () => {
      if (!canApproveLeaves) return null;
      const response = await leaveAPI.getAllLeaves({ status: "APPROVED", limit: 50 });
      return response.data;
    },
    enabled: canApproveLeaves,
  });

  // Apply leave mutation
  const applyLeaveMutation = useMutation({
    mutationFn: (data: LeaveFormData) => leaveAPI.applyLeave(data),
    onSuccess: () => {
      toast.success("Leave application submitted successfully!");
      queryClient.invalidateQueries({ queryKey: ["myLeaves"] });
      queryClient.invalidateQueries({ queryKey: ["leaveBalance"] });
      setShowApplyDialog(false);
      reset();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to apply for leave");
    },
  });

  // Approve/Reject leave mutation
  const updateLeaveStatusMutation = useMutation({
    mutationFn: ({
      leaveId,
      status,
      rejectionReason,
    }: {
      leaveId: string;
      status: string;
      rejectionReason?: string;
    }) => leaveAPI.updateLeaveStatus(leaveId, { status, rejectionReason }),
    onSuccess: (_, variables) => {
      toast.success(`Leave ${variables.status.toLowerCase()} successfully!`);
      queryClient.invalidateQueries({ queryKey: ["pendingLeaves"] });
      queryClient.invalidateQueries({ queryKey: ["myLeaves"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to update leave status");
    },
  });

  // Cancel leave mutation
  const cancelLeaveMutation = useMutation({
    mutationFn: (leaveId: string) => leaveAPI.cancelLeave(leaveId),
    onSuccess: () => {
      toast.success("Leave cancelled successfully!");
      queryClient.invalidateQueries({ queryKey: ["myLeaves"] });
      queryClient.invalidateQueries({ queryKey: ["leaveBalance"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to cancel leave");
    },
  });

  const onSubmit = (data: LeaveFormData) => {
    applyLeaveMutation.mutate({ ...data, isHalfDay });
  };

  const balance = balanceData?.data;
  const myLeaves = myLeavesData?.data?.leaves || [];
  const pendingLeaves = pendingLeavesData?.data?.leaves || [];
  const approvedLeaves = approvedLeavesData?.data?.leaves || [];

  const getStatusBadge = (status: string) => {
    const statusStyles: any = {
      PENDING: "bg-yellow-100 text-yellow-800",
      APPROVED: "bg-green-100 text-green-800",
      REJECTED: "bg-red-100 text-red-800",
      CANCELLED: "bg-gray-100 text-gray-800",
    };

    return (
      <Badge className={statusStyles[status] || ""}>{status}</Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <CalendarIcon className="w-7 h-7 sm:w-8 sm:h-8" />
            Leave Management
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Apply for leave and manage your requests
          </p>
        </div>
        {canApplyLeave && (
          <Button className="gap-2 self-start sm:self-auto" onClick={() => setShowApplyDialog(true)}>
            <Plus className="w-4 h-4" />
            Apply for Leave
          </Button>
        )}
      </div>

      {/* Leave Balance Cards (Hidden for Admin) */}
      {showMyHistory && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Sick Leave</span>
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-2xl font-bold">
                {balance?.sickLeaveAvailable || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                of {balance?.sickLeaveBalance || 12} available
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Casual Leave</span>
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-2xl font-bold">
                {balance?.casualLeaveAvailable || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                of {balance?.casualLeaveBalance || 12} available
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Vacation Leave</span>
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <div className="text-2xl font-bold">
                {balance?.vacationLeaveAvailable || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                of {balance?.vacationLeaveBalance || 15} available
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Unpaid Leave</span>
                <TrendingUp className="w-5 h-5 text-red-600" />
              </div>
              <div className="text-2xl font-bold">
                {balance?.unpaidLeaveUsed || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Days used this year
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs for My Leaves and Pending Approvals */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          {showMyHistory && <TabsTrigger value="apply">My Leaves</TabsTrigger>}
          {canApproveLeaves && (
            <TabsTrigger value="approvals">
              Pending Approvals
              {pendingLeaves.length > 0 && (
                <Badge className="ml-2 bg-yellow-500">{pendingLeaves.length}</Badge>
              )}
            </TabsTrigger>
          )}
          {canApproveLeaves && (
            <TabsTrigger value="approved-all">
              Approved Leaves
            </TabsTrigger>
          )}
        </TabsList>

        {/* My Leaves Tab */}
        {showMyHistory && (
          <TabsContent value="apply" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>My Leave History</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : myLeaves.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CalendarIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No leave requests yet</p>
                    <p className="text-sm mt-1">Click "Apply for Leave" to get started</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {myLeaves.map((leave: any) => (
                      <div
                        key={leave.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border gap-3"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <Badge variant="outline">{leave.leaveType.replace("_", " ")}</Badge>
                            {getStatusBadge(leave.status)}
                            {leave.isHalfDay && (
                              <Badge variant="secondary">Half Day</Badge>
                            )}
                          </div>
                          <p className="font-semibold">
                            {format(new Date(leave.startDate), "MMM d")} -{" "}
                            {format(new Date(leave.endDate), "MMM d, yyyy")}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {leave.reason}
                          </p>
                          {leave.rejectionReason && (
                            <div className="mt-2 flex items-center gap-2 text-sm text-red-600">
                              <AlertCircle className="w-4 h-4" />
                              <span>Rejection reason: {leave.rejectionReason}</span>
                            </div>
                          )}
                        </div>
                        {leave.status === "PENDING" && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => cancelLeaveMutation.mutate(leave.id)}
                            disabled={cancelLeaveMutation.isPending}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Pending Approvals Tab (for Managers/Admins) */}
        {canApproveLeaves && (
          <TabsContent value="approvals" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Pending Leave Approvals</CardTitle>
              </CardHeader>
              <CardContent>
                {pendingLeaves.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Check className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No pending approvals</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingLeaves.map((leave: any) => (
                      <div
                        key={leave.id}
                        className="flex items-center justify-between p-4 rounded-lg border"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-semibold">{leave.user.fullName}</span>
                            <Badge variant="outline">{leave.leaveType.replace("_", " ")}</Badge>
                            {leave.isHalfDay && (
                              <Badge variant="secondary">Half Day</Badge>
                            )}
                          </div>
                          <p className="text-sm">
                            {format(new Date(leave.startDate), "MMM d")} -{" "}
                            {format(new Date(leave.endDate), "MMM d, yyyy")}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {leave.reason}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2 text-green-600 border-green-600"
                            onClick={() =>
                              updateLeaveStatusMutation.mutate({
                                leaveId: leave.id,
                                status: "APPROVED",
                              })
                            }
                            disabled={updateLeaveStatusMutation.isPending}
                          >
                            <Check className="w-4 h-4" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2 text-red-600 border-red-600"
                            onClick={() => {
                              const reason = prompt("Rejection reason (optional):");
                              updateLeaveStatusMutation.mutate({
                                leaveId: leave.id,
                                status: "REJECTED",
                                rejectionReason: reason || undefined,
                              });
                            }}
                            disabled={updateLeaveStatusMutation.isPending}
                          >
                            <X className="w-4 h-4" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Approved Leaves Tab (for Managers/Admins) */}
        {canApproveLeaves && (
          <TabsContent value="approved-all" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>All Approved Leaves</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingApproved ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin" />
                  </div>
                ) : approvedLeaves.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Check className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>No approved leaves found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {approvedLeaves.map((leave: any) => (
                      <div
                        key={leave.id}
                        className="flex items-center justify-between p-4 rounded-lg border"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-semibold">{leave.user?.fullName}</span>
                            <Badge variant="outline">{leave.leaveType.replace("_", " ")}</Badge>
                            {leave.isHalfDay && (
                              <Badge variant="secondary">Half Day</Badge>
                            )}
                          </div>
                          <p className="text-sm">
                            {format(new Date(leave.startDate), "MMM d")} -{" "}
                            {format(new Date(leave.endDate), "MMM d, yyyy")}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {leave.reason}
                          </p>
                        </div>
                        <Badge className="bg-green-100 text-green-800">APPROVED</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Apply Leave Dialog */}
      <Dialog open={showApplyDialog} onOpenChange={setShowApplyDialog}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Apply for Leave</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="leaveType">Leave Type</Label>
              <Select
                value={watch("leaveType")}
                onValueChange={(value: any) => setValue("leaveType", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SICK">Sick Leave</SelectItem>
                  <SelectItem value="CASUAL">Casual Leave</SelectItem>
                  <SelectItem value="VACATION">Vacation Leave</SelectItem>
                  <SelectItem value="WORK_FROM_HOME">Work From Home</SelectItem>
                  <SelectItem value="UNPAID">Unpaid Leave</SelectItem>
                </SelectContent>
              </Select>
              {errors.leaveType && (
                <p className="text-sm text-red-500">{errors.leaveType.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  {...register("startDate")}
                  min={format(new Date(), "yyyy-MM-dd")}
                />
                {errors.startDate && (
                  <p className="text-sm text-red-500">{errors.startDate.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  {...register("endDate")}
                  min={watch("startDate") || format(new Date(), "yyyy-MM-dd")}
                />
                {errors.endDate && (
                  <p className="text-sm text-red-500">{errors.endDate.message}</p>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="isHalfDay"
                checked={isHalfDay}
                onCheckedChange={(checked) => setIsHalfDay(!!checked)}
              />
              <Label htmlFor="isHalfDay" className="cursor-pointer">
                Half Day Leave
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea
                id="reason"
                {...register("reason")}
                placeholder="Please provide a reason for your leave..."
                rows={4}
              />
              {errors.reason && (
                <p className="text-sm text-red-500">{errors.reason.message}</p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowApplyDialog(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={applyLeaveMutation.isPending}>
                {applyLeaveMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Application"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div >
  );
}
