"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Calendar,
  Users,
  Target,
  CheckCircle2,
  Clock,
  IndianRupee,
  Edit,
  Trash2,
  Plus,
  Loader2,
  FileText,
  AlertCircle,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrency } from "@/lib/utils";

// Milestone Schema
const milestoneSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  dueDate: z.string().optional(),
});

type MilestoneFormData = z.infer<typeof milestoneSchema>;

// Task Schema
const taskSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  description: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  deadline: z.string().optional(),
  estimatedHours: z.string().optional(),
  assignedTo: z.array(z.string()).min(1, "Please select at least one assignee"), // Changed to array
  milestoneId: z.string().optional(),
});

type TaskFormData = z.infer<typeof taskSchema>;

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const projectId = params.id as string;
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [showMilestoneDialog, setShowMilestoneDialog] = useState(false);
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);

  const {
    register: registerMilestone,
    handleSubmit: handleSubmitMilestone,
    reset: resetMilestone,
    formState: { errors: milestoneErrors },
  } = useForm<MilestoneFormData>({
    resolver: zodResolver(milestoneSchema),
  });

  const {
    register: registerTask,
    handleSubmit: handleSubmitTask,
    watch: watchTask,
    setValue: setValueTask,
    reset: resetTask,
    formState: { errors: taskErrors },
  } = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      priority: "MEDIUM",
      assignedTo: [],
      milestoneId: "none",
    },
  });

  const selectedPriority = watchTask("priority") || "MEDIUM";
  const selectedAssignee = watchTask("assignedTo") || [];
  const selectedTaskMilestone = watchTask("milestoneId") || "none";

  // Fetch project details
  const { data: projectData, isLoading } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const response = await api.get(`/projects/${projectId}`);
      return response.data.data;
    },
  });

  // Fetch project tasks
  const { data: tasksData } = useQuery({
    queryKey: ["projectTasks", projectId],
    queryFn: async () => {
      const response = await api.get(`/tasks?projectId=${projectId}`);
      return response.data.data;
    },
  });

  // Fetch project milestones
  const { data: milestonesData } = useQuery({
    queryKey: ["projectMilestones", projectId],
    queryFn: async () => {
      const response = await api.get(`/milestones?projectId=${projectId}`);
      return response.data.data;
    },
  });

  // Create milestone mutation
  const createMilestoneMutation = useMutation({
    mutationFn: (data: any) => api.post("/milestones", { ...data, projectId }),
    onSuccess: () => {
      toast.success("Milestone created successfully!");
      queryClient.invalidateQueries({ queryKey: ["projectMilestones", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setShowMilestoneDialog(false);
      resetMilestone();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to create milestone");
    },
  });

  // Delete project mutation
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/projects/${projectId}`),
    onSuccess: () => {
      toast.success("Project deleted successfully!");
      router.push("/projects");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to delete project");
    },
  });

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: (data: any) => api.post("/tasks", data),
    onSuccess: () => {
      toast.success("Task created successfully!");
      queryClient.invalidateQueries({ queryKey: ["projectTasks", projectId] });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setShowTaskDialog(false);
      resetTask();
      setSelectedAssignees([]);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to create task");
    },
  });

  const onSubmitMilestone = (data: MilestoneFormData) => {
    createMilestoneMutation.mutate(data);
  };

  const onSubmitTask = (data: TaskFormData) => {
    const estHours = data.estimatedHours ? parseFloat(data.estimatedHours) : undefined;
    const payload = {
      ...data,
      projectId,
      estimatedHours: isNaN(estHours as any) ? undefined : estHours,
      milestoneId: data.milestoneId === "none" ? undefined : data.milestoneId,
    };
    createTaskMutation.mutate(payload);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!projectData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <AlertCircle className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold mb-2">Project Not Found</h2>
        <p className="text-muted-foreground mb-4">
          The project you're looking for doesn't exist or has been deleted.
        </p>
        <Link href="/projects">
          <Button>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Projects
          </Button>
        </Link>
      </div>
    );
  }

  const project = projectData;
  const tasks = tasksData?.tasks || [];
  const milestones = milestonesData?.milestones || [];

  // Calculate project progress
  const calculateProgress = () => {
    if (tasks.length === 0) return 0;
    const completedTasks = tasks.filter((t: any) => t.status === "COMPLETED").length;
    return Math.round((completedTasks / tasks.length) * 100);
  };

  const progress = calculateProgress();

  const getStatusColor = (status: string) => {
    const colors: any = {
      PLANNING: "bg-blue-100 text-blue-800",
      IN_PROGRESS: "bg-yellow-100 text-yellow-800",
      ON_HOLD: "bg-orange-100 text-orange-800",
      COMPLETED: "bg-green-100 text-green-800",
      CANCELLED: "bg-red-100 text-red-800",
      TO_DO: "bg-gray-100 text-gray-800",
      IN_REVIEW: "bg-purple-100 text-purple-800",
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/projects">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl sm:text-3xl font-bold">{project.name}</h1>
              <Badge className={getStatusColor(project.status)}>
                {project.status.replace("_", " ")}
              </Badge>
            </div>
            <p className="text-muted-foreground">Project Code: {project.code}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Link href={`/projects/edit/${projectId}`}>
            <Button variant="outline" className="gap-2">
              <Edit className="w-4 h-4" />
              Edit
            </Button>
          </Link>
          <Button
            variant="destructive"
            className="gap-2"
            onClick={() => setDeleteConfirm(true)}
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                <span className="font-semibold">Project Progress</span>
              </div>
              <span className="text-2xl font-bold text-primary">{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-primary h-3 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {tasks.filter((t: any) => t.status === "COMPLETED").length} of {tasks.length} tasks completed
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Tasks</p>
                <p className="text-2xl font-bold">{tasks.length}</p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold">
                  {tasks.filter((t: any) => t.status === "COMPLETED").length}
                </p>
              </div>
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Milestones</p>
                <p className="text-2xl font-bold">{milestones.length}</p>
              </div>
              <Target className="w-8 h-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Team Members</p>
                <p className="text-2xl font-bold">{project.members?.length || 0}</p>
              </div>
              <Users className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Project Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {project.description && (
                <div>
                  <h3 className="font-semibold mb-2">Description</h3>
                  <p className="text-muted-foreground">{project.description}</p>
                </div>
              )}

              {project.requirements && (
                <div>
                  <h3 className="font-semibold mb-2">Requirements</h3>
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {project.requirements}
                  </p>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                {project.clientName && (
                  <div>
                    <h3 className="font-semibold mb-2">Client</h3>
                    <p className="text-muted-foreground">{project.clientName}</p>
                  </div>
                )}

                {project.startDate && (
                  <div>
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Start Date
                    </h3>
                    <p className="text-muted-foreground">
                      {format(new Date(project.startDate), "MMM dd, yyyy")}
                    </p>
                  </div>
                )}

                {project.deadline && (
                  <div>
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      Deadline
                    </h3>
                    <p className="text-muted-foreground">
                      {format(new Date(project.deadline), "MMM dd, yyyy")}
                    </p>
                  </div>
                )}

                {project.budget && (
                  <div>
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <IndianRupee className="w-4 h-4" />
                      Budget
                    </h3>
                    <p className="text-muted-foreground">{formatCurrency(project.budget)}</p>
                  </div>
                )}

                {project.creator && (
                  <div>
                    <h3 className="font-semibold mb-2">Created By</h3>
                    <p className="text-muted-foreground">{project.creator.fullName}</p>
                    <p className="text-sm text-muted-foreground">{project.creator.email}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Tab */}
        <TabsContent value="team">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Team Members</CardTitle>
              <Button size="sm" className="gap-2">
                <Plus className="w-4 h-4" />
                Add Member
              </Button>
            </CardHeader>
            <CardContent>
              {project.members && project.members.length > 0 ? (
                <div className="space-y-4">
                  {project.members.map((member: any) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-lg font-semibold text-primary">
                            {member.user?.fullName?.charAt(0) || "?"}
                          </span>
                        </div>
                        <div>
                          <p className="font-semibold">{member.user?.fullName || "Unknown User"}</p>
                          <p className="text-sm text-muted-foreground">{member.user?.email || "No email"}</p>
                          {member.user?.designation && (
                            <p className="text-xs text-muted-foreground">
                              {member.user.designation}
                            </p>
                          )}
                        </div>
                      </div>
                      {member.role && (
                        <Badge variant="secondary">{member.role}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No team members assigned yet
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Milestones Tab */}
        <TabsContent value="milestones">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Milestones</CardTitle>
              <Button size="sm" className="gap-2" onClick={() => setShowMilestoneDialog(true)}>
                <Plus className="w-4 h-4" />
                Add Milestone
              </Button>
            </CardHeader>
            <CardContent>
              {milestones.length > 0 ? (
                <div className="space-y-4">
                  {milestones.map((milestone: any) => (
                    <div
                      key={milestone.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold">{milestone.title}</h4>
                          <Badge className={getStatusColor(milestone.status)}>
                            {milestone.status.replace("_", " ")}
                          </Badge>
                        </div>
                        {milestone.description && (
                          <p className="text-sm text-muted-foreground mb-2">
                            {milestone.description}
                          </p>
                        )}
                        {milestone.dueDate && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Due: {format(new Date(milestone.dueDate), "MMM dd, yyyy")}
                          </p>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {milestone._count?.tasks || 0} tasks
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No milestones created yet</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 gap-2"
                    onClick={() => setShowMilestoneDialog(true)}
                  >
                    <Plus className="w-4 h-4" />
                    Create First Milestone
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Tasks</CardTitle>
              <Button
                size="sm"
                className="gap-2"
                onClick={() => setShowTaskDialog(true)}
              >
                <Plus className="w-4 h-4" />
                Create Task in Project
              </Button>
            </CardHeader>
            <CardContent>
              {tasks.length > 0 ? (
                <div className="space-y-4">
                  {tasks.map((task: any) => (
                    <div
                      key={task.id}
                      className="flex items-start justify-between p-4 border rounded-lg hover:shadow-md transition-shadow"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold">{task.title}</h4>
                          <Badge className={getStatusColor(task.status)}>
                            {task.status.replace("_", " ")}
                          </Badge>
                          <Badge className={getPriorityColor(task.priority)}>
                            {task.priority}
                          </Badge>
                        </div>
                        {task.description && (
                          <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                            {task.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {task.assignedTo && task.assignedTo.length > 0 && (
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {Array.isArray(task.assignedTo)
                                ? task.assignedTo.map((a: any) => a.fullName || a).join(", ")
                                : task.assignedTo.fullName || task.assignedTo
                              }
                            </span>
                          )}
                          {task.deadline && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {format(new Date(task.deadline), "MMM dd")}
                            </span>
                          )}
                          {task.estimatedHours && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {task.estimatedHours}h
                            </span>
                          )}
                        </div>
                      </div>
                      <Link href={`/tasks/${task._id || task.id}`}>
                        <Button variant="ghost" size="sm">
                          View
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No tasks assigned to this project yet</p>
                  <Link href="/tasks">
                    <Button variant="outline" size="sm" className="mt-4 gap-2">
                      <Plus className="w-4 h-4" />
                      Create First Task
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Task Dialog */}
      <Dialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Task in {project?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitTask(onSubmitTask)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">
                Task Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                {...registerTask("title")}
                placeholder="Implement user authentication"
              />
              {taskErrors.title && (
                <p className="text-sm text-red-500">{taskErrors.title.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                {...registerTask("description")}
                placeholder="Task description and requirements"
                rows={4}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="priority">
                  Priority <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={selectedPriority}
                  onValueChange={(value: any) => setValueTask("priority", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
                {taskErrors.priority && (
                  <p className="text-sm text-red-500">{taskErrors.priority.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="estimatedHours">Estimated Hours</Label>
                <Input
                  id="estimatedHours"
                  type="number"
                  step="0.5"
                  {...registerTask("estimatedHours")}
                  placeholder="8"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="deadline">Deadline</Label>
              <Input
                id="deadline"
                type="date"
                {...registerTask("deadline")}
              />
            </div>

            {milestones.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="milestoneId">Milestone (Optional)</Label>
                <Select
                  value={selectedTaskMilestone}
                  onValueChange={(value) => setValueTask("milestoneId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select milestone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Milestone</SelectItem>
                    {milestones.filter((m: any) => m._id || m.id).map((milestone: any) => (
                      <SelectItem key={milestone._id || milestone.id} value={milestone._id || milestone.id}>
                        {milestone.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="assignedTo">
                Assign To <span className="text-red-500">*</span>
                <span className="text-xs text-muted-foreground ml-2">
                  (Select one or more team members)
                </span>
              </Label>
              <div className="border rounded-lg p-4 max-h-60 overflow-y-auto space-y-2">
                {project?.members && project.members.length > 0 ? (
                  project.members.map((member: any) => {
                    const memberId = member.userId?.toString() || member.user?._id?.toString() || member.user?.id?.toString();
                    if (!memberId) return null;

                    return (
                      <div key={memberId} className="flex items-center space-x-2">
                        <Checkbox
                          id={`assignee-${memberId}`}
                          checked={selectedAssignees.includes(memberId)}
                          onCheckedChange={(checked) => {
                            const newAssignees = checked
                              ? [...selectedAssignees, memberId]
                              : selectedAssignees.filter((id) => id !== memberId);
                            setSelectedAssignees(newAssignees);
                            setValueTask("assignedTo", newAssignees as any);
                          }}
                        />
                        <label
                          htmlFor={`assignee-${memberId}`}
                          className="flex-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span>{member.user?.fullName || "Unknown User"}</span>
                              <span className="text-muted-foreground ml-2">
                                ({member.user?.designation || member.user?.role || "No role"})
                              </span>
                            </div>
                            <Badge variant="outline">{member.user?.role || member.role || "Member"}</Badge>
                          </div>
                        </label>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No team members in project
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Selected: {selectedAssignees.length} member(s)
              </p>
              {taskErrors.assignedTo && (
                <p className="text-sm text-red-500">{taskErrors.assignedTo.message}</p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowTaskDialog(false);
                  resetTask();
                  setSelectedAssignees([]);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createTaskMutation.isPending}
                className="gap-2"
              >
                {createTaskMutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                Create Task
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Milestone Dialog */}
      <Dialog open={showMilestoneDialog} onOpenChange={setShowMilestoneDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Milestone</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitMilestone(onSubmitMilestone)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">
                Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                {...registerMilestone("title")}
                placeholder="Phase 1: Backend Development"
              />
              {milestoneErrors.title && (
                <p className="text-sm text-red-500">{milestoneErrors.title.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                {...registerMilestone("description")}
                placeholder="Description of milestone objectives"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
              <Input
                id="dueDate"
                type="date"
                {...registerMilestone("dueDate")}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowMilestoneDialog(false);
                  resetMilestone();
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMilestoneMutation.isPending}
                className="gap-2"
              >
                {createMilestoneMutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                Create Milestone
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full">
            <CardContent className="p-6 space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2 text-red-600 flex items-center gap-2">
                  <Trash2 className="w-5 h-5" />
                  Delete Project
                </h3>
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to delete <strong>{project.name}</strong>?
                  This will also delete all milestones, tasks, and related data.
                  This action cannot be undone.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDeleteConfirm(false)}
                  disabled={deleteMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="gap-2"
                >
                  {deleteMutation.isPending && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  Delete Project
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
