"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, User, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { employeeAPI } from "@/lib/api";
import { toast } from "sonner";

const employeeSchema = z.object({
  email: z.string().email("Invalid email address"),
  fullName: z.string().min(2, "Full name is required"),
  phoneNumber: z.string().optional(),
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]),
  employeeType: z.enum(["Full-time", "Part-time", "Contract"]).default("Full-time"),
  designation: z.string().optional(),
  department: z.string().optional(),
  managerId: z.string().optional(),
  monthlySalary: z.string().optional(),
  hourlyRate: z.string().optional(),
});

type EmployeeFormData = z.infer<typeof employeeSchema>;

export default function EditEmployeePage() {
  const router = useRouter();
  const params = useParams();
  const employeeId = params.id as string;
  const queryClient = useQueryClient();
  const [isActive, setIsActive] = useState(true);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
    reset,
  } = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
  });

  const selectedRole = watch("role");
  const selectedEmployeeType = watch("employeeType") || "Full-time";

  // Fetch employee data
  const { data: employeeData, isLoading: loadingEmployee } = useQuery({
    queryKey: ["employee", employeeId],
    queryFn: async () => {
      const response = await employeeAPI.getEmployeeById(employeeId);
      return response.data.data;
    },
  });

  // Populate form when employee data loads
  useEffect(() => {
    if (employeeData) {
      reset({
        email: employeeData.email || "",
        fullName: employeeData.fullName || "",
        phoneNumber: employeeData.phone || "",
        role: employeeData.role || "EMPLOYEE",
        employeeType: employeeData.employeeType || "Full-time",
        designation: employeeData.designation || "",
        department: employeeData.department || "none",
        managerId: employeeData.managerId || "none",
        monthlySalary: employeeData.monthlySalary != null ? employeeData.monthlySalary.toString() : "",
        hourlyRate: employeeData.hourlyRate != null ? employeeData.hourlyRate.toString() : "",
      });
      setIsActive(employeeData.isActive ?? true);
    }
  }, [employeeData, reset]);

  // Fetch managers for dropdown
  const { data: managersData } = useQuery({
    queryKey: ["managers"],
    queryFn: async () => {
      const response = await employeeAPI.getAllManagers();
      return response.data;
    },
  });

  // Fetch departments
  const { data: departmentsData } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const response = await employeeAPI.getAllDepartments();
      return response.data;
    },
  });

  const managers = managersData?.data || [];
  const departments = departmentsData?.data || [];

  // Update employee mutation
  const updateEmployeeMutation = useMutation({
    mutationFn: (data: any) => employeeAPI.updateEmployee(employeeId, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
      await queryClient.invalidateQueries({ queryKey: ["employee", employeeId] });
      await queryClient.invalidateQueries({ queryKey: ["managers"] });
      await queryClient.invalidateQueries({ queryKey: ["departments"] });
      toast.success("Employee updated successfully!");
      router.push("/employees");
      router.refresh();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to update employee");
    },
  });

  const onSubmit = (data: EmployeeFormData) => {
    const { hourlyRate, ...restData } = data;
    const salary = data.monthlySalary && data.monthlySalary.trim() !== ""
      ? parseFloat(data.monthlySalary)
      : null;

    const payload = {
      ...restData,
      fullName: data.fullName?.trim(),
      email: data.email?.trim().toLowerCase(),
      phoneNumber: data.phoneNumber?.trim() || null,
      designation: data.designation?.trim() || null,
      department: data.department === "none" || !data.department || data.department.trim() === "" ? null : data.department.trim(),
      monthlySalary: salary,
      isActive,
      managerId: data.managerId === "none" || !data.managerId || data.managerId.trim() === "" ? null : data.managerId,
    };
    updateEmployeeMutation.mutate(payload);
  };

  if (loadingEmployee) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Page Header */}
      <div>
        <Link href="/employees">
          <Button variant="ghost" className="gap-2 mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Employees
          </Button>
        </Link>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <User className="w-8 h-8" />
          Edit Employee
        </h1>
        <p className="text-muted-foreground mt-1">
          Update employee account details - {employeeData?.fullName}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Account Information */}
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email">
                  Email <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  {...register("email")}
                  placeholder="john.doe@company.com"
                />
                {errors.email && (
                  <p className="text-sm text-red-500">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Phone Number</Label>
                <Input
                  id="phoneNumber"
                  {...register("phoneNumber")}
                  placeholder="+1 234 567 8900"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="isActive"
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(!!checked)}
              />
              <Label htmlFor="isActive" className="text-sm font-normal cursor-pointer">
                Account is active (employee can login)
              </Label>
            </div>
          </CardContent>
        </Card>

        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">
                Full Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="fullName"
                {...register("fullName")}
                placeholder="John Doe"
              />
              {errors.fullName && (
                <p className="text-sm text-red-500">{errors.fullName.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Work Details */}
        <Card>
          <CardHeader>
            <CardTitle>Work Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="role">
                  Role <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={selectedRole}
                  onValueChange={(value: any) => setValue("role", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMPLOYEE">Employee</SelectItem>
                    <SelectItem value="MANAGER">Manager</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                  </SelectContent>
                </Select>
                {errors.role && (
                  <p className="text-sm text-red-500">{errors.role.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="designation">Designation</Label>
                <Input
                  id="designation"
                  {...register("designation")}
                  placeholder="e.g. Master Press Operator"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="employeeType">
                  Employee Type <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={selectedEmployeeType}
                  onValueChange={(value: any) => setValue("employeeType", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Full-time">Full-time (Fixed Salary & Shift)</SelectItem>
                    <SelectItem value="Part-time">Part-time (Hourly Pay Basis)</SelectItem>
                    <SelectItem value="Contract">Contract (Fixed Contract / Project)</SelectItem>
                  </SelectContent>
                </Select>
                {errors.employeeType && (
                  <p className="text-sm text-red-500">{errors.employeeType.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Select
                  value={watch("department") || "none"}
                  onValueChange={(value) => setValue("department", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Department</SelectItem>
                    {Array.from(new Set([...departments,"Marketing", "Sales", "HR"])).filter(d => !!d).map((dept: string) => (
                      <SelectItem key={dept} value={dept}>
                        {dept}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="monthlySalary">Monthly Salary (₹)</Label>
                <Input
                  id="monthlySalary"
                  type="number"
                  step="0.01"
                  {...register("monthlySalary")}
                  placeholder="25000"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hourlyRate">Calculated Hourly Rate (₹)</Label>
                <Input
                  id="hourlyRate"
                  type="number"
                  disabled
                  value={watch("monthlySalary") ? (parseFloat(watch("monthlySalary") || "0") / 270).toFixed(2) : ""}
                  placeholder="Auto-calculated (270 hrs)"
                />
              </div>
            </div>

            {selectedRole !== "ADMIN" && (
              <div className="space-y-2">
                <Label htmlFor="managerId">Reporting Manager</Label>
                <Select
                  value={watch("managerId") || "none"}
                  onValueChange={(value) => setValue("managerId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select manager" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Manager</SelectItem>
                    {managers
                      .filter((m: any) => m.id !== employeeId && (m.id || m._id))
                      .map((manager: any) => (
                        <SelectItem key={manager.id || manager._id} value={manager.id || manager._id}>
                          {manager.fullName} - {manager.designation || manager.role}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-4">
          <Link href="/employees">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={updateEmployeeMutation.isPending}
            className="gap-2"
          >
            {updateEmployeeMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Update Employee
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
