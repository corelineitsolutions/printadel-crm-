"use client";

import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { projectAPI, employeeAPI } from "@/lib/api";
import { toast } from "sonner";
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
  status: z.enum(["PLANNING", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"]),
});

type ProjectFormData = z.infer<typeof projectSchema>;

export default function EditProjectPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const projectId = params.id as string;
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

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

  const selectedStatus = watch("status");

  // Fetch project details
  const { data: projectData, isLoading: loadingProject } = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const response = await projectAPI.getProjectById(projectId);
      return response.data.data;
    },
  });

  // Fetch employees
  const { data: employeesData } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const response = await employeeAPI.getAllEmployees({ limit: 100 });
      return response.data.data;
    },
  });

  // Populate form when project data loads
  useEffect(() => {
    if (projectData) {
      reset({
        name: projectData.name,
        code: projectData.code,
        description: projectData.description || "",
        requirements: projectData.requirements || "",
        clientName: projectData.clientName || "",
        startDate: projectData.startDate
          ? format(new Date(projectData.startDate), "yyyy-MM-dd")
          : "",
        deadline: projectData.deadline
          ? format(new Date(projectData.deadline), "yyyy-MM-dd")
          : "",
        budget: projectData.budget?.toString() || "",
        status: projectData.status,
      });

      // Set selected members
      if (projectData.members) {
        setSelectedMembers(projectData.members.map((m: any) => m.userId));
      }
    }
  }, [projectData, reset]);

  // Update project mutation
  const updateProjectMutation = useMutation({
    mutationFn: (data: any) => projectAPI.updateProject(projectId, data),
    onSuccess: () => {
      toast.success("Project updated successfully!");
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      router.push(`/projects/${projectId}`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to update project");
    },
  });

  const onSubmit = (data: ProjectFormData) => {
    if (selectedMembers.length === 0) {
      toast.error("Please select at least one team member");
      return;
    }

    const payload = {
      ...data,
      budget: data.budget ? parseFloat(data.budget) : undefined,
      startDate: data.startDate || undefined,
      deadline: data.deadline || undefined,
      memberIds: selectedMembers,
    };
    updateProjectMutation.mutate(payload);
  };

  const toggleMember = (memberId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  if (loadingProject) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <Link href={`/projects/${projectId}`}>
          <Button variant="ghost" className="gap-2 mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Project
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Edit Project</h1>
        <p className="text-muted-foreground mt-1">
          Update project information - {projectData?.name}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">
                  Project Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  {...register("name")}
                  placeholder="CRM System Development"
                />
                {errors.name && (
                  <p className="text-sm text-red-500">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="code">
                  Project Code <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="code"
                  {...register("code")}
                  placeholder="CRM-001"
                  className="uppercase"
                />
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
                placeholder="Brief description of the project"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="requirements">Requirements</Label>
              <Textarea
                id="requirements"
                {...register("requirements")}
                placeholder="Project requirements and specifications"
                rows={5}
              />
            </div>
          </CardContent>
        </Card>

        {/* Project Details */}
        <Card>
          <CardHeader>
            <CardTitle>Project Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="clientName">Client Name</Label>
                <Input
                  id="clientName"
                  {...register("clientName")}
                  placeholder="Client or company name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="budget">Budget ($)</Label>
                <Input
                  id="budget"
                  type="number"
                  step="0.01"
                  {...register("budget")}
                  placeholder="50000.00"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  {...register("startDate")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="deadline">Deadline</Label>
                <Input
                  id="deadline"
                  type="date"
                  {...register("deadline")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">
                Status <span className="text-red-500">*</span>
              </Label>
              <Select
                value={selectedStatus}
                onValueChange={(value: any) => setValue("status", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PLANNING">Planning</SelectItem>
                  <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                  <SelectItem value="ON_HOLD">On Hold</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              {errors.status && (
                <p className="text-sm text-red-500">{errors.status.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Team Members */}
        <Card>
          <CardHeader>
            <CardTitle>Team Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>
                Assign Team Members * <span className="text-muted-foreground text-xs">(Select at least one)</span>
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
          </CardContent>
        </Card>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-4">
          <Link href={`/projects/${projectId}`}>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={updateProjectMutation.isPending}
            className="gap-2"
          >
            {updateProjectMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Update Project
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
