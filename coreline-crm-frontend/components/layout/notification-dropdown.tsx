"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationAPI } from "@/lib/api";
import { useEffect } from "react";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, Clock, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

export function NotificationDropdown() {
    const queryClient = useQueryClient();
    const { user } = useAuthStore();
    const router = useRouter();

    useEffect(() => {
        const userId = user?.id || (user as any)?._id;
        if (!userId) return;

        const socket = getSocket();

        if (socket.connected) {
            socket.emit("join", userId);
        }

        socket.on("connect", () => {
            console.log("🔌 Connected to notification server");
            // Join user's private room
            socket.emit("join", userId);
        });

        socket.on("connect_error", (err) => {
            console.error("🔌 Socket connection error:", err);
        });

        const handleNewNotification = (data: any) => {
            console.log("🔔 Real-time notification received:", data);

            // Play notification sound
            const audioPath = "/Notification Sound.mp3";
            const audio = new Audio(audioPath);
            audio.play().catch(err => {
                console.warn("🔇 Audio play blocked or failed:", err.message);
            });

            // Show a brief toast notification
            toast.info(data.title || "New Notification", {
                description: data.message,
                duration: 5000,
            });

            // Refresh notification list and unread count
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
            queryClient.invalidateQueries({ queryKey: ["unreadCount"] });
        };

        socket.on("notification", handleNewNotification);

        return () => {
            socket.off("notification", handleNewNotification);
        };
    }, [user, queryClient]);

    const { data: notificationsData, isLoading } = useQuery({
        queryKey: ["notifications"],
        queryFn: async () => {
            const response = await notificationAPI.getNotifications(false, 10);
            return response.data.data?.notifications || [];
        },
        refetchInterval: 30000, // Refetch every 30 seconds
    });

    const { data: unreadCountData } = useQuery({
        queryKey: ["unreadCount"],
        queryFn: async () => {
            const response = await notificationAPI.getUnreadCount();
            return response.data.data?.count || 0;
        },
        refetchInterval: 10000, // Refetch every 10 seconds
        staleTime: 0, // Always consider stale so reload fetches fresh
    });

    const markAsReadMutation = useMutation({
        mutationFn: (id: string) => notificationAPI.markAsRead(id),
        onMutate: () => {
            // Instantly decrement count by 1
            queryClient.setQueryData(["unreadCount"], (old: any) => {
                const current = typeof old === "number" ? old : 0;
                return Math.max(0, current - 1);
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
            queryClient.invalidateQueries({ queryKey: ["unreadCount"] });
        },
    });

    const markAllAsReadMutation = useMutation({
        mutationFn: () => notificationAPI.markAllAsRead(),
        onMutate: () => {
            // Instantly clear the badge without waiting for server response
            queryClient.setQueryData(["unreadCount"], 0);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
            queryClient.invalidateQueries({ queryKey: ["unreadCount"] });
        },
    });

    const notifications = notificationsData || [];
    const unreadCount = unreadCountData || 0;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-9 w-9">
                    <Bell className="w-4 h-4 md:w-5 md:h-5" />
                    {unreadCount > 0 && (
                        <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-[10px] text-white flex items-center justify-center rounded-full">
                            {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-80" align="end">
                <DropdownMenuLabel className="flex items-center justify-between font-bold">
                    Notifications
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7 px-2 hover:bg-transparent text-primary"
                            onClick={() => markAllAsReadMutation.mutate()}
                        >
                            Mark all as read
                        </Button>
                    )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="max-h-[400px] overflow-y-auto">
                    {isLoading ? (
                        <div className="p-4 flex justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="p-8 text-center text-sm text-muted-foreground">
                            No notifications yet
                        </div>
                    ) : (
                        notifications.map((notification: any) => (
                            <DropdownMenuItem
                                key={notification.id || notification._id}
                                className={cn(
                                    "flex flex-col items-start gap-1 p-4 cursor-pointer focus:bg-muted",
                                    !notification.isRead && "bg-primary/5 font-medium"
                                )}
                                onClick={() => {
                                    // Mark as read
                                    if (!notification.isRead) {
                                        markAsReadMutation.mutate(notification.id || notification._id);
                                    }
                                    // Navigate to linked page
                                    if (notification.link) {
                                        router.push(notification.link);
                                    }
                                }}
                            >
                                <div className="flex w-full justify-between gap-1">
                                    <span className="font-semibold text-sm line-clamp-1">{notification.title}</span>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {!notification.isRead && (
                                            <div className="w-2 h-2 rounded-full bg-primary mt-1.5" />
                                        )}
                                        {notification.link && (
                                            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                                        )}
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                    {notification.message}
                                </p>
                                <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                                    <Clock className="w-3 h-3" />
                                    {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                                </div>
                            </DropdownMenuItem>
                        ))
                    )}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="p-2 justify-center text-xs text-muted-foreground focus:bg-transparent">
                    <Link href="/notifications" className="hover:underline">
                        View all notifications
                    </Link>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
