"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  Search,
  Plus,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  UserCheck,
  Loader2,
  Filter,
  Edit,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { employeeAPI } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";

export default function EmployeesPage() {
  const { user } = useAuthStore();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [employeeTypeFilter, setEmployeeTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const limit = 50;

  const isAdmin = user?.role === "ADMIN";

  // Fetch employees
  const { data: employeesData, isLoading } = useQuery({
    queryKey: ["employees", { searchTerm, departmentFilter, roleFilter, employeeTypeFilter, page }],
    queryFn: async () => {
      const params: any = { page, limit };
      if (searchTerm) params.search = searchTerm;
      if (departmentFilter !== "all") params.department = departmentFilter;
      if (roleFilter !== "all") params.role = roleFilter;
      if (employeeTypeFilter !== "all") params.employeeType = employeeTypeFilter;

      const response = await employeeAPI.getAllEmployees(params);
      return response.data;
    },
  });

  // Fetch departments for filter
  const { data: departmentsData } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const response = await employeeAPI.getAllDepartments();
      return response.data;
    },
  });

  // Toggle employee status mutation
  const toggleStatusMutation = useMutation({
    mutationFn: (employeeId: string) => employeeAPI.toggleEmployeeStatus(employeeId),
    onSuccess: (response) => {
      const isActive = response.data.data.isActive;
      toast.success(`Employee ${isActive ? "activated" : "deactivated"} successfully!`);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to update employee status");
    },
  });

  // Delete employee mutation (hard delete)
  const deleteMutation = useMutation({
    mutationFn: (employeeId: string) => employeeAPI.deleteEmployee(employeeId),
    onSuccess: () => {
      toast.success("Employee permanently deleted from system!");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setDeleteConfirm(null);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to delete employee");
    },
  });

  const employees = employeesData?.data?.employees || [];
  const pagination = employeesData?.data?.pagination || {};
  const stats = employeesData?.data?.stats || {};
  const departments = departmentsData?.data || [];

  const canManageEmployees = user?.role === "ADMIN" || user?.role === "MANAGER";

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Users className="w-7 h-7 sm:w-8 sm:h-8" />
            Employee Management
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Manage your team members and their information
          </p>
        </div>
        {canManageEmployees && (
          <Link href="/employees/new" className="self-start sm:self-auto">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Add Employee
            </Button>
          </Link>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Employees</p>
                <h3 className="text-2xl font-bold mt-1">{stats.total || 0}</h3>
              </div>
              <Users className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <h3 className="text-2xl font-bold mt-1 text-green-600">
                  {stats.active || 0}
                </h3>
              </div>
              <UserCheck className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Managers</p>
                <h3 className="text-2xl font-bold mt-1 text-purple-600">
                  {stats.managers || 0}
                </h3>
              </div>
              <Briefcase className="w-8 h-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Departments</p>
                <h3 className="text-2xl font-bold mt-1 text-orange-600">
                  {departments.length || 0}
                </h3>
              </div>
              <MapPin className="w-8 h-8 text-orange-600" />
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
                placeholder="Search by name, email, or employee ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.filter((dept: string) => !!dept).map((dept: string) => (
                  <SelectItem key={dept} value={dept}>
                    {dept}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full md:w-36">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="MANAGER">Manager</SelectItem>
                <SelectItem value="EMPLOYEE">Employee</SelectItem>
              </SelectContent>
            </Select>

            <Select value={employeeTypeFilter} onValueChange={setEmployeeTypeFilter}>
              <SelectTrigger className="w-full md:w-44">
                <SelectValue placeholder="Employee Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="Full-time">Full-time</SelectItem>
                <SelectItem value="Part-time">Part-time</SelectItem>
                <SelectItem value="Contract">Contract</SelectItem>
              </SelectContent>
            </Select>

            {(searchTerm || departmentFilter !== "all" || roleFilter !== "all" || employeeTypeFilter !== "all") && (
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm("");
                  setDepartmentFilter("all");
                  setRoleFilter("all");
                  setEmployeeTypeFilter("all");
                }}
                className="gap-2"
              >
                <Filter className="w-4 h-4" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Employee Cards Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : employees.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-xl font-semibold mb-2">No employees found</h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm || departmentFilter !== "all" || roleFilter !== "all"
                ? "Try adjusting your filters"
                : "Start by adding your first employee"}
            </p>
            {canManageEmployees && (
              <Link href="/employees/new">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Employee
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Employee</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Designation / Department</th>
                    <th className="px-4 py-3 font-semibold">Office</th>
                    <th className="px-4 py-3 font-semibold">Phone</th>
                    <th className="px-4 py-3 font-semibold">Manager</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    {canManageEmployees && (
                      <th className="px-4 py-3 font-semibold text-right">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {employees.map((employee: any) => {
                    const phone = employee.phone || employee.phoneNumber;
                    return (
                      <tr key={employee.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 min-w-[220px]">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="text-sm font-semibold text-primary">
                                {employee.fullName?.charAt(0) || "?"}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold truncate">{employee.fullName}</div>
                              <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {employee.email}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1">
                            <Badge
                              variant={
                                employee.role === "ADMIN"
                                  ? "destructive"
                                  : employee.role === "MANAGER"
                                    ? "default"
                                    : "secondary"
                              }
                            >
                              {employee.roleName || employee.role}
                            </Badge>
                            {employee.employeeType && (
                              <Badge
                                variant="outline"
                                className={`text-[10px] font-semibold ${
                                  employee.employeeType === "Full-time"
                                    ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                    : employee.employeeType === "Part-time"
                                    ? "bg-purple-50 text-purple-700 border-purple-200"
                                    : "bg-amber-50 text-amber-700 border-amber-200"
                                }`}
                              >
                                {employee.employeeType}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 min-w-[160px]">
                          <div className="flex items-center gap-1.5">
                            <Briefcase className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>{employee.designation || "-"}</span>
                          </div>
                          {employee.department && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {employee.department}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {employee.office?.name ? (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                              {employee.office.name}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {phone ? (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                              {phone}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {employee.manager?.fullName || (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${
                              employee.isActive
                                ? "bg-green-100 text-green-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {employee.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        {canManageEmployees && (
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5 text-xs"
                                onClick={() => router.push(`/employees/edit/${employee.id}`)}
                              >
                                <Edit className="w-3.5 h-3.5" />
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title={employee.isActive ? "Deactivate" : "Activate"}
                                onClick={() => toggleStatusMutation.mutate(employee.id)}
                                disabled={toggleStatusMutation.isPending}
                              >
                                {employee.isActive ? (
                                  <ToggleRight className="w-4 h-4 text-green-600" />
                                ) : (
                                  <ToggleLeft className="w-4 h-4 text-muted-foreground" />
                                )}
                              </Button>
                              {isAdmin && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                                  title="Delete"
                                  onClick={() => setDeleteConfirm(employee.id)}
                                  disabled={deleteMutation.isPending}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * limit + 1} to{" "}
                {Math.min(page * limit, pagination.total || 0)} of{" "}
                {pagination.total || 0} employees
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= (pagination.totalPages || 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-md w-full">
            <CardContent className="p-6 space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2 text-red-600 flex items-center gap-2">
                  <Trash2 className="w-5 h-5" />
                  Permanent Delete Warning
                </h3>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="font-semibold text-foreground">
                    ⚠️ This action cannot be undone!
                  </p>
                  <p>
                    This will <strong>permanently delete</strong> the employee and all their data:
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Attendance records</li>
                    <li>Leave applications</li>
                    <li>Task assignments & comments</li>
                    <li>Payroll history</li>
                    <li>All notifications</li>
                  </ul>
                  <p className="text-amber-600 font-medium mt-3">
                    💡 Tip: Use "Deactivate" instead to temporarily disable access while preserving data.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDeleteConfirm(null)}
                  disabled={deleteMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteMutation.mutate(deleteConfirm)}
                  disabled={deleteMutation.isPending}
                  className="gap-2"
                >
                  {deleteMutation.isPending && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  Permanently Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
