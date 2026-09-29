"use client";

import { useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useMutation } from "@tanstack/react-query";
import { authAPI } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, User, Key, Mail, Shield, Briefcase, Calendar, Phone, MapPin, Eye, EyeOff } from "lucide-react";
import { format } from "date-fns";

const changePasswordSchema = z.object({
    oldPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(6, "New password must be at least 6 characters"),
    confirmPassword: z.string().min(6, "Please confirm your new password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
});

type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

export default function ProfilePage() {
    const { user } = useAuthStore();
    const [showOldPassword, setShowOldPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const {
        register,
        handleSubmit,
        reset,
        formState: { errors },
    } = useForm<ChangePasswordFormValues>({
        resolver: zodResolver(changePasswordSchema),
    });

    const changePasswordMutation = useMutation({
        mutationFn: (data: ChangePasswordFormValues) => authAPI.changePassword({
            oldPassword: data.oldPassword,
            newPassword: data.newPassword,
        }),
        onSuccess: () => {
            toast.success("Password changed successfully");
            reset();
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.message || "Failed to change password");
        },
    });

    const onSubmit = (data: ChangePasswordFormValues) => {
        changePasswordMutation.mutate(data);
    };

    if (!user) return null;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">My Profile</h1>
                <p className="text-muted-foreground">Manage your account settings and security</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* User Information */}
                <Card className="shadow-lg border-primary/10">
                    <CardHeader className="bg-primary/5">
                        <CardTitle className="flex items-center gap-2">
                            <User className="w-5 h-5 text-primary" />
                            Personal Information
                        </CardTitle>
                        <CardDescription>Your basic profile details</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4">
                        <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/30">
                            <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-2xl font-bold">
                                {user.fullName.charAt(0)}
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-xl font-bold">{user.fullName}</h3>
                                <Badge variant="secondary" className="font-semibold px-3 py-0.5">
                                    {user.role}
                                </Badge>
                            </div>
                        </div>

                        <div className="grid gap-4 pt-2">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-2 sm:p-0">
                                <div className="p-2 w-fit rounded-lg bg-primary/10">
                                    <Mail className="w-4 h-4 text-primary" />
                                </div>
                                <div className="break-all">
                                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Email Address</p>
                                    <p className="font-medium text-sm">{user.email}</p>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-2 sm:p-0">
                                <div className="p-2 w-fit rounded-lg bg-primary/10">
                                    <Shield className="w-4 h-4 text-primary" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Employee ID</p>
                                    <p className="font-medium text-sm">{user.employeeId || "N/A"}</p>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-2 sm:p-0">
                                <div className="p-2 w-fit rounded-lg bg-primary/10">
                                    <Briefcase className="w-4 h-4 text-primary" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Designation & Department</p>
                                    <p className="font-medium text-sm">{user.designation || "N/A"} • {user.department || "N/A"}</p>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-2 sm:p-0">
                                <div className="p-2 w-fit rounded-lg bg-primary/10">
                                    <Calendar className="w-4 h-4 text-primary" />
                                </div>
                                <div>
                                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Join Date</p>
                                    <p className="font-medium text-sm">
                                        {user.joinDate ? format(new Date(user.joinDate), "MMMM dd, yyyy") : "N/A"}
                                    </p>
                                </div>
                            </div>

                            {user.phone && (
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-2 sm:p-0">
                                    <div className="p-2 w-fit rounded-lg bg-primary/10">
                                        <Phone className="w-4 h-4 text-primary" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Phone Number</p>
                                        <p className="font-medium text-sm">{user.phone}</p>
                                    </div>
                                </div>
                            )}

                            {user.address && (
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-2 sm:p-0">
                                    <div className="p-2 w-fit rounded-lg bg-primary/10">
                                        <MapPin className="w-4 h-4 text-primary" />
                                    </div>
                                    <div className="break-words max-w-full">
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Office/Home Address</p>
                                        <p className="font-medium text-sm whitespace-pre-wrap">{user.address}</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Change Password */}
                <Card className="shadow-lg border-primary/10 h-fit">
                    <CardHeader className="bg-primary/5">
                        <CardTitle className="flex items-center gap-2">
                            <Key className="w-5 h-5 text-primary" />
                            Security Settings
                        </CardTitle>
                        <CardDescription>Update your secret password to keep your account safe</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="oldPassword">Current Password</Label>
                                <div className="relative">
                                    <span className="absolute left-3 inset-y-0 flex items-center pointer-events-none">
                                        <Key className="h-4 w-4 text-muted-foreground" />
                                    </span>
                                    <Input
                                        id="oldPassword"
                                        type={showOldPassword ? "text" : "password"}
                                        placeholder="Enter current password"
                                        className="pl-9 pr-10 bg-muted/20"
                                        {...register("oldPassword")}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowOldPassword(!showOldPassword)}
                                        className="absolute right-3 inset-y-0 flex items-center text-muted-foreground hover:text-foreground"
                                    >
                                        {showOldPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                                {errors.oldPassword && (
                                    <p className="text-xs font-medium text-destructive">{errors.oldPassword.message}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="newPassword">New Password</Label>
                                <div className="relative">
                                    <span className="absolute left-3 inset-y-0 flex items-center pointer-events-none">
                                        <Shield className="h-4 w-4 text-muted-foreground" />
                                    </span>
                                    <Input
                                        id="newPassword"
                                        type={showNewPassword ? "text" : "password"}
                                        placeholder="Minimal 6 characters"
                                        className="pl-9 pr-10 bg-muted/20"
                                        {...register("newPassword")}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNewPassword(!showNewPassword)}
                                        className="absolute right-3 inset-y-0 flex items-center text-muted-foreground hover:text-foreground"
                                    >
                                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                                {errors.newPassword && (
                                    <p className="text-xs font-medium text-destructive">{errors.newPassword.message}</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                                <div className="relative">
                                    <span className="absolute left-3 inset-y-0 flex items-center pointer-events-none">
                                        <Shield className="h-4 w-4 text-muted-foreground" />
                                    </span>
                                    <Input
                                        id="confirmPassword"
                                        type={showConfirmPassword ? "text" : "password"}
                                        placeholder="Repeat new password"
                                        className="pl-9 pr-10 bg-muted/20"
                                        {...register("confirmPassword")}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        className="absolute right-3 inset-y-0 flex items-center text-muted-foreground hover:text-foreground"
                                    >
                                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                </div>
                                {errors.confirmPassword && (
                                    <p className="text-xs font-medium text-destructive">{errors.confirmPassword.message}</p>
                                )}
                            </div>

                            <Button
                                type="submit"
                                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold h-11"
                                disabled={changePasswordMutation.isPending}
                            >
                                {changePasswordMutation.isPending ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Updating Security...
                                    </>
                                ) : (
                                    "Update Password"
                                )}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}


