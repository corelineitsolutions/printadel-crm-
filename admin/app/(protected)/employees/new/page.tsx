"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, User, Loader2, Save, Plus } from "lucide-react";
import Link from "next/link";
import { employeeAPI, officeAPI } from "@/lib/api";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { AddOptionDialog } from "@/components/employees/add-option-dialog";
import { DocumentUpload } from "@/components/employees/document-upload";

type BaseRole = "ADMIN" | "MANAGER" | "EMPLOYEE";

interface CustomRole {
  _id?: string;
  id?: string;
  name: string;
  baseRole: BaseRole;
}

const CUSTOM_ROLE_PREFIX = "custom:";

const BASE_ROLE_LABELS: Record<BaseRole, string> = {
  EMPLOYEE: "Employee",
  MANAGER: "Manager",
  ADMIN: "Admin",
};

const employeeSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  fullName: z.string().min(2, "Full name is required"),
  phoneNumber: z.string().optional(),
  address: z.string().optional(),
  role: z.enum(["ADMIN", "MANAGER", "EMPLOYEE"]),
  roleName: z.string().optional(),
  employeeType: z.preprocess(
    (v) => (typeof v === "string" && v !== "" ? v : "Full-time"),
    z.enum(["Full-time", "Part-time", "Contract"])
  ),
  designation: z.string().optional(),
  department: z.string().optional(),
  managerId: z.string().optional(),
  officeId: z.string().optional(),
  monthlySalary: z.string().optional(),
  hourlyRate: z.string().optional(),
  allowWorkFromHome: z.boolean().default(false),
});

type EmployeeFormData = z.infer<typeof employeeSchema>;

