"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    CheckCircle2,
    XCircle,
    Clock,
    User,
    Calendar,
    MessageSquare,
    AlertCircle,
    Loader2,
    ChevronLeft
} from "lucide-react";
import { attendanceAPI } from "@/lib/api";
import { format } from "date-fns";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import Link from "next/link";

export default function AttendanceCorrectionsPage() {
    const queryClient = useQueryClient();
    const [selectedRequest, setSelectedRequest] = useState<any>(null);
    const [adminNotes, setAdminNotes] = useState("");
    const [showApprovalDialog, setShowApprovalDialog] = useState(false);
    const [actionType, setActionType] = useState<"APPROVED" | "REJECTED">("APPROVED");

    // Fetch correction requests
    const { data: requests, isLoading } = useQuery({
        queryKey: ["attendance", "corrections"],
        queryFn: async () => {
            const res = await attendanceAPI.getCorrections({ status: "PENDING" });
            return res.data.data;
        },
    });

    // Handle action mutation
    const actionMutation = useMutation({
        mutationFn: ({ id, status, adminNotes }: { id: string, status: string, adminNotes?: string }) =>
            attendanceAPI.approveCorrection(id, { status, adminNotes }),
        onSuccess: () => {
            toast.success(`Request ${actionType.toLowerCase()} successfully`);
            setShowApprovalDialog(false);
            setSelectedRequest(null);
            setAdminNotes("");
            queryClient.invalidateQueries({ queryKey: ["attendance", "corrections"] });
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || "Failed to process request");
        },
    });

    const openActionDialog = (request: any, type: "APPROVED" | "REJECTED") => {
        setSelectedRequest(request);
        setActionType(type);
        setShowApprovalDialog(true);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/attendance">
                    <Button variant="ghost" size="icon">
                        <ChevronLeft className="w-5 h-5" />
                    </Button>
                </Link>
                <div>
                    <h1 className="text-3xl font-bold">Correction Requests</h1>
                    <p className="text-muted-foreground mt-1">
                        Review and approve attendance adjustment requests from employees
                    </p>
                </div>
            </div>

            <div className="grid gap-4">
                {requests?.length === 0 ? (
                    <Card className="p-12 text-center text-muted-foreground">
                        <CheckCircle2 className="w-12 h-12 mx-auto mb-4 opacity-20 text-green-500" />
                        <h3 className="text-xl font-semibold text-foreground">All caught up!</h3>
                        <p className="mt-1">No pending attendance correction requests found.</p>
                    </Card>
                ) : (
                    requests?.map((request: any) => (
                        <Card key={request._id} className="overflow-hidden border-l-4 border-l-blue-500">
                            <CardContent className="p-0">
                                <div className="p-6">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                        <div className="flex items-start gap-4">
                                            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700">
                                                <User className="w-6 h-6" />
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-bold text-lg">{request.userId?.fullName}</h3>
                                                    <Badge variant="outline">{request.userId?.designation}</Badge>
                                                </div>
                                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="w-4 h-4" />
                                                        {format(new Date(request.date), "EEE, MMM d, yyyy")}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="w-4 h-4" />
                                                        {request.requestedPunchIn ? format(new Date(request.requestedPunchIn), "hh:mm a") : "N/A"} -
                                                        {request.requestedPunchOut ? format(new Date(request.requestedPunchOut), "hh:mm a") : "N/A"}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                className="text-red-600 border-red-200 hover:bg-red-50"
                                                onClick={() => openActionDialog(request, "REJECTED")}
                                            >
                                                <XCircle className="w-4 h-4 mr-2" />
                                                Reject
                                            </Button>
                                            <Button
                                                className="bg-green-600 hover:bg-green-700"
                                                onClick={() => openActionDialog(request, "APPROVED")}
                                            >
                                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                                Approve
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="mt-6 grid md:grid-cols-2 gap-6 bg-muted/30 p-4 rounded-lg">
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 text-sm font-semibold">
                                                <MessageSquare className="w-4 h-4" />
                                                Employee Reason
                                            </div>
                                            <p className="text-sm italic text-muted-foreground bg-white p-3 rounded border">
                                                "{request.reason}"
                                            </p>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 text-sm font-semibold">
                                                <AlertCircle className="w-4 h-4" />
                                                Current Record
                                            </div>
                                            <div className="text-sm p-3 rounded border bg-white">
                                                {request.attendanceId ? (
                                                    <span>Has existing attendance record for this day.</span>
                                                ) : (
                                                    <span className="text-orange-600">Missing attendance record for this day.</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {/* Action Dialog */}
            <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {actionType === "APPROVED" ? "Approve Correction" : "Reject Request"}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="p-4 rounded-lg bg-muted/50 border space-y-2">
                            <p className="text-sm">
                                <strong>Employee:</strong> {selectedRequest?.userId?.fullName}
                            </p>
                            <p className="text-sm">
                                <strong>Corrected Time:</strong> {selectedRequest?.requestedPunchIn ? format(new Date(selectedRequest.requestedPunchIn), "hh:mm a") : "N/A"} - {selectedRequest?.requestedPunchOut ? format(new Date(selectedRequest.requestedPunchOut), "hh:mm a") : "N/A"}
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label>Admin Notes (Optional)</Label>
                            <Textarea
                                placeholder="Add a reason for approval/rejection..."
                                value={adminNotes}
                                onChange={(e) => setAdminNotes(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowApprovalDialog(false)}>
                            Cancel
                        </Button>
                        <Button
                            className={actionType === "APPROVED" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
                            onClick={() => actionMutation.mutate({
                                id: selectedRequest._id,
                                status: actionType,
                                adminNotes
                            })}
                            disabled={actionMutation.isPending}
                        >
                            {actionMutation.isPending ? "Processing..." : `Confirm ${actionType === "APPROVED" ? "Approval" : "Rejection"}`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
