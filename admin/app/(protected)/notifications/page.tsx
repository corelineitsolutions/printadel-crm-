"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationAPI } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Bell,
    Check,
    Trash2,
    Clock,
    Loader2,
    CheckCircle2,
    Inbox,
    ExternalLink,
    Filter
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";

export default function NotificationsPage() {
    const queryClient = useQueryClient();
    const [filter, setFilter] = useState<"all" | "unread">("all");

    const { data: notifications, isLoading } = useQuery({
        queryKey: ["notifications", filter],
        queryFn: async () => {
            const response = await notificationAPI.getNotifications(filter === "unread", 50);
            return response.data.data?.notifications || [];
        },
    });

    const markAsReadMutation = useMutation({
        mutationFn: (id: string) => notificationAPI.markAsRead(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
            queryClient.invalidateQueries({ queryKey: ["unreadCount"] });
        },
    });

    const markAllAsReadMutation = useMutation({
        mutationFn: () => notificationAPI.markAllAsRead(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
            queryClient.invalidateQueries({ queryKey: ["unreadCount"] });
            toast.success("All notifications marked as read");
        },
    });

    const deleteNotificationMutation = useMutation({
        mutationFn: (id: string) => notificationAPI.deleteNotification(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
            queryClient.invalidateQueries({ queryKey: ["unreadCount"] });
            toast.success("Notification deleted");
        },
    });

    const getIcon = (type: string) => {
        switch (type) {
            case "TASK_ASSIGNED":
            case "TASK_COMPLETED":
            case "TASK_STATUS_UPDATED":
                return <CheckCircle2 className="w-5 h-5 text-blue-500" />;
            case "LEAVE_REQUEST":
            case "LEAVE_APPROVED":
            case "LEAVE_REJECTED":
                return <Inbox className="w-5 h-5 text-orange-500" />;
            default:
                return <Bell className="w-5 h-5 text-primary" />;
        }
    };

    return (
        <div className="container max-w-4xl mx-auto py-8 px-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold flex items-center gap-3">
                        <Bell className="w-8 h-8 text-primary" />
                        Notifications
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Stay updated with the latest tasks, leaves, and system alerts
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => markAllAsReadMutation.mutate()}
                        disabled={!notifications || notifications.length === 0}
                    >
                        <Check className="w-4 h-4" />
                        Mark all as read
                    </Button>
                </div>
            </div>

            <div className="flex items-center gap-4 mb-6">
                <Button
                    variant={filter === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilter("all")}
                    className="rounded-full px-6"
                >
                    All
                </Button>
                <Button
                    variant={filter === "unread" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilter("unread")}
                    className="rounded-full px-6"
                >
                    Unread
                </Button>
            </div>

            <Card className="border-none shadow-md overflow-hidden">
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                            <Loader2 className="w-10 h-10 animate-spin mb-4 text-primary" />
                            <p>Loading notifications...</p>
                        </div>
                    ) : !notifications || notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground text-center">
                            <div className="bg-muted p-6 rounded-full mb-4">
                                <Inbox className="w-12 h-12 opacity-20" />
                            </div>
                            <h3 className="text-xl font-semibold text-foreground">All caught up!</h3>
                            <p className="mt-1">You have no {filter === "unread" ? "unread" : ""} notifications at the moment.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border">
                            {notifications.map((notification: any) => (
                                <div
                                    key={notification.id || notification._id}
                                    className={cn(
                                        "flex gap-4 p-5 transition-colors group relative",
                                        !notification.isRead ? "bg-primary/5" : "hover:bg-muted/40"
                                    )}
                                >
                                    <div className="mt-1 shrink-0">
                                        <div className={cn(
                                            "p-2 rounded-full",
                                            !notification.isRead ? "bg-primary/10" : "bg-muted"
                                        )}>
                                            {getIcon(notification.type)}
                                        </div>
                                    </div>

                                    <div className="flex-1 space-y-1 pr-12">
                                        <div className="flex items-center gap-2">
                                            <h4 className={cn(
                                                "font-semibold text-base",
                                                !notification.isRead ? "text-foreground" : "text-muted-foreground"
                                            )}>
                                                {notification.title}
                                            </h4>
                                            {!notification.isRead && (
                                                <Badge className="bg-primary text-[10px] h-4 px-1 align-top">
                                                    New
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            {notification.message}
                                        </p>
                                        <div className="flex items-center gap-4 mt-2">
                                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                                <Clock className="w-3.5 h-3.5" />
                                                {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                                            </span>

                                            {notification.link && (
                                                <Link
                                                    href={notification.link}
                                                    className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                    View Details
                                                </Link>
                                            )}
                                        </div>
                                    </div>

                                    <div className="absolute right-5 top-5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                        {!notification.isRead && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                                                onClick={() => markAsReadMutation.mutate(notification.id || notification._id)}
                                                title="Mark as read"
                                            >
                                                <Check className="w-4 h-4" />
                                            </Button>
                                        )}
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => deleteNotificationMutation.mutate(notification.id || notification._id)}
                                            title="Delete notification"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
