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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FolderKanban,
  Plus,
  Search,
  Loader2,
  Calendar,
  Users,
  TrendingUp,
  CheckCircle,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { projectAPI, employeeAPI } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";

const projectSchema = z.object({
  name: z.string().min(3, "Project name must be at least 3 characters"),
  code: z.string().min(2, "Code must be at least 2 characters").max(20),
  description: z.string().optional(),
  requirements: z.string().optional(),
  clientName: z.string().optional(),
  startDate: z.string().optional(),
  deadline: z.string().optional(),
  budget: z.string().optional(),
});

type ProjectFormData = z.infer<typeof projectSchema>;

interface EmployeeOption {
  id: string;
  fullName: string;
  email: string;
  designation?: string;
}

const generateProjectCode = () => {
  const letters = Array.from({ length: 3 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26))
  ).join("");
  const digits = Math.floor(100 + Math.random() * 900);
  return `${letters}-${digits}`;
};

export default function ProjectsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  const canCreateProject = user?.role === "ADMIN" || user?.role === "MANAGER";

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
  });

  // Fetch projects
  const { data: projectsData, isLoading } = useQuery({
    queryKey: ["projects", { search: searchTerm, status: statusFilter }],
    queryFn: async () => {
      const params: any = {};
      if (searchTerm) params.search = searchTerm;
      if (statusFilter !== "all") params.status = statusFilter;

      const response = await projectAPI.getAllProjects(params);
      return response.data;
    },
  });

  // Fetch stats
  const { data: statsData } = useQuery({
    queryKey: ["projectStats"],
    queryFn: async () => {
      const response = await projectAPI.getProjectStats();
      return response.data;
    },
  });

  // Fetch employees for member selection
  const { data: employeesData } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const response = await employeeAPI.getAllEmployees({ limit: 100 });
      return response.data.data;
    },
    enabled: showCreateDialog,
  });

  // Create project mutation
  const createProjectMutation = useMutation({
    mutationFn: (data: any) => projectAPI.createProject(data),
    onSuccess: () => {
      toast.success("Project created successfully!");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["projectStats"] });
      setShowCreateDialog(false);
      reset();
      setSelectedMembers([]);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to create project");
    },
  });

  const onSubmit = (data: ProjectFormData) => {
    if (selectedMembers.length === 0) {
      toast.error("Please select at least one team member");
      return;
    }

    createProjectMutation.mutate({
      ...data,
      budget: data.budget ? parseFloat(data.budget) : undefined,
      memberIds: selectedMembers,
    });
  };

  const toggleMember = (memberId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  const projects = projectsData?.data?.projects || [];
  const stats = statsData?.data || {};

  const getStatusBadge = (status: string) => {
    const statusStyles: any = {
      PLANNING: "bg-yellow-100 text-yellow-800",
      IN_PROGRESS: "bg-green-100 text-green-800",
      ON_HOLD: "bg-orange-100 text-orange-800",
      COMPLETED: "bg-blue-100 text-blue-800",
      CANCELLED: "bg-gray-100 text-gray-800",
    };

    return <Badge className={statusStyles[status] || ""}>{status.replace("_", " ")}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <FolderKanban className="w-7 h-7 sm:w-8 sm:h-8" />
            Project Management
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Manage projects, tasks, and milestones
          </p>
        </div>
        {canCreateProject && (
          <Button
            className="gap-2 self-start sm:self-auto"
            onClick={() => {
              setValue("code", generateProjectCode());
              setShowCreateDialog(true);
            }}
          >
            <Plus className="w-4 h-4" />
            New Project
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Total Projects</span>
              <FolderKanban className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-2xl font-bold">{stats.totalProjects || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Active</span>
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-2xl font-bold text-green-600">
              {stats.activeProjects || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Completed</span>
              <CheckCircle className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-blue-600">
              {stats.completedProjects || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">On Hold</span>
              <Calendar className="w-5 h-5 text-orange-600" />
            </div>
            <div className="text-2xl font-bold text-orange-600">
              {stats.onHoldProjects || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search projects by name or code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="PLANNING">Planning</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="ON_HOLD">On Hold</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Projects Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <FolderKanban className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-xl font-semibold mb-2">No projects found</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm || statusFilter !== "all"
                ? "Try adjusting your filters"
                : "Start by creating your first project"}
            </p>
            {canCreateProject && (
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Project
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project: any) => (
            <Link key={project._id || project.id} href={`/projects/${project._id || project.id}`}>
              <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg mb-2">{project.name}</CardTitle>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline">{project.code}</Badge>
                        <Badge variant="secondary" className="text-[10px] font-medium bg-purple-50 text-purple-700 border-purple-200">
                          {project.company || "Printadel"}
                        </Badge>
                      </div>
                    </div>
                    {getStatusBadge(project.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  {project.description && (
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {project.description}
                    </p>
                  )}

                  <div className="space-y-2">
                    {project.clientName && (
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">{project.clientName}</span>
                      </div>
                    )}
                    {project.deadline && (
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          Due: {format(new Date(project.deadline), "MMM d, yyyy")}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {project._count?.tasks || 0} tasks
                    </span>
                    <span className="text-muted-foreground">
                      {project.members?.length || 0} members
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Create Project Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Project Name *</Label>
                <Input id="name" {...register("name")} placeholder="My Awesome Project" />
                {errors.name && (
                  <p className="text-sm text-red-500">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="code">Project Code *</Label>
                <div className="flex gap-2">
                  <Input id="code" {...register("code")} placeholder="PRJ-123" />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Generate random code"
                    onClick={() => setValue("code", generateProjectCode())}
                  >
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
                {errors.code && (
                  <p className="text-sm text-red-500">{errors.code.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                {...register("description")}
                placeholder="Brief project description..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="clientName">Client Name</Label>
              <Input id="clientName" {...register("clientName")} placeholder="Client Inc." />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input id="startDate" type="date" {...register("startDate")} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="deadline">Deadline</Label>
                <Input id="deadline" type="date" {...register("deadline")} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="budget">Budget (₹)</Label>
                <Input id="budget" type="number" {...register("budget")} placeholder="10000" />
              </div>
            </div>

            {/* Team Members Selection */}
            <div className="space-y-2">
              <Label>
                Team Members * <span className="text-muted-foreground text-xs">(Select at least one)</span>
              </Label>
              <div className="border rounded-lg p-4 max-h-60 overflow-y-auto space-y-2">
                {employeesData?.employees?.length > 0 ? (
                  employeesData.employees.map((employee: any) => (
                    <div key={employee.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={employee.id}
                        checked={selectedMembers.includes(employee.id)}
                        onCheckedChange={() => toggleMember(employee.id)}
                      />
                      <label
                        htmlFor={employee.id}
                        className="flex-1 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <span>{employee.fullName}</span>
                            <span className="text-muted-foreground ml-2">
                              ({employee.designation || employee.role})
                            </span>
                          </div>
                          <Badge variant="outline">{employee.role}</Badge>
                        </div>
                      </label>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Loading employees...</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Selected: {selectedMembers.length} member(s)
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createProjectMutation.isPending}>
                {createProjectMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Project"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
