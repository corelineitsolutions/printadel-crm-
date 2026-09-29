"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Home,
    Plus,
    User,
    Calendar,
    XCircle,
    Clock,
    ChevronLeft,
    Loader2,
    AlertCircle,
    Search
} from "lucide-react";
import { attendanceAPI, employeeAPI } from "@/lib/api";
import { format } from "date-fns";
import { toast } from "sonner";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import Link from "next/link";

export default function WFHManagementPage() {
    const queryClient = useQueryClient();
    const [showAssignDialog, setShowAssignDialog] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    const [formData, setFormData] = useState({
        userId: "",
        startDate: format(new Date(), "yyyy-MM-dd"),
        endDate: format(new Date(), "yyyy-MM-dd"),
        reason: "",
    });

    // Fetch WFH assignments
    const { data: assignments, isLoading: loadingAssignments } = useQuery({
        queryKey: ["attendance", "wfh"],
        queryFn: async () => {
            const res = await attendanceAPI.getWFHAssignments();
            return res.data.data;
        },
    });

    // Fetch employees for dropdown
    const { data: employees } = useQuery({
        queryKey: ["employees", "minimal"],
        queryFn: async () => {
            const res = await employeeAPI.getAllEmployees({ limit: 100 });
            return res.data.data.employees;
        },
    });

    // Assign WFH mutation
    const assignWFHMutation = useMutation({
        mutationFn: (data: any) => attendanceAPI.assignWFH(data),
        onSuccess: () => {
            toast.success("WFH assigned successfully");
            setShowAssignDialog(false);
            setFormData({
                userId: "",
                startDate: format(new Date(), "yyyy-MM-dd"),
                endDate: format(new Date(), "yyyy-MM-dd"),
                reason: "",
            });
            queryClient.invalidateQueries({ queryKey: ["attendance", "wfh"] });
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || "Failed to assign WFH");
        },
    });

    // Deactivate WFH mutation
    const deactivateWFHMutation = useMutation({
        mutationFn: (id: string) => attendanceAPI.deactivateWFH(id),
        onSuccess: () => {
            toast.success("WFH authorization cancelled");
            queryClient.invalidateQueries({ queryKey: ["attendance", "wfh"] });
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || "Failed to cancel WFH");
        },
    });

    const filteredAssignments = assignments?.filter((a: any) =>
        a.userId?.fullName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loadingAssignments) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Link href="/attendance">
                        <Button variant="ghost" size="icon">
                            <ChevronLeft className="w-5 h-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold flex items-center gap-2">
                            <Home className="w-8 h-8 text-blue-600" />
                            WFH Management
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            Authorize Work From Home periods for employees
                        </p>
                    </div>
                </div>
                <Button onClick={() => setShowAssignDialog(true)} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Authorize WFH
                </Button>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                    placeholder="Search employees..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            <div className="grid gap-4">
                {filteredAssignments?.length === 0 ? (
                    <Card className="p-12 text-center text-muted-foreground border-dashed">
                        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                            <Home className="w-8 h-8 opacity-20" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">No Active WFH Assignments</h3>
                        <p>Authorization will allow employees to punch in from any location.</p>
                    </Card>
                ) : (
                    filteredAssignments?.map((assignment: any) => (
                        <Card key={assignment._id} className="overflow-hidden">
                            <CardContent className="p-6">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                    <div className="flex items-start gap-4">
                                        <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100">
                                            <User className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-bold text-lg">{assignment.userId?.fullName}</h3>
                                                <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100">Active</Badge>
                                            </div>
                                            <div className="flex flex-wrap gap-4 mt-1 text-sm text-muted-foreground">
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="w-4 h-4" />
                                                    {format(new Date(assignment.startDate), "MMM d")} - {format(new Date(assignment.endDate), "MMM d, yyyy")}
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-4 h-4" />
                                                    Assigned by {assignment.assignedBy?.fullName}
                                                </span>
                                            </div>
                                            {assignment.reason && (
                                                <p className="text-sm mt-3 pt-3 border-t text-muted-foreground italic">
                                                    "{assignment.reason}"
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        variant="outline"
                                        className="text-red-600 border-red-200 hover:bg-red-50"
                                        onClick={() => deactivateWFHMutation.mutate(assignment._id)}
                                        disabled={deactivateWFHMutation.isPending}
                                    >
                                        <XCircle className="w-4 h-4 mr-2" />
                                        Cancel Auth
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>

            {/* Assign WFH Dialog */}
            <Dialog open={showAssignDialog} onOpenChange={setShowAssignDialog}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Authorize Work From Home</DialogTitle>
                        <CardDescription>
                            Authorized employees can punch in from any location during the specified period.
                        </CardDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Select Employee</Label>
                            <Select onValueChange={(val) => setFormData({ ...formData, userId: val })}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Choose employee..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {employees?.filter((emp: any) => emp._id || emp.id).map((emp: any) => (
                                        <SelectItem key={emp._id || emp.id} value={emp._id || emp.id}>
                                            {emp.fullName} ({emp.employeeId})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Start Date</Label>
                                <Input
                                    type="date"
                                    value={formData.startDate}
                                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>End Date</Label>
                                <Input
                                    type="date"
                                    value={formData.endDate}
                                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Reason / Note (Optional)</Label>
                            <Textarea
                                placeholder="e.g. Health issues, Family emergency, Remote work week..."
                                value={formData.reason}
                                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAssignDialog(false)}>
                            Cancel
                        </Button>
                        <Button
                            className="bg-blue-600 hover:bg-blue-700"
                            onClick={() => assignWFHMutation.mutate(formData)}
                            disabled={assignWFHMutation.isPending || !formData.userId}
                        >
                            {assignWFHMutation.isPending ? "Assigning..." : "Assign WFH"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
