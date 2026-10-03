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
import { ArrowLeft, User, Loader2, Save, KeyRound, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { employeeAPI, officeAPI } from "@/lib/api";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";

type BaseRole = "ADMIN" | "MANAGER" | "EMPLOYEE";

interface CustomRole {
  _id?: string;
  id?: string;
  name: string;
  baseRole: BaseRole;
}

const CUSTOM_ROLE_PREFIX = "custom:";
const EMPLOYEE_TYPES = ["Full-time", "Part-time", "Contract"] as const;

const employeeSchema = z.object({
  email: z.string().email("Invalid email address"),
  fullName: z.string().min(2, "Full name is required"),
  phoneNumber: z.string().optional(),
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]),
  roleName: z.string().optional(),
  employeeType: z.preprocess(
    (v) => (typeof v === "string" && v !== "" ? v : "Full-time"),
    z.enum(EMPLOYEE_TYPES)
  ),
  designation: z.string().optional(),
  department: z.string().optional(),
  managerId: z.string().optional(),
  officeId: z.string().optional(),
  monthlySalary: z.string().optional(),
  hourlyRate: z.string().optional(),
});

type EmployeeFormData = z.infer<typeof employeeSchema>;

export default function EditEmployeePage() {
  const router = useRouter();
  const params = useParams();
  const employeeId = params.id as string;
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.role === "ADMIN";
  const [isActive, setIsActive] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
  const selectedRoleName = watch("roleName");
  const selectedEmployeeType = watch("employeeType") || "Full-time";
  const roleSelectValue = selectedRoleName ? `${CUSTOM_ROLE_PREFIX}${selectedRoleName}` : selectedRole;

  const { data: customRolesData } = useQuery({
    queryKey: ["customRoles"],
    queryFn: async () => {
      const response = await employeeAPI.getAllCustomRoles();
      return response.data;
    },
  });
  const customRoles: CustomRole[] = customRolesData?.data || [];

  const handleRoleChange = (value: string) => {
    if (!value) return;
    if (value.startsWith(CUSTOM_ROLE_PREFIX)) {
      const name = value.slice(CUSTOM_ROLE_PREFIX.length);
      const customRole = customRoles.find((r) => r.name === name);
      if (!customRole) return;
      setValue("role", customRole.baseRole);
      setValue("roleName", customRole.name);
    } else {
      setValue("role", value as BaseRole);
      setValue("roleName", "");
    }
  };

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
        roleName: employeeData.roleName || "",
        employeeType: EMPLOYEE_TYPES.includes(employeeData.employeeType)
          ? employeeData.employeeType
          : "Full-time",
        designation: employeeData.designation || "",
        department: employeeData.department || "none",
        managerId: employeeData.managerId || "none",
        officeId: employeeData.officeId ? String(employeeData.officeId) : "none",
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

  const { data: officesData } = useQuery({
    queryKey: ["officesActive"],
    queryFn: async () => {
      const response = await officeAPI.getOffices({ activeOnly: true });
      return response.data;
    },
  });

  const managers = managersData?.data || [];
  const departments = departmentsData?.data || [];
  const offices: any[] = Array.isArray(officesData?.data) ? officesData.data : [];
  const assignedOffice = employeeData?.office;
  const officeOptions =
    assignedOffice && !offices.some((o) => String(o._id || o.id) === String(assignedOffice._id || assignedOffice.id))
      ? [assignedOffice, ...offices]
      : offices;

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
    if (newPassword || confirmPassword) {
      if (newPassword.length < 6) {
        toast.error("New password must be at least 6 characters");
        return;
      }
      if (newPassword !== confirmPassword) {
        toast.error("New password and confirm password do not match");
        return;
      }
    }

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
      roleName: data.roleName || null,
      managerId: data.managerId === "none" || !data.managerId || data.managerId.trim() === "" ? null : data.managerId,
      officeId: data.officeId === "none" || !data.officeId ? null : data.officeId,
      ...(isAdmin && newPassword ? { password: newPassword } : {}),
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

        {/* Password */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5" />
              Password
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Current Password</Label>
              <Input value="••••••••" disabled readOnly />
              <p className="text-xs text-muted-foreground">
                Passwords are stored encrypted, so the current password cannot be shown to anyone
                (including admins). Set a new password below and share it with the employee.
              </p>
            </div>

            {isAdmin ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Leave blank to keep current password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                  />
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-sm text-red-500">Passwords do not match</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Only an admin can change another employee&apos;s password.
              </p>
            )}
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
                  value={roleSelectValue}
                  onValueChange={handleRoleChange}
                  disabled={!isAdmin}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EMPLOYEE">Employee</SelectItem>
                    <SelectItem value="MANAGER">Manager</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    {customRoles.map((role) => (
                      <SelectItem key={role.name} value={`${CUSTOM_ROLE_PREFIX}${role.name}`}>
                        {role.name}
                        {role.baseRole === "ADMIN" ? " (full admin access)" : ""}
                      </SelectItem>
                    ))}
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
                  onValueChange={(value: any) => value && setValue("employeeType", value)}
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
                  onValueChange={(value) => value && setValue("department", value)}
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
                  onValueChange={(value) => value && setValue("managerId", value)}
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

            <div className="space-y-2">
              <Label htmlFor="officeId">Office (punch in/out location)</Label>
              <Select
                value={watch("officeId") || "none"}
                onValueChange={(value) => value && setValue("officeId", value)}
              >
                <SelectTrigger id="officeId">
                  <SelectValue placeholder="Select office" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No office (use default location rules)</SelectItem>
                  {officeOptions.map((office: any) => {
                    const id = String(office._id || office.id);
                    return (
                      <SelectItem key={id} value={id}>
                        {office.name} ({office.radiusMeters ?? 100} m)
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The employee must be within the office radius to punch in and punch out.
              </p>
            </div>
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
