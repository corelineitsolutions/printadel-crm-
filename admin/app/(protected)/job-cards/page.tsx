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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Printer,
  Plus,
  Loader2,
  Clock,
  AlertCircle,
  TrendingUp,
  Users,
  Search,
  CheckCircle2,
  Package,
  Layers,
  Sparkles,
  Truck,
  Eye,
  ArrowRight,
  Calendar,
  FileText,
  User,
  Hash,
  Phone,
  Mail,
  MoreVertical,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { jobCardAPI, projectAPI, employeeAPI } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

const jobCardSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  orderNumber: z.string().optional(),
  clientName: z.string().min(2, "Client name is required"),
  clientPhone: z.string().optional(),
  clientEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  description: z.string().optional(),
  projectId: z.string().optional(),
  paperStock: z.string().optional(),
  size: z.string().optional(),
  quantity: z.string().min(1, "Quantity is required"),
  finish: z.string().optional(),
  specialInstructions: z.string().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  estimatedHours: z.string().optional(),
  targetDeliveryDate: z.string().optional(),
  assignedTo: z.array(z.string()).min(1, "At least one assignee is required"),
});

type JobCardFormData = z.infer<typeof jobCardSchema>;

const STATUS_CONFIG: Record<
  string,
  { label: string; badgeClass: string; icon: any }
> = {
  PENDING: {
    label: "Pending",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-300",
    icon: Clock,
  },
  IN_PROGRESS: {
    label: "In Progress",
    badgeClass: "bg-blue-100 text-blue-800 border-blue-300",
    icon: TrendingUp,
  },
  PRINTING: {
    label: "Printing",
    badgeClass: "bg-purple-100 text-purple-800 border-purple-300",
    icon: Printer,
  },
  QUALITY_CHECK: {
    label: "Quality Check",
    badgeClass: "bg-cyan-100 text-cyan-800 border-cyan-300",
    icon: Layers,
  },
  READY_FOR_DELIVERY: {
    label: "Ready for Delivery",
    badgeClass: "bg-indigo-100 text-indigo-800 border-indigo-300",
    icon: Package,
  },
  COMPLETED: {
    label: "Completed",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300",
    icon: CheckCircle2,
  },
  CANCELLED: {
    label: "Cancelled",
    badgeClass: "bg-rose-100 text-rose-800 border-rose-300",
    icon: AlertCircle,
  },
};

const PRIORITY_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  LOW: { label: "Low", badgeClass: "bg-slate-100 text-slate-700" },
  MEDIUM: { label: "Medium", badgeClass: "bg-blue-100 text-blue-700" },
  HIGH: { label: "High", badgeClass: "bg-amber-100 text-amber-800 font-semibold" },
  URGENT: { label: "Urgent", badgeClass: "bg-red-100 text-red-800 font-bold animate-pulse" },
};

