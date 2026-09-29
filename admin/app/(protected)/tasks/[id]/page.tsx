"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft,
  Play,
  Square,
  Pause,
  Clock,
  User,
  Calendar,
  Target,
  MessageSquare,
  CheckSquare,
  Plus,
  Loader2,
  AlertCircle,
  Send,
  Users,
  Edit,
  Trash2,
  Image as ImageIcon,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { api, taskAPI, projectAPI, employeeAPI } from "@/lib/api";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const editTaskSchema = z.object({
  title: z.string().min(3, "Task title must be at least 3 characters"),
  description: z.string().optional(),
  projectId: z.string().optional(),
  assignedTo: z.array(z.string()).min(1, "At least one assignee is required"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  status: z.enum(["TO_DO", "IN_PROGRESS", "UNDER_REVIEW", "COMPLETED", "REJECTED"]).optional(),
  estimatedHours: z.string().optional(),
  deadline: z.string().optional(),
  taskImages: z.array(z.string()).optional(),
});

type EditTaskFormData = z.infer<typeof editTaskSchema>;

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const taskId = params.id as string;

  const [newComment, setNewComment] = useState("");
  const [newSubtask, setNewSubtask] = useState("");
  const [newBlockerReason, setNewBlockerReason] = useState("");
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBlockerDialog, setShowBlockerDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [taskImages, setTaskImages] = useState<string[]>([]);

  // Lightbox state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxZoom, setLightboxZoom] = useState(1);
  const [lightboxPan, setLightboxPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const lightboxRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<EditTaskFormData>({
    resolver: zodResolver(editTaskSchema),
  });

  // Update current time every second for live timer
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch task details (declared here so lightbox useEffect can reference taskData)
  const { data: taskData, isLoading } = useQuery({
    queryKey: ["task", taskId],
    queryFn: async () => {
      const response = await api.get(`/tasks/${taskId}`);
      return response.data.data;
    },
  });

  // Keyboard controls for lightbox
  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightboxOpen(false);
        setLightboxZoom(1);
        setLightboxPan({ x: 0, y: 0 });
      } else if (e.key === "ArrowRight") {
        setLightboxIndex((i) => (i + 1) % (taskData?.taskImages?.length || 1));
        setLightboxZoom(1);
        setLightboxPan({ x: 0, y: 0 });
      } else if (e.key === "ArrowLeft") {
        setLightboxIndex((i) => (i - 1 + (taskData?.taskImages?.length || 1)) % (taskData?.taskImages?.length || 1));
        setLightboxZoom(1);
        setLightboxPan({ x: 0, y: 0 });
      } else if (e.key === "+" || e.key === "=") {
        setLightboxZoom((z) => Math.min(z + 0.25, 5));
      } else if (e.key === "-") {
        setLightboxZoom((z) => {
          const next = Math.max(z - 0.25, 1);
          if (next === 1) setLightboxPan({ x: 0, y: 0 });
          return next;
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxOpen, taskData]);

  // Handle Ctrl+V paste for images
  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
              const base64 = e.target?.result as string;
              setTaskImages((prev) => [...prev, base64]);
              // If edit dialog is open, we need to update the form value
              if (showEditDialog) {
                const currentImages = watch("taskImages") || [];
                setValue("taskImages", [...currentImages, base64]);
              } else {
                // Even if not in dialog, if we paste, we might want to trigger an immediate update or just wait for edit
                // For now, let's assume paste happens mostly in edit mode or we'll add a specific paste area
              }
            };
            reader.readAsDataURL(file);
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [showEditDialog, watch, setValue]);


  // Fetch projects for dropdown
  const { data: projectsData } = useQuery({
    queryKey: ["projectsList"],
    queryFn: async () => {
      const response = await projectAPI.getAllProjects({ limit: 100 });
      return response.data.data;
    },
    enabled: showEditDialog,
  });

  // Fetch employees for assignment
  const { data: employeesData } = useQuery({
    queryKey: ["employeesList"],
    queryFn: async () => {
      const response = await employeeAPI.getAllEmployees({ limit: 500 });
      return response.data.data;
    },
    enabled: showEditDialog,
  });

  // Start timer mutation
  const startTimerMutation = useMutation({
    mutationFn: () => api.post(`/tasks/${taskId}/timer/start`),
    onSuccess: () => {
      toast.success("Timer started!");
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to start timer");
    },
  });

  // Pause timer mutation
  const pauseTimerMutation = useMutation({
    mutationFn: (timerId: string) => api.post(`/tasks/timer/${timerId}/pause`),
    onSuccess: () => {
      toast.success("Timer paused!");
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to pause timer");
    },
  });

  // Resume timer mutation
  const resumeTimerMutation = useMutation({
    mutationFn: (timerId: string) => api.post(`/tasks/timer/${timerId}/resume`),
    onSuccess: () => {
      toast.success("Timer resumed!");
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to resume timer");
    },
  });

  // Stop timer mutation
  const stopTimerMutation = useMutation({
    mutationFn: ({ timerId, notes }: { timerId: string; notes?: string }) =>
      api.post(`/tasks/timer/${timerId}/stop`, { notes }),
    onSuccess: () => {
      toast.success("Timer stopped!");
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to stop timer");
    },
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: ({ comment, isFeedback }: { comment: string; isFeedback?: boolean }) =>
      api.post(`/tasks/${taskId}/comments`, { comment, isFeedback }),
    onSuccess: () => {
      toast.success("Comment added!");
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      setNewComment("");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to add comment");
    },
  });

  // Add subtask mutation
  const addSubtaskMutation = useMutation({
    mutationFn: (title: string) =>
      api.post(`/tasks/${taskId}/subtasks`, { title }),
    onSuccess: () => {
      toast.success("Subtask added!");
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      setNewSubtask("");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to add subtask");
    },
  });

  // Toggle subtask mutation
  const toggleSubtaskMutation = useMutation({
    mutationFn: ({ subtaskId, isCompleted }: { subtaskId: string; isCompleted: boolean }) =>
      api.put(`/tasks/subtasks/${subtaskId}`, { isCompleted }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to update subtask");
    },
  });

  // Update task mutation
  const editTaskMutation = useMutation({
    mutationFn: (data: EditTaskFormData) => {
      const parsedHours = data.estimatedHours && !isNaN(parseFloat(data.estimatedHours))
        ? parseFloat(data.estimatedHours)
        : undefined;
      return taskAPI.updateTask(taskId, {
        ...data,
        estimatedHours: parsedHours,
      });
    },
    onSuccess: () => {
      toast.success("Task updated successfully!");
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setShowEditDialog(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to update task");
    },
  });

  // Update task status mutation
  const updateStatusMutation = useMutation({
    mutationFn: (status: string) =>
      api.put(`/tasks/${taskId}`, { status }),
    onSuccess: () => {
      toast.success("Task status updated!");
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to update status");
    },
  });

  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: () => api.delete(`/tasks/${taskId}`),
    onSuccess: () => {
      toast.success("Task deleted successfully!");
      router.push("/tasks");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to delete task");
    },
  });

  // Report Blocker mutation
  const reportBlockerMutation = useMutation({
    mutationFn: (reason: string) => api.post(`/tasks/${taskId}/block`, { reason }),
    onSuccess: () => {
      toast.success("Blocker reported");
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      setNewBlockerReason("");
      setShowBlockerDialog(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to report blocker");
    },
  });

  // Resolve Blocker mutation
  const resolveBlockerMutation = useMutation({
    mutationFn: () => api.post(`/tasks/${taskId}/unblock`),
    onSuccess: () => {
      toast.success("Blocker resolved");
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to resolve blocker");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!taskData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <AlertCircle className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold mb-2">Task Not Found</h2>
        <Link href="/tasks">
          <Button>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Tasks
          </Button>
        </Link>
      </div>
    );
  }

  const task = taskData;

  // Get user ID (handle both _id and id)
  const userId = (user as any)?._id || user?.id;

  // Check if current user is assigned to this task
  const isAssignee = (() => {
    if (!task.assignedTo || !userId) return false;

    if (Array.isArray(task.assignedTo)) {
      const found = task.assignedTo.some((assignee: any) => {
        const assigneeId = assignee?._id || assignee?.id || assignee;
        return assigneeId === userId || String(assigneeId) === String(userId);
      });
      return found;
    } else {
      const assigneeId = task.assignedTo?._id || task.assignedTo?.id || task.assignedTo;
      const found = assigneeId === userId || String(assigneeId) === String(userId);
      return found;
    }
  })();

  const isManager = user?.role === "ADMIN" || user?.role === "MANAGER";
  const hasActiveTimer = task.activeTimer;
  const isTimerPaused = hasActiveTimer && task.activeTimer.pauseStartTime != null;

  // Check if user can edit/delete this task
  const isTaskCreator = (task.assignedBy?._id || task.assignedBy?.id) === userId;
  const canEdit = isManager || isTaskCreator || isAssignee;
  const canDelete = isManager || isTaskCreator;

  // Calculate live timer duration
  const calculateTimerDuration = () => {
    if (!hasActiveTimer) return "0:00:00";

    const startTime = new Date(task.activeTimer.startTime).getTime();
    const pauseDuration = task.activeTimer.pauseDuration || 0;

    let elapsed;
    if (isTimerPaused) {
      // Timer is paused - calculate time up to pause point
      const pauseTime = new Date(task.activeTimer.pauseStartTime).getTime();
      elapsed = Math.floor((pauseTime - startTime - pauseDuration) / 1000);
    } else {
      // Timer is running - calculate current elapsed time
      elapsed = Math.floor((currentTime - startTime - pauseDuration) / 1000);
    }

    elapsed = Math.max(0, elapsed); // Prevent negative values from clock skew
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const isBlocked = task.isBlocked;

  const handleEditClick = () => {
    const assignedIds = Array.isArray(task.assignedTo)
      ? task.assignedTo.map((a: any) => a._id || a.id || a)
      : [task.assignedTo?._id || task.assignedTo?.id || task.assignedTo];

    const initialImages = task.taskImages || [];

    reset({
      title: task.title,
      description: task.description || "",
      projectId: task.projectId?._id || task.projectId?.id || "none",
      priority: task.priority,
      status: task.status,
      estimatedHours: task.estimatedHours?.toString() || "",
      deadline: task.deadline ? format(new Date(task.deadline), "yyyy-MM-dd") : "",
      assignedTo: assignedIds,
      taskImages: initialImages,
    });
    setSelectedAssignees(assignedIds);
    setTaskImages(initialImages);
    setShowEditDialog(true);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setTaskImages((prev) => [...prev, base64]);
        if (showEditDialog) {
          const currentImages = watch("taskImages") || [];
          setValue("taskImages", [...currentImages, base64]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setTaskImages((prev) => {
      const newImages = prev.filter((_, i) => i !== index);
      if (showEditDialog) {
        setValue("taskImages", newImages);
      }
      return newImages;
    });
  };

  const toggleAssignee = (assigneeId: string) => {
    const newAssignees = selectedAssignees.includes(assigneeId)
      ? selectedAssignees.filter((id) => id !== assigneeId)
      : [...selectedAssignees, assigneeId];
    setSelectedAssignees(newAssignees);
    setValue("assignedTo", newAssignees);
  };

  const onEditSubmit = (data: EditTaskFormData) => {
    const payload = {
      ...data,
      projectId: data.projectId === "none" ? undefined : data.projectId,
    };
    editTaskMutation.mutate(payload);
  };

  const getStatusColor = (status: string) => {
    const colors: any = {
      TO_DO: "bg-gray-100 text-gray-800",
      IN_PROGRESS: "bg-blue-100 text-blue-800",
      UNDER_REVIEW: "bg-purple-100 text-purple-800",
      COMPLETED: "bg-green-100 text-green-800",
      REJECTED: "bg-red-100 text-red-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const getPriorityColor = (priority: string) => {
    const colors: any = {
      LOW: "bg-gray-100 text-gray-800",
      MEDIUM: "bg-blue-100 text-blue-800",
      HIGH: "bg-orange-100 text-orange-800",
      URGENT: "bg-red-100 text-red-800",
    };
    return colors[priority] || "bg-gray-100 text-gray-800";
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Blocker Alert */}
      {isBlocked && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md shadow-sm mb-6 flex items-start justify-between">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="text-red-800 font-bold">This task is BLOCKED</h3>
              <p className="text-red-700 text-sm mt-1">{task.blockerReason}</p>
            </div>
          </div>
          {isAssignee && (
            <Button
              size="sm"
              variant="outline"
              className="bg-white border-red-200 text-red-600 hover:bg-red-50"
              onClick={() => resolveBlockerMutation.mutate()}
              disabled={resolveBlockerMutation.isPending}
            >
              Resolve Blocker
            </Button>
          )}
        </div>
      )}

      {/* Header */}
      <div className="space-y-4 mb-6">
        {/* Back button */}
        <Link href="/tasks">
          <Button variant="ghost" size="sm" className="gap-2 -ml-2">
            <ArrowLeft className="w-4 h-4" />
            Back to Tasks
          </Button>
        </Link>

        {/* Title and badges */}
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold break-words">{task.title}</h1>

          <div className="flex flex-wrap items-center gap-2">
            <Badge className={getStatusColor(task.status)}>
              {task.status.replace("_", " ")}
            </Badge>
            <Badge className={getPriorityColor(task.priority)}>
              {task.priority}
            </Badge>
            {task.project && (
              <Link href={`/projects/${task.project.id}`}>
                <Badge variant="outline" className="cursor-pointer hover:bg-muted">
                  {task.project.name}
                </Badge>
              </Link>
            )}
          </div>
        </div>

        {/* Action buttons row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Start Timer - only when no active timer */}
          {isAssignee && !hasActiveTimer && task.status !== "COMPLETED" && task.status !== "REJECTED" && (
            <Button
              size="default"
              className="gap-2 bg-green-600 hover:bg-green-700"
              onClick={() => startTimerMutation.mutate()}
              disabled={startTimerMutation.isPending}
            >
              {startTimerMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Start Timer
            </Button>
          )}

          {/* Report Blocker button */}
          {(isAssignee || isManager) && !isBlocked && task.status !== "COMPLETED" && (
            <Button
              variant="outline"
              size="default"
              className="gap-2 text-orange-600 border-orange-200 hover:bg-orange-50"
              onClick={() => setShowBlockerDialog(true)}
            >
              <AlertCircle className="w-4 h-4" />
              Report Blocker
            </Button>
          )}

          {/* Edit/Delete buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <Button
                variant="outline"
                size="default"
                className="gap-2"
                onClick={handleEditClick}
              >
                <Edit className="w-4 h-4" />
                Edit
              </Button>
            )}
            {canDelete && (
              <Button
                variant="outline"
                size="default"
                className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </Button>
            )}
          </div>

          {/* Re-open button for Admin/Manager */}
          {isManager && task.status === "COMPLETED" && (
            <Button
              size="default"
              variant="outline"
              className="gap-2 border-orange-500 text-orange-600 hover:bg-orange-50"
              onClick={() => updateStatusMutation.mutate("IN_PROGRESS")}
              disabled={updateStatusMutation.isPending}
            >
              {updateStatusMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              Re-open Task
            </Button>
          )}
        </div>
      </div>

      {/* Active Timer Card - Prominent Display */}
      {hasActiveTimer && (
        <Card className={`${isTimerPaused ? "bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-300" : "bg-gradient-to-r from-green-50 to-emerald-50 border-green-300"} shadow-lg`}>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={`p-4 rounded-full ${isTimerPaused ? "bg-yellow-100" : "bg-green-100"}`}>
                  <Clock className={`w-8 h-8 ${isTimerPaused ? "text-yellow-600" : "text-green-600 animate-pulse"}`} />
                </div>
                <div>
                  <p className={`text-sm font-medium ${isTimerPaused ? "text-yellow-800" : "text-green-800"}`}>
                    {isTimerPaused ? "Timer Paused" : "Timer Running"}
                  </p>
                  <p className={`text-4xl font-bold ${isTimerPaused ? "text-yellow-700" : "text-green-700"} font-mono`}>
                    {calculateTimerDuration()}
                  </p>
                  <p className={`text-xs ${isTimerPaused ? "text-yellow-600" : "text-green-600"} mt-1`}>
                    Started {format(new Date(task.activeTimer.startTime), "MMM dd, hh:mm a")}
                  </p>
                </div>
              </div>

              {/* Timer Controls */}
              {isAssignee && (
                <div className="flex gap-2">
                  {!isTimerPaused ? (
                    <Button
                      size="lg"
                      variant="outline"
                      className="gap-2 border-yellow-300 hover:bg-yellow-50"
                      onClick={() => {
                        if (task.activeTimer) {
                          pauseTimerMutation.mutate(task.activeTimer._id || task.activeTimer.id);
                        }
                      }}
                      disabled={pauseTimerMutation.isPending}
                    >
                      {pauseTimerMutation.isPending ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Pause className="w-5 h-5" />
                      )}
                      Pause
                    </Button>
                  ) : (
                    <Button
                      size="lg"
                      className="gap-2 bg-green-600 hover:bg-green-700"
                      onClick={() => {
                        if (task.activeTimer) {
                          resumeTimerMutation.mutate(task.activeTimer._id || task.activeTimer.id);
                        }
                      }}
                      disabled={resumeTimerMutation.isPending}
                    >
                      {resumeTimerMutation.isPending ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Play className="w-5 h-5" />
                      )}
                      Resume
                    </Button>
                  )}
                  <Button
                    size="lg"
                    variant="destructive"
                    className="gap-2"
                    onClick={() => {
                      if (task.activeTimer) {
                        stopTimerMutation.mutate({ timerId: task.activeTimer._id || task.activeTimer.id });
                      }
                    }}
                    disabled={stopTimerMutation.isPending}
                  >
                    {stopTimerMutation.isPending ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                    Stop
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Task Details */}
          <Card>
            <CardHeader>
              <CardTitle>Task Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Description */}
              {task.description && (
                <div>
                  <h4 className="font-semibold text-sm mb-2">Description</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {task.description}
                  </p>
                </div>
              )}

              {/* Assigned To */}
              <div>
                <h4 className="font-semibold text-sm mb-2">Assigned to</h4>
                <div className="flex flex-wrap gap-1.5">
                  {Array.isArray(task.assignedTo) ? (
                    task.assignedTo.map((assignee: any) => (
                      <Badge key={assignee._id || assignee.id} variant="secondary" className="text-xs">
                        {assignee.fullName}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      {task.assignedTo?.fullName || task.assignee?.fullName || "Unassigned"}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Deadline and Hours - Stack on mobile */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {task.deadline && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-1">
                      <span className="text-muted-foreground">Deadline:</span>
                      <span className="font-medium">
                        {format(new Date(task.deadline), "MMM dd, yyyy")}
                      </span>
                    </div>
                  </div>
                )}

                {task.actualHours !== undefined && (
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-1">
                      <span className="text-muted-foreground">Actual:</span>
                      <span className="font-medium">{task.actualHours.toFixed(2)}h</span>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Subtasks */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckSquare className="w-5 h-5" />
                Subtasks
              </CardTitle>
              {task.subtasks && task.subtasks.length > 0 && (
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs font-medium">
                    {Math.round((task.subtasks.filter((s: any) => s.isCompleted).length / task.subtasks.length) * 100)}% Complete
                  </span>
                  <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500"
                      style={{
                        width: `${(task.subtasks.filter((s: any) => s.isCompleted).length / task.subtasks.length) * 100}%`
                      }}
                    />
                  </div>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {task.subtasks && task.subtasks.length > 0 && (
                <div className="space-y-2">
                  {task.subtasks.map((subtask: any) => (
                    <div
                      key={subtask._id || subtask.id}
                      className="flex items-center gap-3 p-3 border rounded-lg"
                    >
                      <Checkbox
                        checked={subtask.isCompleted}
                        onCheckedChange={(checked) =>
                          toggleSubtaskMutation.mutate({
                            subtaskId: subtask._id || subtask.id,
                            isCompleted: !!checked,
                          })
                        }
                        disabled={!isAssignee && !isManager}
                      />
                      <span
                        className={`flex-1 ${subtask.isCompleted ? "line-through text-muted-foreground" : ""
                          }`}
                      >
                        {subtask.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(subtask.createdAt), "MMM dd")}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Subtask */}
              {isAssignee && task.status !== "COMPLETED" && (
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a subtask..."
                    value={newSubtask}
                    onChange={(e) => setNewSubtask(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter" && newSubtask.trim()) {
                        addSubtaskMutation.mutate(newSubtask.trim());
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (newSubtask.trim()) {
                        addSubtaskMutation.mutate(newSubtask.trim());
                      }
                    }}
                    disabled={!newSubtask.trim() || addSubtaskMutation.isPending}
                  >
                    {addSubtaskMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              )}

              {(!task.subtasks || task.subtasks.length === 0) && !isAssignee && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No subtasks yet
                </p>
              )}
            </CardContent>
          </Card>

          {/* Task Related Images */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                Task Related Images
              </CardTitle>
            </CardHeader>
            <CardContent>
              {task.taskImages && task.taskImages.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {task.taskImages.map((image: string, index: number) => (
                    <div
                      key={index}
                      className="group relative aspect-square rounded-lg border overflow-hidden bg-muted cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => {
                        setLightboxIndex(index);
                        setLightboxZoom(1);
                        setLightboxPan({ x: 0, y: 0 });
                        setLightboxOpen(true);
                      }}
                    >
                      <img
                        src={image}
                        alt={`Task attachment ${index + 1}`}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <Maximize2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No images attached to this task
                </p>
              )}

              {/* Image Lightbox */}
              {lightboxOpen && task.taskImages && task.taskImages.length > 0 && (() => {
                const images: string[] = task.taskImages;
                const currentImage = images[lightboxIndex];

                const closeLightbox = () => {
                  setLightboxOpen(false);
                  setLightboxZoom(1);
                  setLightboxPan({ x: 0, y: 0 });
                };

                const goNext = () => {
                  setLightboxIndex((i) => (i + 1) % images.length);
                  setLightboxZoom(1);
                  setLightboxPan({ x: 0, y: 0 });
                };

                const goPrev = () => {
                  setLightboxIndex((i) => (i - 1 + images.length) % images.length);
                  setLightboxZoom(1);
                  setLightboxPan({ x: 0, y: 0 });
                };

                const zoomIn = () => setLightboxZoom((z) => Math.min(z + 0.25, 5));
                const zoomOut = () => {
                  setLightboxZoom((z) => {
                    const next = Math.max(z - 0.25, 1);
                    if (next === 1) setLightboxPan({ x: 0, y: 0 });
                    return next;
                  });
                };
                const resetZoom = () => { setLightboxZoom(1); setLightboxPan({ x: 0, y: 0 }); };

                const handleWheel = (e: React.WheelEvent) => {
                  e.preventDefault();
                  if (e.deltaY < 0) {
                    setLightboxZoom((z) => Math.min(z + 0.15, 5));
                  } else {
                    setLightboxZoom((z) => {
                      const next = Math.max(z - 0.15, 1);
                      if (next === 1) setLightboxPan({ x: 0, y: 0 });
                      return next;
                    });
                  }
                };

                const handleMouseDown = (e: React.MouseEvent) => {
                  if (lightboxZoom <= 1) return;
                  setIsDragging(true);
                  dragStart.current = { x: e.clientX, y: e.clientY, panX: lightboxPan.x, panY: lightboxPan.y };
                };

                const handleMouseMove = (e: React.MouseEvent) => {
                  if (!isDragging) return;
                  setLightboxPan({
                    x: dragStart.current.panX + (e.clientX - dragStart.current.x),
                    y: dragStart.current.panY + (e.clientY - dragStart.current.y),
                  });
                };

                const handleMouseUp = () => setIsDragging(false);

                return (
                  <div
                    className="fixed inset-0 z-[100] bg-black/95 flex flex-col select-none"
                    onClick={(e) => { if (e.target === e.currentTarget) closeLightbox(); }}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-black/60 backdrop-blur-sm flex-shrink-0">
                      <span className="text-white/70 text-sm font-medium">
                        Image {lightboxIndex + 1} / {images.length}
                      </span>
                      <div className="flex items-center gap-2">
                        {/* Zoom controls */}
                        <button
                          onClick={zoomOut}
                          disabled={lightboxZoom <= 1}
                          className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                          title="Zoom out (-)"
                        >
                          <ZoomOut className="w-5 h-5" />
                        </button>
                        <button
                          onClick={resetZoom}
                          className="px-3 py-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 text-sm font-mono transition-all min-w-[52px] text-center"
                          title="Reset zoom"
                        >
                          {Math.round(lightboxZoom * 100)}%
                        </button>
                        <button
                          onClick={zoomIn}
                          disabled={lightboxZoom >= 5}
                          className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                          title="Zoom in (+)"
                        >
                          <ZoomIn className="w-5 h-5" />
                        </button>
                        <div className="w-px h-6 bg-white/20 mx-1" />
                        <button
                          onClick={resetZoom}
                          className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-all"
                          title="Reset"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={closeLightbox}
                          className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-red-500/80 transition-all ml-1"
                          title="Close (Esc)"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    {/* Image area */}
                    <div
                      className="flex-1 relative overflow-hidden"
                      onWheel={handleWheel}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                      style={{ cursor: lightboxZoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
                    >
                      <img
                        src={currentImage}
                        alt={`Image ${lightboxIndex + 1}`}
                        draggable={false}
                        style={{
                          position: 'absolute',
                          top: '50%',
                          left: '50%',
                          transform: `translate(calc(-50% + ${lightboxPan.x}px), calc(-50% + ${lightboxPan.y}px)) scale(${lightboxZoom})`,
                          transformOrigin: 'center center',
                          maxWidth: '90%',
                          maxHeight: '90%',
                          objectFit: 'contain',
                          transition: isDragging ? 'none' : 'transform 0.15s ease',
                          userSelect: 'none',
                          pointerEvents: 'none',
                        }}
                      />

                      {/* Prev / Next arrows */}
                      {images.length > 1 && (
                        <>
                          <button
                            onClick={goPrev}
                            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/80 text-white rounded-full transition-all backdrop-blur-sm"
                          >
                            <ChevronLeft className="w-6 h-6" />
                          </button>
                          <button
                            onClick={goNext}
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/80 text-white rounded-full transition-all backdrop-blur-sm"
                          >
                            <ChevronRight className="w-6 h-6" />
                          </button>
                        </>
                      )}
                    </div>

                    {/* Thumbnail strip */}
                    {images.length > 1 && (
                      <div className="flex items-center justify-center gap-2 px-4 py-3 bg-black/60 backdrop-blur-sm flex-shrink-0 overflow-x-auto">
                        {images.map((img: string, i: number) => (
                          <button
                            key={i}
                            onClick={() => { setLightboxIndex(i); setLightboxZoom(1); setLightboxPan({ x: 0, y: 0 }); }}
                            className={`flex-shrink-0 w-12 h-12 rounded-md overflow-hidden border-2 transition-all ${i === lightboxIndex ? 'border-white opacity-100' : 'border-transparent opacity-50 hover:opacity-80'
                              }`}
                          >
                            <img src={img} alt="" className="w-full h-full object-cover" draggable={false} />
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Keyboard hint */}
                    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 text-white/30 text-xs pointer-events-none">
                      Scroll to zoom · Drag to pan · ESC to close
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Comments & Feedback */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Comments & Feedback
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Comments List */}
              {task.comments && task.comments.length > 0 && (
                <div className="space-y-4 mb-4">
                  {task.comments.map((comment: any) => {
                    const commentUser = comment.userId || comment.user || {};
                    const commentUserId = commentUser._id || commentUser.id;
                    const userInitial = (commentUser.fullName || "?").charAt(0).toUpperCase();

                    return (
                      <div
                        key={comment._id || comment.id}
                        className={`flex gap-3 ${commentUserId === userId
                          ? "flex-row-reverse"
                          : ""
                          }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-sm font-semibold text-primary">
                            {userInitial}
                          </span>
                        </div>
                        <div
                          className={`rounded-lg p-3 max-w-[80%] ${comment.isFeedback
                            ? "bg-yellow-50 border border-yellow-200 text-yellow-900"
                            : commentUserId === userId
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted"
                            }`}
                        >
                          {comment.isFeedback && (
                            <div className="flex items-center gap-1 mb-1 text-[10px] font-bold uppercase tracking-wider text-yellow-700">
                              <AlertCircle className="w-3 h-3" />
                              Feedback from Manager
                            </div>
                          )}
                          <p className="text-sm">{comment.commentText || comment.content}</p>
                          <p className={`text-xs mt-1 opacity-70 ${comment.isFeedback ? "text-yellow-700" : ""}`}>
                            {format(new Date(comment.createdAt), "MMM dd, hh:mm a")}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add Comment */}
              <div className="space-y-2">
                <Textarea
                  placeholder={
                    isManager
                      ? "Add feedback or comment..."
                      : "Add a comment or update..."
                  }
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows={3}
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={() => {
                      if (newComment.trim()) {
                        addCommentMutation.mutate({
                          comment: newComment.trim(),
                          isFeedback: isManager
                        });
                      }
                    }}
                    disabled={!newComment.trim() || addCommentMutation.isPending}
                  >
                    {addCommentMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    {isManager ? "Send Feedback" : "Add Comment"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Task Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Task Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Created by</p>
                <p className="font-medium">{task.assignedBy?.fullName || "System"}</p>
              </div>

              {task.milestone && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Milestone</p>
                  <Badge variant="outline">{task.milestone.title}</Badge>
                </div>
              )}

              <div>
                <p className="text-sm text-muted-foreground mb-1">Created</p>
                <p className="text-sm">{format(new Date(task.createdAt), "MMM dd, yyyy")}</p>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          {(isAssignee || isManager) && task.status !== "COMPLETED" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {task.status === "TO_DO" && (
                  <Button
                    className="w-full gap-2"
                    onClick={() => updateStatusMutation.mutate("IN_PROGRESS")}
                  >
                    Start Working
                  </Button>
                )}

                {task.status === "IN_PROGRESS" && (
                  <>
                    <Button
                      className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
                      onClick={() => updateStatusMutation.mutate("UNDER_REVIEW")}
                    >
                      Submit for Review
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full gap-2 border-green-600 text-green-600 hover:bg-green-50"
                      onClick={() => updateStatusMutation.mutate("COMPLETED")}
                    >
                      Mark as Completed
                    </Button>
                  </>
                )}

                {task.status === "REJECTED" && (
                  <Button
                    className="w-full gap-2"
                    onClick={() => updateStatusMutation.mutate("IN_PROGRESS")}
                  >
                    Revise Task
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Manager Actions */}
          {isManager && task.status === "UNDER_REVIEW" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Review Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  className="w-full gap-2 bg-green-600 hover:bg-green-700"
                  onClick={() => updateStatusMutation.mutate("COMPLETED")}
                >
                  <CheckSquare className="w-4 h-4" />
                  Approve Task
                </Button>
                <Button
                  variant="destructive"
                  className="w-full gap-2"
                  onClick={() => updateStatusMutation.mutate("REJECTED")}
                >
                  <AlertCircle className="w-4 h-4" />
                  Request Changes
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Time Logs */}
          {task.timers && task.timers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Time Logs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  {task.timers && task.timers.length > 0 ? (
                    task.timers.slice(0, 5).map((timer: any) => {
                      // Calculate duration for each timer
                      const startTime = new Date(timer.startTime).getTime();
                      const pauseDuration = timer.pauseDuration || 0;

                      let endTime;
                      if (timer.endTime) {
                        // Timer is stopped - use end time
                        endTime = new Date(timer.endTime).getTime();
                      } else if (timer.pauseStartTime) {
                        // Timer is paused - use pause time (freeze at pause point)
                        endTime = new Date(timer.pauseStartTime).getTime();
                      } else {
                        // Timer is running - use current time
                        endTime = currentTime;
                      }

                      const elapsed = Math.floor((endTime - startTime - pauseDuration) / 1000);
                      const hours = Math.floor(elapsed / 3600);
                      const minutes = Math.floor((elapsed % 3600) / 60);
                      const seconds = elapsed % 60;
                      const durationStr = `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

                      return (
                        <div key={timer._id || timer.id} className="flex justify-between text-sm">
                          <span className={timer.endTime ? "text-muted-foreground" : timer.pauseStartTime ? "text-yellow-600 font-medium" : "text-green-600 font-medium"}>
                            {timer.endTime ? "Completed" : timer.pauseStartTime ? "Paused" : "Running..."} {durationStr}
                          </span>
                          <span className="text-muted-foreground">
                            {format(new Date(timer.startTime), "MMM dd")}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground">No time logs yet</p>
                  )}
                </div>
                <div className="pt-2">
                  <p className="text-sm font-semibold">
                    Total: {task.actualHours?.toFixed(2) || 0}h
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            Are you sure you want to delete this task? This action cannot be undone.
            All timer logs and comments will be permanently deleted.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteTaskMutation.mutate();
                setShowDeleteDialog(false);
              }}
              disabled={deleteTaskMutation.isPending}
            >
              {deleteTaskMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Task"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Blocker Dialog */}
      <Dialog open={showBlockerDialog} onOpenChange={setShowBlockerDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report Blocker</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Describe what is blocking you from completing this task. This will notify your manager.
            </p>
            <Textarea
              placeholder="e.g. Waiting for client credentials, dependency on Task #123..."
              value={newBlockerReason}
              onChange={(e) => setNewBlockerReason(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBlockerDialog(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={() => {
                if (newBlockerReason.trim()) {
                  reportBlockerMutation.mutate(newBlockerReason.trim());
                }
              }}
              disabled={!newBlockerReason.trim() || reportBlockerMutation.isPending}
            >
              {reportBlockerMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Reporting...
                </>
              ) : (
                "Flag as Blocked"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Edit Task Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onEditSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Task Title *</Label>
              <Input id="title" {...register("title")} placeholder="Task title..." />
              {errors.title && (
                <p className="text-sm text-red-500">{errors.title.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                {...register("description")}
                placeholder="Task description..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="projectId">Project</Label>
                <Select
                  value={watch("projectId") || ""}
                  onValueChange={(value) => setValue("projectId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Project</SelectItem>
                    {projectsData?.projects?.map((project: any) => (
                      <SelectItem key={project.id || project._id} value={project.id || project._id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assignedTo">Assign To *</Label>
                <div className="border rounded-lg p-4 max-h-60 overflow-y-auto space-y-2">
                  {employeesData?.employees?.map((emp: any) => (
                    <div key={emp.id || emp._id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`edit-assignee-${emp.id || emp._id}`}
                        checked={selectedAssignees.includes(emp.id || emp._id)}
                        onCheckedChange={() => toggleAssignee(emp.id || emp._id)}
                      />
                      <label
                        htmlFor={`edit-assignee-${emp.id || emp._id}`}
                        className="flex-1 text-sm font-medium leading-none cursor-pointer"
                      >
                        {emp.fullName}
                      </label>
                    </div>
                  ))}
                </div>
                {errors.assignedTo && (
                  <p className="text-sm text-red-500">{errors.assignedTo.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={watch("status") || "TO_DO"}
                  onValueChange={(value: any) => setValue("status", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TO_DO">To Do</SelectItem>
                    <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                    <SelectItem value="UNDER_REVIEW">Under Review</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={watch("priority") || "MEDIUM"}
                  onValueChange={(value: any) => setValue("priority", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1">
              <div className="space-y-2">
                <Label htmlFor="estimatedHours">Est. Hours</Label>
                <Input
                  id="estimatedHours"
                  type="number"
                  {...register("estimatedHours")}
                  placeholder="8"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="deadline">Deadline</Label>
                <Input id="deadline" type="date" {...register("deadline")} />
              </div>
            </div>

            <div className="space-y-4">
              <Label>Attachments (Import from device or Ctrl+V to paste)</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {taskImages.map((image, index) => (
                  <div key={index} className="relative aspect-square rounded-lg border overflow-hidden bg-muted group">
                    <img src={image} className="w-full h-full object-cover" alt="" />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <label className="border-2 border-dashed rounded-lg aspect-square flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors border-muted-foreground/20">
                  <Upload className="w-6 h-6 text-muted-foreground mb-1" />
                  <span className="text-[10px] text-muted-foreground font-medium">Upload Image</span>
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    multiple
                    onChange={handleFileImport}
                  />
                </label>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowEditDialog(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={editTaskMutation.isPending}>
                {editTaskMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
