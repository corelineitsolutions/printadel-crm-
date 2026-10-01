import mongoose from "mongoose";
import JobCard, { JobCardStatus, JobCardPriority } from "../models/JobCard";
import { UserRole } from "../models/User";
import { createNotification } from "./notification.service";
import { NotificationType } from "../models/Notification";

export interface CreateJobCardData {
  jobCardNumber?: string;
  orderNumber?: string;
  title: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  description?: string;
  specifications?: string;
  paperStock?: string;
  size?: string;
  quantity?: number;
  finish?: string;
  priority?: JobCardPriority;
  status?: JobCardStatus;
  assignedTo: string[];
  projectId?: string;
  targetDeliveryDate?: Date | string;
  estimatedHours?: number;
  attachments?: string[];
}

export interface UpdateJobCardData {
  orderNumber?: string;
  title?: string;
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  description?: string;
  specifications?: string;
  paperStock?: string;
  size?: string;
  quantity?: number;
  finish?: string;
  priority?: JobCardPriority;
  status?: JobCardStatus;
  assignedTo?: string[];
  projectId?: string;
  targetDeliveryDate?: Date | string;
  estimatedHours?: number;
  actualHours?: number;
  attachments?: string[];
  statusNote?: string;
}

export interface JobCardFilters {
  search?: string;
  status?: string;
  priority?: string;
  assignedTo?: string;
  projectId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

/**
 * Generate sequential Job Card Number: JC-YYYY-XXXX
 */
async function generateNextJobCardNumber(): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `JC-${currentYear}-`;

  // Find latest job card with this prefix
  const latest = await JobCard.findOne({
    jobCardNumber: new RegExp(`^${prefix}\\d+`),
  })
    .sort({ createdAt: -1 })
    .select("jobCardNumber");

  let nextSequence = 1;
  if (latest && latest.jobCardNumber) {
    const parts = latest.jobCardNumber.split("-");
    const num = parseInt(parts[2], 10);
    if (!isNaN(num)) {
      nextSequence = num + 1;
    }
  }

  const padded = String(nextSequence).padStart(4, "0");
  return `${prefix}${padded}`;
}