export default function JobCardsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTab, setSelectedTab] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedAssigneeFilter, setSelectedAssigneeFilter] = useState<string>("all");
  const [viewingJobCard, setViewingJobCard] = useState<any | null>(null);

  // Status transition state
  const [statusDialogCard, setStatusDialogCard] = useState<any | null>(null);
  const [nextStatus, setNextStatus] = useState<string>("");
  const [statusNote, setStatusNote] = useState<string>("");

  const isAdmin = user?.role === "ADMIN";
  const isManager = user?.role === "MANAGER";
  const isPrivileged = isAdmin || isManager;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<JobCardFormData>({
    resolver: zodResolver(jobCardSchema),
    defaultValues: {
      priority: "MEDIUM",
      quantity: "500",
      assignedTo: user?.id ? [user.id] : [],
      projectId: "none",
    },
  });

  const selectedAssignees = watch("assignedTo") || [];

  // Fetch job cards
  const { data: jobCardsData, isLoading } = useQuery({
    queryKey: ["jobCards", selectedTab, searchTerm, selectedAssigneeFilter],
    queryFn: async () => {
      const params: any = {};
      if (selectedTab !== "all") {
        params.status = selectedTab;
      }
      if (selectedAssigneeFilter !== "all") {
        params.assignedTo = selectedAssigneeFilter;
      }
      if (searchTerm) {
        params.search = searchTerm;
      }
      const res = await jobCardAPI.getAllJobCards(params);
      return res.data;
    },
  });

  // Fetch stats
  const { data: statsData } = useQuery({
    queryKey: ["jobCardStats"],
    queryFn: async () => {
      const res = await jobCardAPI.getJobCardStats();
      return res.data;
    },
  });

  // Fetch projects
  const { data: projectsData } = useQuery({
    queryKey: ["projectsList"],
    queryFn: async () => {
      const res = await projectAPI.getAllProjects({ limit: 100 });
      return res.data;
    },
  });

  // Fetch employees
  const { data: employeesData } = useQuery({
    queryKey: ["employeesList"],
    queryFn: async () => {
      const res = await employeeAPI.getAllEmployees({ limit: 100 });
      return res.data;
    },
  });

  const projects = projectsData?.data?.projects || [];
  const employees = employeesData?.data?.employees || [];
  const jobCards = Array.isArray(jobCardsData?.data?.jobCards)
    ? jobCardsData.data.jobCards
    : [];
  const stats = statsData?.data || {};

  // Create mutation
  const createJobCardMutation = useMutation({
    mutationFn: (data: JobCardFormData) => {
      const payload: any = {
        ...data,
        quantity: parseInt(data.quantity, 10) || 1,
        estimatedHours: data.estimatedHours ? parseFloat(data.estimatedHours) : undefined,
        targetDeliveryDate: data.targetDeliveryDate || undefined,
        projectId: data.projectId === "none" ? undefined : data.projectId,
      };
      return jobCardAPI.createJobCard(payload);
    },
    onSuccess: () => {
      toast.success("Job Card created successfully!");
      queryClient.invalidateQueries({ queryKey: ["jobCards"] });
      queryClient.invalidateQueries({ queryKey: ["jobCardStats"] });
      setShowCreateDialog(false);
      reset();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Failed to create Job Card");
    },
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: string; note?: string }) =>
      jobCardAPI.updateJobCardStatus(id, status, note),
    onSuccess: () => {
      toast.success("Job Card status updated!");
      queryClient.invalidateQueries({ queryKey: ["jobCards"] });
      queryClient.invalidateQueries({ queryKey: ["jobCardStats"] });
      setStatusDialogCard(null);
      setNextStatus("");
      setStatusNote("");
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Failed to update status");
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => jobCardAPI.deleteJobCard(id),
    onSuccess: () => {
      toast.success("Job Card deleted");
      queryClient.invalidateQueries({ queryKey: ["jobCards"] });
      queryClient.invalidateQueries({ queryKey: ["jobCardStats"] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Failed to delete Job Card");
    },
  });

  const onSubmit = (data: JobCardFormData) => {
    createJobCardMutation.mutate(data);
  };

  const handleOpenStatusDialog = (card: any, status: string) => {
    setStatusDialogCard(card);
    setNextStatus(status);
    setStatusNote("");
  };

  const confirmStatusUpdate = () => {
    if (!statusDialogCard || !nextStatus) return;
    const cardId = statusDialogCard._id || statusDialogCard.id;
    updateStatusMutation.mutate({
      id: cardId,
      status: nextStatus,
      note: statusNote.trim() || undefined,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2.5 text-slate-900">
            <span className="p-2 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-md shadow-indigo-100">
              <Printer className="w-6 h-6" />
            </span>
            Job Cards & Print Workflow
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Track print orders, paper stock specs, presses, QC, and delivery timelines for Printadel
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            className="gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-md shadow-indigo-100"
            onClick={() => setShowCreateDialog(true)}
          >
            <Plus className="w-4 h-4" />
            New Job Card
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
        <Card className="border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">Total</span>
              <FileText className="w-4 h-4 text-slate-500" />
            </div>
            <div className="text-2xl font-bold text-slate-900">{stats.total || 0}</div>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-amber-800">Pending</span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-bold text-amber-700">{stats.pending || 0}</div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-blue-800">In Progress</span>
              <TrendingUp className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-bold text-blue-700">{stats.inProgress || 0}</div>
          </CardContent>
        </Card>

        <Card className="border-purple-200 bg-purple-50/40">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-purple-800">Printing</span>
              <Printer className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-2xl font-bold text-purple-700">{stats.printing || 0}</div>
          </CardContent>
        </Card>

        <Card className="border-cyan-200 bg-cyan-50/40">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-cyan-800">QC Check</span>
              <Layers className="w-4 h-4 text-cyan-600" />
            </div>
            <div className="text-2xl font-bold text-cyan-700">{stats.qualityCheck || 0}</div>
          </CardContent>
        </Card>

        <Card className="border-indigo-200 bg-indigo-50/40">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-indigo-800">Ready</span>
              <Package className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-2xl font-bold text-indigo-700">{stats.readyForDelivery || 0}</div>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-emerald-800">Completed</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-emerald-700">{stats.completed || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Filter */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        <TabsList className="mb-4 flex flex-wrap h-auto gap-1 bg-slate-100 p-1">
          <TabsTrigger value="all">All ({stats.total || 0})</TabsTrigger>
          <TabsTrigger value="PENDING">Pending</TabsTrigger>
          <TabsTrigger value="IN_PROGRESS">In Progress</TabsTrigger>
          <TabsTrigger value="PRINTING">Printing</TabsTrigger>
          <TabsTrigger value="QUALITY_CHECK">Quality Check</TabsTrigger>
          <TabsTrigger value="READY_FOR_DELIVERY">Ready for Delivery</TabsTrigger>
          <TabsTrigger value="COMPLETED">Completed</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Search & Filters */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by Job Card #, order #, client, paper stock..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="w-full sm:w-64">
            <Select
              value={selectedAssigneeFilter}
              onValueChange={setSelectedAssigneeFilter}
            >
              <SelectTrigger>
                <SelectValue placeholder="Filter by Assignee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Assignees</SelectItem>
                {employees.map((emp: any) => {
                  const empId = emp._id || emp.id;
                  return (
                    <SelectItem key={empId} value={empId}>
                      {emp.fullName} ({emp.employeeType || emp.role})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Job Card List */}
      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
        </div>
      ) : jobCards.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Printer className="w-12 h-12 text-slate-300 mb-3" />
            <h3 className="text-lg font-semibold text-slate-700">No Job Cards found</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              There are currently no job cards matching your filters. Create a new job card to start tracking printing workflow.
            </p>
            <Button
              className="mt-4 gap-2 bg-purple-600 hover:bg-purple-700"
              onClick={() => setShowCreateDialog(true)}
            >
              <Plus className="w-4 h-4" />
              Create Job Card
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {jobCards.map((card: any) => {
            const cardId = card._id || card.id;
            const statusConfig = STATUS_CONFIG[card.status] || STATUS_CONFIG.PENDING;
            const priorityConfig = PRIORITY_CONFIG[card.priority] || PRIORITY_CONFIG.MEDIUM;
            const StatusIcon = statusConfig.icon;

            return (
              <Card
                key={cardId}
                className="hover:shadow-lg transition-all duration-200 border-slate-200 flex flex-col justify-between overflow-hidden"
              >
                <div>
                  {/* Card Header Bar */}
                  <div className="p-4 border-b bg-slate-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono font-bold text-xs bg-white text-indigo-700 border-indigo-200">
                        {card.jobCardNumber}
                      </Badge>
                      {card.orderNumber && (
                        <span className="text-xs text-muted-foreground font-mono">
                          {card.orderNumber}
                        </span>
                      )}
                    </div>
                    <Badge className={priorityConfig.badgeClass} variant="secondary">
                      {priorityConfig.label}
                    </Badge>
                  </div>

                  <CardContent className="p-5 space-y-4">
                    {/* Title & Client */}
                    <div>
                      <h3 className="font-semibold text-base text-slate-900 line-clamp-1">
                        {card.title}
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span className="font-medium">{card.clientName}</span>
                        {card.clientPhone && (
                          <span className="text-muted-foreground">({card.clientPhone})</span>
                        )}
                      </p>
                    </div>

                    {/* Print Specs Grid */}
                    <div className="bg-slate-50 rounded-lg p-3 text-xs space-y-1.5 border border-slate-100">
                      <div className="flex justify-between items-center text-slate-600">
                        <span className="text-slate-400">Qty:</span>
                        <span className="font-bold text-slate-800">{card.quantity?.toLocaleString()} pcs</span>
                      </div>
                      {card.paperStock && (
                        <div className="flex justify-between items-center text-slate-600">
                          <span className="text-slate-400">Paper:</span>
                          <span className="font-medium text-slate-800 text-right truncate max-w-[180px]">
                            {card.paperStock}
                          </span>
                        </div>
                      )}
                      {card.size && (
                        <div className="flex justify-between items-center text-slate-600">
                          <span className="text-slate-400">Size:</span>
                          <span className="font-medium text-slate-800">{card.size}</span>
                        </div>
                      )}
                      {card.finish && (
                        <div className="flex justify-between items-center text-slate-600">
                          <span className="text-slate-400">Finish:</span>
                          <span className="font-medium text-slate-800 truncate max-w-[180px]">
                            {card.finish}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Status Badge */}
                    <div className="flex items-center justify-between pt-1">
                      <Badge className={`px-2.5 py-1 flex items-center gap-1.5 border ${statusConfig.badgeClass}`}>
                        <StatusIcon className="w-3.5 h-3.5" />
                        {statusConfig.label}
                      </Badge>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{card.actualHours || 0} hrs logged</span>
                      </div>
                    </div>

                    {/* Assignees */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        <span>
                          {card.assignedTo && card.assignedTo.length > 0
                            ? card.assignedTo.map((a: any) => a.fullName || a.name).join(", ")
                            : "Unassigned"}
                        </span>
                      </div>
                      {card.targetDeliveryDate && (
                        <div className="flex items-center gap-1 text-slate-600 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{format(new Date(card.targetDeliveryDate), "dd MMM")}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </div>

                {/* Footer Actions */}
                <div className="p-3 bg-slate-50 border-t flex items-center justify-between gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-8 gap-1.5"
                    onClick={() => setViewingJobCard(card)}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Details
                  </Button>

                  {/* Status Transition Quick Actions */}
                  <div className="flex items-center gap-1">
                    <Select
                      value={card.status}
                      onValueChange={(val) => handleOpenStatusDialog(card, val)}
                    >
                      <SelectTrigger className="h-8 text-xs w-[140px] bg-white">
                        <SelectValue placeholder="Change Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PENDING">Pending</SelectItem>
                        <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                        <SelectItem value="PRINTING">Printing</SelectItem>
                        <SelectItem value="QUALITY_CHECK">Quality Check</SelectItem>
                        <SelectItem value="READY_FOR_DELIVERY">Ready for Delivery</SelectItem>
                        <SelectItem value="COMPLETED">Completed</SelectItem>
                        <SelectItem value="CANCELLED">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>

                    {isPrivileged && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                        onClick={() => {
                          if (confirm(`Delete Job Card ${card.jobCardNumber}?`)) {
                            deleteMutation.mutate(cardId);
                          }
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* CREATE JOB CARD DIALOG */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Printer className="w-5 h-5 text-purple-600" />
              Create New Job Card (Printadel)
            </DialogTitle>
            <DialogDescription>
              Set up a print production job card with paper specifications, assignees, and target deadline.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
            {/* Title & Order Number */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <Label htmlFor="title">Job Title *</Label>
                <Input
                  id="title"
                  {...register("title")}
                  placeholder="e.g., Luxury Matte Catalogues (1000 Pcs)"
                />
                {errors.title && (
                  <p className="text-xs text-red-500">{errors.title.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="orderNumber">Order # / Ref</Label>
                <Input
                  id="orderNumber"
                  {...register("orderNumber")}
                  placeholder="e.g. ORD-2026-904"
                />
              </div>
            </div>

            {/* Client Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="clientName">Client Name *</Label>
                <Input
                  id="clientName"
                  {...register("clientName")}
                  placeholder="e.g. Zenith Pharma Ltd"
                />
                {errors.clientName && (
                  <p className="text-xs text-red-500">{errors.clientName.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="clientPhone">Client Phone</Label>
                <Input
                  id="clientPhone"
                  {...register("clientPhone")}
                  placeholder="+91 98765 43210"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="clientEmail">Client Email</Label>
                <Input
                  id="clientEmail"
                  type="email"
                  {...register("clientEmail")}
                  placeholder="client@example.com"
                />
              </div>
            </div>

            {/* Project Connection */}
            <div className="space-y-1.5">
              <Label htmlFor="projectId">Associated Project (Optional)</Label>
              <Select
                value={watch("projectId")}
                onValueChange={(val) => setValue("projectId", val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select Project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None / Independent Job</SelectItem>
                  {projects.map((p: any) => {
                    const pId = p._id || p.id;
                    return (
                      <SelectItem key={pId} value={pId}>
                        {p.name} ({p.company || "Printadel"})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Print Specs Box */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                Printing Specifications
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="quantity" className="text-xs">Quantity *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    {...register("quantity")}
                    placeholder="1000"
                  />
                  {errors.quantity && (
                    <p className="text-xs text-red-500">{errors.quantity.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="size" className="text-xs">Finished Size</Label>
                  <Input
                    id="size"
                    {...register("size")}
                    placeholder="e.g. A4 (210x297mm)"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="paperStock" className="text-xs">Paper Stock / GSM</Label>
                  <Input
                    id="paperStock"
                    {...register("paperStock")}
                    placeholder="e.g. 350 GSM Art Board"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="finish" className="text-xs">Lamination & Finish</Label>
                  <Input
                    id="finish"
                    {...register("finish")}
                    placeholder="e.g. Matt Lamination + Spot UV"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="specialInstructions" className="text-xs">Special Press / Binding Instructions</Label>
                <Textarea
                  id="specialInstructions"
                  {...register("specialInstructions")}
                  placeholder="e.g. Use CMYK Pantone 286C, perfect binding, shrink wrap in packs of 50."
                  rows={2}
                />
              </div>
            </div>

            {/* Assignees Selection (Reusing Task pattern) */}
            <div className="space-y-2">
              <Label>
                Assign Production Team <span className="text-red-500">*</span>
              </Label>
              <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2 bg-white">
                {employees.map((emp: any) => {
                  const empId = emp._id || emp.id;
                  const isChecked = selectedAssignees.includes(empId);
                  return (
                    <div key={empId} className="flex items-center space-x-2">
                      <Checkbox
                        id={`assignee-${empId}`}
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          const updated = checked
                            ? [...selectedAssignees, empId]
                            : selectedAssignees.filter((id) => id !== empId);
                          setValue("assignedTo", updated);
                        }}
                      />
                      <label
                        htmlFor={`assignee-${empId}`}
                        className="flex-1 text-sm font-medium cursor-pointer flex items-center justify-between"
                      >
                        <span>{emp.fullName}</span>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px]">
                            {emp.designation || emp.role}
                          </Badge>
                          {emp.employeeType && (
                            <Badge variant="secondary" className="text-[10px]">
                              {emp.employeeType}
                            </Badge>
                          )}
                        </div>
                      </label>
                    </div>
                  );
                })}
              </div>
              {errors.assignedTo && (
                <p className="text-xs text-red-500">{errors.assignedTo.message}</p>
              )}
            </div>

            {/* Priority & Delivery Date & Est Hours */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={watch("priority")}
                  onValueChange={(val: any) => setValue("priority", val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="URGENT">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="targetDeliveryDate">Target Delivery Date</Label>
                <Input
                  id="targetDeliveryDate"
                  type="date"
                  {...register("targetDeliveryDate")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="estimatedHours">Est. Production Hours</Label>
                <Input
                  id="estimatedHours"
                  type="number"
                  step="0.5"
                  {...register("estimatedHours")}
                  placeholder="e.g. 8"
                />
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateDialog(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createJobCardMutation.isPending}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {createJobCardMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Job Card"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* STATUS UPDATE CONFIRMATION DIALOG */}
      <Dialog
        open={!!statusDialogCard}
        onOpenChange={(open) => !open && setStatusDialogCard(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Job Card Workflow Status</DialogTitle>
            <DialogDescription>
              Transition <span className="font-semibold text-slate-800">{statusDialogCard?.jobCardNumber}</span> to{" "}
              <span className="font-bold text-indigo-600">
                {STATUS_CONFIG[nextStatus]?.label || nextStatus}
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label htmlFor="statusNote">Status Transition Note (Optional)</Label>
            <Textarea
              id="statusNote"
              placeholder="e.g., Proof approved by client, mounted plates onto 4-color press."
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setStatusDialogCard(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmStatusUpdate}
              disabled={updateStatusMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {updateStatusMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                "Confirm Transition"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* JOB CARD DETAILS MODAL */}
      {viewingJobCard && (
        <Dialog
          open={!!viewingJobCard}
          onOpenChange={(open) => !open && setViewingJobCard(null)}
        >
          <DialogContent className="max-w-3xl w-[95vw] max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono font-bold text-sm bg-indigo-50 text-indigo-700 border-indigo-200">
                    {viewingJobCard.jobCardNumber}
                  </Badge>
                  {viewingJobCard.orderNumber && (
                    <span className="text-sm font-mono text-muted-foreground">
                      Ref: {viewingJobCard.orderNumber}
                    </span>
                  )}
                </div>
                <Badge
                  className={STATUS_CONFIG[viewingJobCard.status]?.badgeClass}
                  variant="secondary"
                >
                  {STATUS_CONFIG[viewingJobCard.status]?.label}
                </Badge>
              </div>
              <DialogTitle className="text-xl font-bold mt-2">
                {viewingJobCard.title}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 pt-3">
              {/* Client & Timeline */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border">
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Client Details
                  </h4>
                  <p className="font-bold text-slate-800 text-sm">{viewingJobCard.clientName}</p>
                  {viewingJobCard.clientPhone && (
                    <p className="text-xs text-slate-600 flex items-center gap-1.5 mt-1">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      {viewingJobCard.clientPhone}
                    </p>
                  )}
                  {viewingJobCard.clientEmail && (
                    <p className="text-xs text-slate-600 flex items-center gap-1.5 mt-0.5">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      {viewingJobCard.clientEmail}
                    </p>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Timeline & Effort
                  </h4>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Target Delivery:</span>
                      <span className="font-medium text-slate-800">
                        {viewingJobCard.targetDeliveryDate
                          ? format(new Date(viewingJobCard.targetDeliveryDate), "PPP")
                          : "Not scheduled"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Estimated Effort:</span>
                      <span className="font-medium text-slate-800">
                        {viewingJobCard.estimatedHours ? `${viewingJobCard.estimatedHours} hrs` : "N/A"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Actual Hours Logged:</span>
                      <span className="font-bold text-indigo-600">
                        {viewingJobCard.actualHours || 0} hrs
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Printing Specs */}
              <div className="p-4 rounded-xl border border-purple-100 bg-purple-50/30 space-y-3">
                <h4 className="text-xs font-bold text-purple-900 uppercase tracking-wide flex items-center gap-1.5">
                  <Printer className="w-4 h-4 text-purple-600" />
                  Print Production Specifications
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block">Quantity</span>
                    <span className="font-bold text-slate-800 text-sm">
                      {viewingJobCard.quantity?.toLocaleString()} pcs
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Finished Size</span>
                    <span className="font-semibold text-slate-800">
                      {viewingJobCard.size || "Standard"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Paper Stock</span>
                    <span className="font-semibold text-slate-800">
                      {viewingJobCard.paperStock || "Standard"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Lamination / Finishing</span>
                    <span className="font-semibold text-slate-800">
                      {viewingJobCard.finish || "None"}
                    </span>
                  </div>
                </div>

                {viewingJobCard.specialInstructions && (
                  <div className="pt-2 border-t border-purple-100 text-xs">
                    <span className="font-semibold text-slate-700 block mb-1">
                      Press / Finishing Instructions:
                    </span>
                    <p className="text-slate-600 bg-white p-2.5 rounded border border-purple-100">
                      {viewingJobCard.specialInstructions}
                    </p>
                  </div>
                )}
              </div>

              {/* Assigned Team */}
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Assigned Production Team
                </h4>
                <div className="flex flex-wrap gap-2">
                  {viewingJobCard.assignedTo && viewingJobCard.assignedTo.length > 0 ? (
                    viewingJobCard.assignedTo.map((emp: any) => {
                      const empId = emp._id || emp.id;
                      return (
                        <div
                          key={empId}
                          className="flex items-center gap-2 p-2 rounded-lg bg-slate-100 border text-xs"
                        >
                          <div className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-[10px]">
                            {emp.fullName?.charAt(0) || "U"}
                          </div>
                          <div>
                            <span className="font-medium text-slate-800 block">
                              {emp.fullName}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {emp.designation || emp.employeeType || emp.role}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-muted-foreground">No assignees</p>
                  )}
                </div>
              </div>

              {/* Status Audit History */}
              {viewingJobCard.statusHistory && viewingJobCard.statusHistory.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Status History & Workflow Audit
                  </h4>
                  <div className="border rounded-xl divide-y text-xs">
                    {viewingJobCard.statusHistory.map((sh: any, idx: number) => (
                      <div key={idx} className="p-3 flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge
                              className={STATUS_CONFIG[sh.status]?.badgeClass}
                              variant="outline"
                            >
                              {STATUS_CONFIG[sh.status]?.label || sh.status}
                            </Badge>
                            <span className="text-muted-foreground">
                              by {sh.changedBy?.fullName || "User"}
                            </span>
                          </div>
                          {sh.note && (
                            <p className="text-slate-600 mt-1 pl-1 italic">
                              "{sh.note}"
                            </p>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {format(new Date(sh.timestamp), "dd MMM, HH:mm")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="mt-4">
              <Button onClick={() => setViewingJobCard(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