export default function NewEmployeePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [allowWorkFromHome, setAllowWorkFromHome] = useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [newRoleBase, setNewRoleBase] = useState<BaseRole>("EMPLOYEE");
  const [departmentDialogOpen, setDepartmentDialogOpen] = useState(false);
  const [panCardKey, setPanCardKey] = useState<string | null>(null);
  const [aadhaarCardKey, setAadhaarCardKey] = useState<string | null>(null);
  const [uploadingCount, setUploadingCount] = useState(0);

  const trackUploading = (uploading: boolean) =>
    setUploadingCount((count) => Math.max(0, count + (uploading ? 1 : -1)));

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      role: "EMPLOYEE",
      employeeType: "Full-time",
      allowWorkFromHome: false,
    },
  });

  const selectedRole = watch("role");
  const selectedRoleName = watch("roleName");
  const selectedDepartment = watch("department");
  const selectedEmployeeType = watch("employeeType");
  const roleSelectValue = selectedRoleName ? `${CUSTOM_ROLE_PREFIX}${selectedRoleName}` : selectedRole;

  // Fetch custom roles
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

  const createRoleMutation = useMutation({
    mutationFn: (name: string) => employeeAPI.createCustomRole({ name, baseRole: newRoleBase }),
    onSuccess: async (response) => {
      const role: CustomRole = response.data.data;
      await queryClient.invalidateQueries({ queryKey: ["customRoles"] });
      setValue("role", role.baseRole);
      setValue("roleName", role.name);
      setRoleDialogOpen(false);
      toast.success(`Role "${role.name}" added`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to add role");
    },
  });

  const createDepartmentMutation = useMutation({
    mutationFn: (name: string) => employeeAPI.createDepartment(name),
    onSuccess: async (response) => {
      const name: string = response.data.data.name;
      await queryClient.invalidateQueries({ queryKey: ["departments"] });
      setValue("department", name);
      setDepartmentDialogOpen(false);
      toast.success(`Department "${name}" added`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to add department");
    },
  });

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

  // Create employee mutation
  const createEmployeeMutation = useMutation({
    mutationFn: (data: EmployeeFormData) => {
      const { hourlyRate, ...restData } = data;
      const salary = data.monthlySalary && data.monthlySalary.trim() !== "" ? parseFloat(data.monthlySalary) : null;
      const payload = {
        ...restData,
        monthlySalary: salary,
        roleName: data.roleName || null,
        address: data.address?.trim() || null,
        managerId: data.managerId === "none" || !data.managerId ? null : data.managerId,
        department: data.department === "none" || !data.department ? null : data.department,
        officeId: data.officeId === "none" || !data.officeId ? null : data.officeId,
        allowWorkFromHome,
        panCardKey,
        aadhaarCardKey,
      };
      return employeeAPI.createEmployee(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
      await queryClient.invalidateQueries({ queryKey: ["managers"] });
      await queryClient.invalidateQueries({ queryKey: ["departments"] });
      toast.success("Employee created successfully!");
      router.push("/employees");
      router.refresh();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to create employee");
    },
  });

  const onSubmit = (data: EmployeeFormData) => {
    createEmployeeMutation.mutate(data);
  };

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
          Add New Employee
        </h1>
        <p className="text-muted-foreground mt-1">
          Create a new employee account with all required details
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
                <Label htmlFor="username">
                  Username <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="username"
                  {...register("username")}
                  placeholder="john.doe"
                />
                {errors.username && (
                  <p className="text-sm text-red-500">{errors.username.message}</p>
                )}
              </div>

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
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">
                Password <span className="text-red-500">*</span>
              </Label>
              <Input
                id="password"
                type="password"
                {...register("password")}
                placeholder="Minimum 6 characters"
              />
              {errors.password && (
                <p className="text-sm text-red-500">{errors.password.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
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

              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Phone Number</Label>
                <Input
                  id="phoneNumber"
                  {...register("phoneNumber")}
                  placeholder="+1 234 567 8900"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                {...register("address")}
                placeholder="House / Flat, Street, City, State, PIN"
                rows={3}
              />
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
                <div className="flex gap-2">
                  <Select value={roleSelectValue} onValueChange={handleRoleChange}>
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
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    title="Add role"
                    onClick={() => {
                      setNewRoleBase("EMPLOYEE");
                      setRoleDialogOpen(true);
                    }}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
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
                <div className="flex gap-2">
                  <Select
                    value={selectedDepartment || ""}
                    onValueChange={(value) => value && setValue("department", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from(new Set([...departments, "Marketing", "Sales", "HR"])).filter(d => !!d).map((dept: string) => (
                        <SelectItem key={dept} value={dept}>
                          {dept}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    title="Add department"
                    onClick={() => setDepartmentDialogOpen(true)}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
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
                  onValueChange={(value) => value && setValue("managerId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select manager" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Manager</SelectItem>
                    {managers.filter((m: any) => m.id || m._id).map((manager: any) => (
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
                  {offices.map((office) => {
                    const id = office._id || office.id;
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
                {offices.length === 0 && user?.role === "ADMIN" && (
                  <>
                    {" "}
                    <Link href="/offices" className="text-indigo-600 hover:underline">
                      Add an office
                    </Link>
                  </>
                )}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <DocumentUpload
                id="panCard"
                label="PAN Card"
                documentType="pan-card"
                onChange={setPanCardKey}
                onUploadingChange={trackUploading}
              />
              <DocumentUpload
                id="aadhaarCard"
                label="Aadhaar Card"
                documentType="aadhaar-card"
                onChange={setAadhaarCardKey}
                onUploadingChange={trackUploading}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="allowWorkFromHome"
                checked={allowWorkFromHome}
                onCheckedChange={(checked) => setAllowWorkFromHome(!!checked)}
              />
              <Label
                htmlFor="allowWorkFromHome"
                className="text-sm font-normal cursor-pointer"
              >
                Allow Work From Home (bypass geofence restrictions)
              </Label>
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
            disabled={createEmployeeMutation.isPending || uploadingCount > 0}
            className="gap-2"
          >
            {createEmployeeMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Create Employee
              </>
            )}
          </Button>
        </div>
      </form>

      <AddOptionDialog
        open={roleDialogOpen}
        onOpenChange={setRoleDialogOpen}
        title="Add Role"
        label="Role name"
        placeholder="e.g. Supervisor"
        isSaving={createRoleMutation.isPending}
        onSave={(name) => createRoleMutation.mutate(name)}
      >
        <div className="space-y-2">
          <Label>Access level</Label>
          <Select value={newRoleBase} onValueChange={(value) => setNewRoleBase(value as BaseRole)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(BASE_ROLE_LABELS) as BaseRole[])
                .filter((role) => role !== "ADMIN" || user?.role === "ADMIN")
                .map((role) => (
                  <SelectItem key={role} value={role}>
                    {BASE_ROLE_LABELS[role]}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Employees with this role get the same permissions as this access level.
          </p>
        </div>
      </AddOptionDialog>

      <AddOptionDialog
        open={departmentDialogOpen}
        onOpenChange={setDepartmentDialogOpen}
        title="Add Department"
        label="Department name"
        placeholder="e.g. Quality Control"
        isSaving={createDepartmentMutation.isPending}
        onSave={(name) => createDepartmentMutation.mutate(name)}
      />
    </div>
  );
}