export const jobCardService = {
  /**
   * Preview the number the next created Job Card will receive
   */
  async getNextJobCardNumber() {
    return { jobCardNumber: await generateNextJobCardNumber() };
  },

  /**
   * Create a new Job Card
   */
  async createJobCard(data: CreateJobCardData, userId: string) {
    const jobCardNumber = data.jobCardNumber || (await generateNextJobCardNumber());

    const initialStatus = data.status || JobCardStatus.PENDING;

    const jobCard = await JobCard.create({
      jobCardNumber,
      orderNumber: data.orderNumber,
      title: data.title,
      clientName: data.clientName,
      clientPhone: data.clientPhone,
      clientEmail: data.clientEmail,
      description: data.description,
      specifications: data.specifications,
      paperStock: data.paperStock,
      size: data.size,
      quantity: data.quantity || 1,
      finish: data.finish,
      priority: data.priority || JobCardPriority.MEDIUM,
      status: initialStatus,
      assignedTo: data.assignedTo.map((id) => new mongoose.Types.ObjectId(id)),
      assignedBy: new mongoose.Types.ObjectId(userId),
      projectId: data.projectId && data.projectId !== "none" ? new mongoose.Types.ObjectId(data.projectId) : undefined,
      targetDeliveryDate: data.targetDeliveryDate ? new Date(data.targetDeliveryDate) : undefined,
      estimatedHours: data.estimatedHours || 0,
      attachments: data.attachments || [],
      statusHistory: [
        {
          status: initialStatus,
          changedBy: new mongoose.Types.ObjectId(userId),
          changedAt: new Date(),
          note: "Job card created",
        },
      ],
    });

    // Notify assigned team members
    for (const assigneeId of data.assignedTo) {
      if (assigneeId !== userId) {
        await createNotification({
          userId: assigneeId,
          type: NotificationType.TASK_ASSIGNED,
          title: "New Job Card Assigned",
          message: `You have been assigned to Job Card: ${jobCard.jobCardNumber} (${jobCard.title})`,
          link: `/job-cards`,
        }).catch((err) => console.error("Notification error:", err));
      }
    }

    return await JobCard.findById(jobCard._id)
      .populate("assignedTo", "id fullName email designation")
      .populate("assignedBy", "id fullName email")
      .populate("projectId", "id name code");
  },

  /**
   * Get all Job Cards with filters
   */
  async getJobCards(filters: JobCardFilters, _userId: string, userRole: UserRole) {
    const {
      search,
      status,
      priority,
      assignedTo,
      projectId,
      page = 1,
      limit = 50,
    } = filters;

    const skip = (page - 1) * limit;
    const query: any = {};

    // Role-based visibility
    if (userRole === UserRole.EMPLOYEE) {
      if (assignedTo && assignedTo !== "all") {
        query.assignedTo = new mongoose.Types.ObjectId(assignedTo);
      }
      // Note: Employees in print operations can see company job cards for collaboration,
      // but if filtered by assignedTo=me, we honor that
    } else if (assignedTo && assignedTo !== "all") {
      query.assignedTo = new mongoose.Types.ObjectId(assignedTo);
    }

    // Status filter
    if (status && status !== "ALL") {
      if (status === "ACTIVE_ALL") {
        query.status = { $nin: [JobCardStatus.COMPLETED, JobCardStatus.CANCELLED] };
      } else {
        query.status = status;
      }
    }

    // Priority filter
    if (priority && priority !== "ALL") {
      query.priority = priority;
    }

    // Project filter
    if (projectId && projectId !== "none" && projectId !== "ALL") {
      query.projectId = new mongoose.Types.ObjectId(projectId);
    }

    // Search filter
    if (search && search.trim() !== "") {
      const regex = { $regex: search.trim(), $options: "i" };
      query.$or = [
        { jobCardNumber: regex },
        { orderNumber: regex },
        { title: regex },
        { clientName: regex },
        { description: regex },
        { paperStock: regex },
      ];
    }

    const [jobCards, total] = await Promise.all([
      JobCard.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("assignedTo", "id fullName email designation")
        .populate("assignedBy", "id fullName email")
        .populate("projectId", "id name code")
        .lean(),
      JobCard.countDocuments(query),
    ]);

    return {
      jobCards,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get single Job Card by ID
   */
  async getJobCardById(id: string) {
    const jobCard = await JobCard.findById(id)
      .populate("assignedTo", "id fullName email designation department phone")
      .populate("assignedBy", "id fullName email")
      .populate("projectId", "id name code clientName")
      .populate("statusHistory.changedBy", "id fullName email");

    if (!jobCard) {
      throw new Error("Job Card not found");
    }

    return jobCard;
  },

  /**
   * Update Job Card
   */
  async updateJobCard(id: string, data: UpdateJobCardData, userId: string) {
    const jobCard = await JobCard.findById(id);

    if (!jobCard) {
      throw new Error("Job Card not found");
    }

    // Status transition tracking
    if (data.status && data.status !== jobCard.status) {
      jobCard.statusHistory.push({
        status: data.status,
        changedBy: new mongoose.Types.ObjectId(userId),
        changedAt: new Date(),
        note: data.statusNote || `Status updated to ${data.status}`,
      });
      jobCard.status = data.status;
    }

    if (data.title !== undefined) jobCard.title = data.title;
    if (data.orderNumber !== undefined) jobCard.orderNumber = data.orderNumber;
    if (data.clientName !== undefined) jobCard.clientName = data.clientName;
    if (data.clientPhone !== undefined) jobCard.clientPhone = data.clientPhone;
    if (data.clientEmail !== undefined) jobCard.clientEmail = data.clientEmail;
    if (data.description !== undefined) jobCard.description = data.description;
    if (data.specifications !== undefined) jobCard.specifications = data.specifications;
    if (data.paperStock !== undefined) jobCard.paperStock = data.paperStock;
    if (data.size !== undefined) jobCard.size = data.size;
    if (data.quantity !== undefined) jobCard.quantity = data.quantity;
    if (data.finish !== undefined) jobCard.finish = data.finish;
    if (data.priority !== undefined) jobCard.priority = data.priority;
    if (data.estimatedHours !== undefined) jobCard.estimatedHours = data.estimatedHours;
    if (data.actualHours !== undefined) jobCard.actualHours = data.actualHours;
    if (data.targetDeliveryDate !== undefined) {
      jobCard.targetDeliveryDate = data.targetDeliveryDate ? new Date(data.targetDeliveryDate) : undefined;
    }
    if (data.attachments !== undefined) jobCard.attachments = data.attachments;
    if (data.assignedTo !== undefined) {
      jobCard.assignedTo = data.assignedTo.map((uid) => new mongoose.Types.ObjectId(uid));
    }
    if (data.projectId !== undefined) {
      jobCard.projectId = data.projectId && data.projectId !== "none" ? new mongoose.Types.ObjectId(data.projectId) : undefined;
    }

    await jobCard.save();

    return await JobCard.findById(id)
      .populate("assignedTo", "id fullName email designation")
      .populate("assignedBy", "id fullName email")
      .populate("projectId", "id name code")
      .populate("statusHistory.changedBy", "id fullName email");
  },

  /**
   * Update Job Card Status
   */
  async updateStatus(id: string, newStatus: JobCardStatus, note: string | undefined, userId: string) {
    const jobCard = await JobCard.findById(id);

    if (!jobCard) {
      throw new Error("Job Card not found");
    }

    jobCard.status = newStatus;
    jobCard.statusHistory.push({
      status: newStatus,
      changedBy: new mongoose.Types.ObjectId(userId),
      changedAt: new Date(),
      note: note || `Moved to ${newStatus}`,
    });

    await jobCard.save();

    // Notify assigned team and creator
    const notifyUserIds = new Set<string>();
    jobCard.assignedTo.forEach((uid) => notifyUserIds.add(uid.toString()));
    notifyUserIds.add(jobCard.assignedBy.toString());
    notifyUserIds.delete(userId);

    for (const targetId of notifyUserIds) {
      await createNotification({
        userId: targetId,
        type: NotificationType.TASK_STATUS_UPDATED,
        title: "Job Card Status Changed",
        message: `Job Card ${jobCard.jobCardNumber} is now ${newStatus}`,
        link: `/job-cards`,
      }).catch((err) => console.error("Notification error:", err));
    }

    return await JobCard.findById(id)
      .populate("assignedTo", "id fullName email designation")
      .populate("assignedBy", "id fullName email")
      .populate("projectId", "id name code")
      .populate("statusHistory.changedBy", "id fullName email");
  },

  /**
   * Delete Job Card
   */
  async deleteJobCard(id: string) {
    const jobCard = await JobCard.findByIdAndDelete(id);
    if (!jobCard) {
      throw new Error("Job Card not found");
    }
    return { success: true, message: "Job Card deleted successfully" };
  },

  /**
   * Get Job Card Stats
   */
  async getJobCardStats() {
    const [
      total,
      pending,
      inProgress,
      printing,
      qualityCheck,
      readyForDelivery,
      completed,
      urgent,
    ] = await Promise.all([
      JobCard.countDocuments({}),
      JobCard.countDocuments({ status: JobCardStatus.PENDING }),
      JobCard.countDocuments({ status: JobCardStatus.IN_PROGRESS }),
      JobCard.countDocuments({ status: JobCardStatus.PRINTING }),
      JobCard.countDocuments({ status: JobCardStatus.QUALITY_CHECK }),
      JobCard.countDocuments({ status: JobCardStatus.READY_FOR_DELIVERY }),
      JobCard.countDocuments({ status: JobCardStatus.COMPLETED }),
      JobCard.countDocuments({ priority: JobCardPriority.URGENT, status: { $nin: [JobCardStatus.COMPLETED, JobCardStatus.CANCELLED] } }),
    ]);

    return {
      total,
      active: total - completed,
      pending,
      inProgress,
      printing,
      qualityCheck,
      readyForDelivery,
      completed,
      urgent,
    };
  },
};
