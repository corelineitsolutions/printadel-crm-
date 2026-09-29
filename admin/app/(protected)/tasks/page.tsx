"use client";

import { useState, useEffect } from "react";
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
  CheckSquare,
  Plus,
  Loader2,
  Play,
  Square,
  Clock,
  AlertCircle,
  TrendingUp,
  Users,
  Search,
  RotateCcw,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { taskAPI, projectAPI, employeeAPI, milestoneAPI } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import Link from "next/link";

const taskSchema = z.object({
  title: z.string().min(3, "Task title must be at least 3 characters"),
  description: z.string().optional(),
  projectId: z.string().optional(),
  milestoneId: z.string().optional(),
  assignedTo: z.array(z.string()).min(1, "At least one assignee is required"),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  estimatedHours: z.string().optional(),
  deadline: z.string().optional(),
});

type TaskFormData = z.infer<typeof taskSchema>;

export default function TasksPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTab, setSelectedTab] = useState<string>("active");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedEmployee, setSelectedEmployee] = useState<string>("all");
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>(user?.id ? [user.id] : []);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      priority: "MEDIUM",
      assignedTo: user?.id ? [user.id] : [],
      projectId: "none",
      milestoneId: "none",
    },
  });

  // Fetch tasks
  const { data: tasksData, isLoading } = useQuery({
    queryKey: ["tasks", selectedTab, searchTerm, selectedEmployee],
    queryFn: async () => {
      const params: any = {};

      if (selectedTab === "active") {
        params.status = "ACTIVE_ALL";
      } else if (selectedTab === "completed") {
        params.status = "COMPLETED";
      } else if (selectedTab === "my-tasks") {
        params.taskType = "my-tasks";
      } else if (selectedTab === "assigned") {
        params.taskType = "collaboration";
      } else if (selectedTab === "overall") {
        params.taskType = "overall";
      }

      if (selectedEmployee !== "all" && selectedTab !== "my-tasks") params.assignedTo = selectedEmployee;
      if (searchTerm) params.search = searchTerm;

      const response = await taskAPI.getAllTasks(params);
      return response.data;
    },
  });

  // Fetch my tasks
  const { data: myTasksData } = useQuery({
    queryKey: ["myTasks"],
    queryFn: async () => {
      const response = await taskAPI.getMyTasks();
      return response.data;
    },
  });

  // Fetch active timer
  const { data: activeTimerData } = useQuery({
    queryKey: ["activeTimer"],
    queryFn: async () => {
      const response = await taskAPI.getActiveTimer();
      return response.data;
    },
    refetchInterval: 5000, // Refetch every 5 seconds
  });

  // Fetch projects for dropdown
  const { data: projectsData } = useQuery({
    queryKey: ["projectsList"],
    queryFn: async () => {
      const response = await projectAPI.getAllProjects({ limit: 100 });
      return response.data;
    },
  });

  // Fetch employees for assignment
  const { data: employeesData } = useQuery({
    queryKey: ["employeesList"],
    queryFn: async () => {
      const response = await employeeAPI.getAllEmployees({ limit: 100 });
      return response.data;
    },
  });

  const selectedProjectId = watch("projectId");

  // Fetch milestones for selected project
  const { data: milestonesData } = useQuery({
    queryKey: ["milestonesList", selectedProjectId],
    queryFn: async () => {
      if (!selectedProjectId || selectedProjectId === "none") return { data: { milestones: [] } };
      const response = await milestoneAPI.getMilestones({ projectId: selectedProjectId });
      return response.data;
    },
    enabled: !!selectedProjectId && selectedProjectId !== "none",
  });

  const { data: statsData } = useQuery({
    queryKey: ["taskStats", user?.id],
    queryFn: async () => {
      const response = await taskAPI.getTaskStats(user?.id);
      return response.data;
    },
    enabled: !!user?.id,
  });

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: (data: TaskFormData) =>
      taskAPI.createTask({
        ...data,
        estimatedHours: data.estimatedHours ? parseFloat(data.estimatedHours) : undefined,
      }),
    onSuccess: () => {
      toast.success("Task created successfully!");
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["myTasks"] });
      queryClient.invalidateQueries({ queryKey: ["taskStats"] });
      setShowCreateDialog(false);
      setSelectedAssignees(user?.id ? [user.id] : []);
      reset();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to create task");
    },
  });

  // Update task status mutation
  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      taskAPI.updateTask(taskId, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["myTasks"] });
      queryClient.invalidateQueries({ queryKey: ["taskStats"] });
    },
  });

  // Start timer mutation
  const startTimerMutation = useMutation({
    mutationFn: (taskId: string) => taskAPI.startTimer(taskId),
    onSuccess: () => {
      toast.success("Timer started!");
      queryClient.invalidateQueries({ queryKey: ["activeTimer"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to start timer");
    },
  });

  // Stop timer mutation
  const stopTimerMutation = useMutation({
    mutationFn: (timerId: string) => taskAPI.stopTimer(timerId),
    onSuccess: () => {
      toast.success("Timer stopped!");
      queryClient.invalidateQueries({ queryKey: ["activeTimer"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to stop timer");
    },
  });

  const onSubmit = (data: TaskFormData) => {
    const payload = {
      ...data,
      projectId: data.projectId === "none" ? undefined : data.projectId,
      milestoneId: data.milestoneId === "none" ? undefined : data.milestoneId,
    };
    createTaskMutation.mutate(payload);
  };
  // Derived data:
  const tasksList = tasksData?.data?.tasks || [];
  const tasks = [...tasksList].sort((a: any, b: any) => {
    const statusOrder: any = {
      "IN_PROGRESS": 0,
      "TO_DO": 1,
      "UNDER_REVIEW": 2,
      "REJECTED": 3,
      "COMPLETED": 4
    };
    return (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
  });
  const milestones = milestonesData?.data?.milestones || [];
  const myTasks = myTasksData?.data || [];
  const activeTimer = activeTimerData?.data;
  const [ticker, setTicker] = useState(Date.now());

  useEffect(() => {
    let interval: any;
    if (activeTimer && !activeTimer.pauseStartTime) {
      interval = setInterval(() => {
        setTicker(Date.now());
      }, 1000);
    } else {
      setTicker(Date.now());
    }
    return () => clearInterval(interval);
  }, [activeTimer]);
  const allProjects = projectsData?.data?.projects || [];
  const allEmployees = employeesData?.data?.employees || [];
  const stats = statsData?.data || {};

  // Role-based filtering
  const isAdmin = user?.role === "ADMIN";
  const isManager = user?.role === "MANAGER";
  const isEmployee = user?.role === "EMPLOYEE";

  // Filter projects based on role
  const projects = isEmployee
    ? allProjects.filter((project: any) =>
      project.members?.some((member: any) =>
        (member.userId === user?.id || member.user?.id === user?.id || member.user?._id === user?.id)
      )
    )
    : allProjects;

  // Filter employees based on role
  const employees = isEmployee
    ? allEmployees.filter((emp: any) => (emp.id === user?.id || emp._id === user?.id))
    : allEmployees;

  const getPriorityColor = (priority: string) => {
    const colors: any = {
      LOW: "text-green-600 bg-green-100",
      MEDIUM: "text-yellow-600 bg-yellow-100",
      HIGH: "text-red-600 bg-red-100",
    };
    return colors[priority] || "";
  };

  const getStatusColor = (status: string) => {
    const colors: any = {
      TO_DO: "bg-gray-100 text-gray-800",
      IN_PROGRESS: "bg-blue-100 text-blue-800",
      UNDER_REVIEW: "bg-purple-100 text-purple-800",
      COMPLETED: "bg-green-100 text-green-800",
      REJECTED: "bg-red-100 text-red-800",
    };
    return colors[status] || "";
  };

  const getSourceBadge = (task: any) => {
    const creatorId = task.assignedBy?._id || task.assignedBy?.id || task.assignedBy;
    const isCreator = creatorId === user?.id;
    const assignedTo = Array.isArray(task.assignedTo) ? task.assignedTo : [task.assignedTo];
    const isAssignedToMe = assignedTo.some((a: any) => (a._id || a.id || a) === user?.id);
    const hasOthers = assignedTo.some((a: any) => (a._id || a.id || a) !== user?.id);

    if (isCreator) {
      if (isAssignedToMe && !hasOthers) {
        return (
          <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700">
            Self Created
          </Badge>
        );
      }
      return (
        <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
          Created by Me
        </Badge>
      );
    } else if (isAssignedToMe) {
      return (
        <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
          Assigned
        </Badge>
      );
    }
    return null;
  };

  const calculateTimerDuration = () => {
    if (!activeTimer) return "0:00:00";
    const startTime = new Date(activeTimer.startTime).getTime();
    const pauseDuration = activeTimer.pauseDuration || 0;
    const isPaused = !!activeTimer.pauseStartTime;
    const refTime = isPaused ? new Date(activeTimer.pauseStartTime).getTime() : ticker;

    const diff = Math.max(0, Math.floor((refTime - startTime - pauseDuration) / 1000));
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    const seconds = diff % 60;

    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6">
      {/* Page Header with Active Timer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <CheckSquare className="w-7 h-7 sm:w-8 sm:h-8" />
            Task Management
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Track tasks, manage priorities, and monitor progress
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {activeTimer && (
            <Card className="border-blue-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm font-medium">{activeTimer.task?.title}</p>
                    <p className="text-lg font-bold text-blue-600">
                      {calculateTimerDuration()}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      const timerId = activeTimer._id || activeTimer.id;
                      if (timerId) stopTimerMutation.mutate(timerId);
                    }}
                  >
                    <Square className="w-4 h-4 mr-2" />
                    Stop
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          <Button className="gap-2" onClick={() => setShowCreateDialog(true)}>
            <Plus className="w-4 h-4" />
            New Task
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Total</span>
              <CheckSquare className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-xl font-bold">{stats.totalTasks || 0}</div>
          </CardContent>
        </Card>


        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Assigned Tasks</span>
              <Users className="w-4 h-4 text-orange-600" />
            </div>
            <div className="text-xl font-bold text-orange-600">{stats.assignedTasks || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">To Do</span>
              <Clock className="w-4 h-4 text-gray-600" />
            </div>
            <div className="text-xl font-bold">{stats.todoTasks || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">In Progress</span>
              <TrendingUp className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-xl font-bold text-blue-600">
              {stats.inProgressTasks || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Completed</span>
              <CheckSquare className="w-4 h-4 text-green-600" />
            </div>
            <div className="text-xl font-bold text-green-600">
              {stats.completedTasks || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">High Prio</span>
              <AlertCircle className="w-4 h-4 text-red-600" />
            </div>
            <div className="text-xl font-bold text-red-600">
              {stats.highPriorityTasks || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Filter */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="my-tasks">My Tasks</TabsTrigger>
          <TabsTrigger value="assigned">Collaborations</TabsTrigger>
          {(isAdmin || isManager) && (
            <TabsTrigger value="overall">All Tasks</TabsTrigger>
          )}
        </TabsList>
      </Tabs>

      {/* Additional Filters */}
      <Card>
        <CardContent className="p-6 flex flex-wrap gap-4 items-end">
          {(isAdmin || isManager) && selectedTab !== "my-tasks" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Assigned To</label>
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger className="w-full md:w-64">
                  <SelectValue placeholder="All Employees" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {allEmployees.filter((emp: any) => emp._id || emp.id).map((emp: any) => (
                    <SelectItem key={emp._id || emp.id} value={emp._id || emp.id}>
                      {emp.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2 flex-1 min-w-[300px]">
            <label className="text-sm font-medium">Search Tasks</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={isManager ? "Search task, employee, or creator..." : "Search task or creator..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tasks List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : tasks.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <CheckSquare className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-xl font-semibold mb-2">No tasks found</h3>
            <p className="text-muted-foreground mb-4">Create your first task to get started</p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Task
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((task: any) => (
            <Card key={task._id || task.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Link href={`/tasks/${task._id || task.id}`}>
                        <h3 className="font-semibold text-lg hover:text-primary cursor-pointer">
                          {task.title}
                        </h3>
                      </Link>
                      <Badge className={getPriorityColor(task.priority)}>
                        {task.priority}
                      </Badge>
                      <Badge className={getStatusColor(task.status)}>
                        {task.status.replace("_", " ")}
                      </Badge>
                      {getSourceBadge(task)}
                    </div>

                    {task.description && (
                      <p className="text-sm text-muted-foreground mb-3">
                        {task.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      {task.project && (
                        <span>Project: {task.project.name}</span>
                      )}
                      {task.assignedBy && (task.assignedBy._id || task.assignedBy.id || task.assignedBy) !== user?.id && (
                        <span>Assigned by: {task.assignedBy.fullName || task.assignedBy}</span>
                      )}
                      {task.assignedTo && task.assignedTo.length > 0 && (
                        <span>
                          Assigned to: {Array.isArray(task.assignedTo)
                            ? task.assignedTo.map((a: any) => a.fullName || a).join(", ")
                            : task.assignedTo.fullName || task.assignedTo
                          }
                        </span>
                      )}
                      {task.deadline && (
                        <span>Due: {format(new Date(task.deadline), "MMM d")}</span>
                      )}
                      {task.actualHours && (
                        <span>{task.actualHours.toFixed(1)}h logged</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
                    {task.assignedTo && (
                      Array.isArray(task.assignedTo)
                        ? task.assignedTo.some((a: any) => (a.id || a._id || a) === user?.id)
                        : (task.assignedTo.id || task.assignedTo._id || task.assignedTo) === user?.id
                    ) && task.status !== "COMPLETED" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startTimerMutation.mutate(task._id || task.id)}
                          disabled={!!activeTimer || startTimerMutation.isPending}
                        >
                          <Play className="w-4 h-4 mr-1" />
                          Start
                        </Button>
                      )}
                    {(isAdmin || isManager) && task.status === "COMPLETED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-orange-500 text-orange-600 hover:bg-orange-50"
                        onClick={() => updateTaskMutation.mutate({ taskId: task._id || task.id, status: "IN_PROGRESS" })}
                        disabled={updateTaskMutation.isPending}
                      >
                        <RotateCcw className="w-4 h-4 mr-1" />
                        Re-open
                      </Button>
                    )}
                    <Link href={`/tasks/${task._id || task.id}`}>
                      <Button size="sm" variant="default">
                        View Task
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Task Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Task</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
                  value={watch("projectId")}
                  onValueChange={(value) => setValue("projectId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Project</SelectItem>
                    {projects.filter((p: any) => p._id || p.id).map((project: any) => (
                      <SelectItem key={project._id || project.id} value={project._id || project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="milestoneId">Project Milestone</Label>
                <Select
                  value={watch("milestoneId")}
                  onValueChange={(value) => setValue("milestoneId", value)}
                  disabled={!selectedProjectId || selectedProjectId === "none"}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select milestone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Milestone</SelectItem>
                    {milestones.map((milestone: any) => (
                      <SelectItem key={milestone._id || milestone.id} value={milestone._id || milestone.id}>
                        {milestone.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="assignedTo">
                  Assign To <span className="text-red-500">*</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {isEmployee
                      ? "(You can only assign tasks to yourself)"
                      : "(Select one or more team members)"}
                  </span>
                </Label>
                <div className="border rounded-lg p-4 max-h-60 overflow-y-auto space-y-2">
                  {employees && employees.length > 0 ? (
                    employees.map((emp: any) => (
                      <div key={emp.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`assignee-${emp.id}`}
                          checked={selectedAssignees.includes(emp.id)}
                          onCheckedChange={(checked) => {
                            const newAssignees = checked
                              ? [...selectedAssignees, emp.id]
                              : selectedAssignees.filter((id) => id !== emp.id);
                            setSelectedAssignees(newAssignees);
                            setValue("assignedTo", newAssignees as any);
                          }}
                        />
                        <label
                          htmlFor={`assignee-${emp.id}`}
                          className="flex-1 text-sm font-medium leading-none cursor-pointer"
                        >
                          <div className="flex items-center justify-between">
                            <span>{emp.fullName}</span>
                            <Badge variant="outline" className="ml-2">
                              {emp.designation || emp.role}
                            </Badge>
                          </div>
                        </label>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No employees found</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Selected: {selectedAssignees.length} member(s)
                </p>
                {errors.assignedTo && (
                  <p className="text-sm text-red-500">{errors.assignedTo.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={watch("priority")}
                  onValueChange={(value: any) => setValue("priority", value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>

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

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createTaskMutation.isPending}>
                {createTaskMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Task"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
