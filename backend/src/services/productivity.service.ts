import mongoose from "mongoose";
import ProductivityLog, {
  HELP_SUPPORT_ACTIVITY,
  MAX_HELP_SUPPORT_PER_LOGOUT,
} from "../models/ProductivityLog";
import JobCard from "../models/JobCard";
import { getISTStartOfDay, getISTEndOfDay } from "../utils/date.utils";

export interface LogActivityInput {
  userId: string;
  jobCardId?: string;
  activityType: string;
  durationMinutes?: number;
  notes?: string;
  isLogoutSession?: boolean;
}

export interface LogActivitiesBatchInput {
  userId: string;
  entries: { jobCardId?: string; activityType: string; durationMinutes?: number }[];
  notes?: string;
  isLogoutSession?: boolean;
}

export interface ProductivityFilters {
  userId?: string;
  jobCardId?: string;
  activityType?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export const productivityService = {
  /**
   * Log work activity (called on logout or manually)
   */
  async logActivity(data: LogActivityInput) {
    const duration = data.durationMinutes && data.durationMinutes > 0 ? data.durationMinutes : 60;
    const hoursSpent = Math.round((duration / 60) * 100) / 100;

    const log = await ProductivityLog.create({
      userId: new mongoose.Types.ObjectId(data.userId),
      jobCardId: data.jobCardId && data.jobCardId !== "none" ? new mongoose.Types.ObjectId(data.jobCardId) : undefined,
      activityType: data.activityType,
      durationMinutes: duration,
      hoursSpent,
      notes: data.notes || "",
      isLogoutSession: data.isLogoutSession !== undefined ? data.isLogoutSession : true,
      timestamp: new Date(),
    });

    // If logged against a job card, increment actualHours on that JobCard
    if (data.jobCardId && data.jobCardId !== "none") {
      await JobCard.findByIdAndUpdate(data.jobCardId, {
        $inc: { actualHours: hoursSpent },
      }).catch((err) => console.error("Error updating JobCard actualHours:", err));
    }

    return await ProductivityLog.findById(log._id)
      .populate("userId", "id fullName email designation department")
      .populate("jobCardId", "id jobCardNumber title clientName status");
  },

  /**
   * Log several job card activities at once (logout modal)
   */
  async logActivitiesBatch(data: LogActivitiesBatchInput) {
    if (!data.entries.length) {
      throw new Error("Select at least one job card or general work");
    }

    const seenJobCards = new Set<string>();
    for (const entry of data.entries) {
      const key = entry.jobCardId && entry.jobCardId !== "none" ? entry.jobCardId : "general";
      if (seenJobCards.has(key)) {
        throw new Error("Each job card can only be selected once");
      }
      seenJobCards.add(key);
      if (key !== "general" && !mongoose.Types.ObjectId.isValid(key)) {
        throw new Error("Invalid job card selected");
      }
    }

    const helpSupportCount = data.entries.filter(
      (e) => e.activityType === HELP_SUPPORT_ACTIVITY
    ).length;
    if (helpSupportCount > MAX_HELP_SUPPORT_PER_LOGOUT) {
      throw new Error(
        `"${HELP_SUPPORT_ACTIVITY}" can be selected for at most ${MAX_HELP_SUPPORT_PER_LOGOUT} job cards`
      );
    }

    const logs = [];
    for (const entry of data.entries) {
      logs.push(
        await this.logActivity({
          userId: data.userId,
          jobCardId: entry.jobCardId,
          activityType: entry.activityType,
          durationMinutes: entry.durationMinutes,
          notes: data.notes,
          isLogoutSession: data.isLogoutSession,
        })
      );
    }
    return logs;
  },

  /**
   * Get user's own productivity logs
   */
  async getMyLogs(userId: string, filters: ProductivityFilters) {
    const { jobCardId, activityType, startDate, endDate, page = 1, limit = 50 } = filters;
    const skip = (page - 1) * limit;

    const query: any = { userId: new mongoose.Types.ObjectId(userId) };

    if (jobCardId && jobCardId !== "all") {
      query.jobCardId = new mongoose.Types.ObjectId(jobCardId);
    }
    if (activityType && activityType !== "all") {
      query.activityType = activityType;
    }
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = getISTStartOfDay(new Date(startDate));
      if (endDate) query.timestamp.$lte = getISTEndOfDay(new Date(endDate));
    }

    const [logs, total] = await Promise.all([
      ProductivityLog.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .populate("jobCardId", "id jobCardNumber title clientName status")
        .lean(),
      ProductivityLog.countDocuments(query),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get all productivity logs (Admin & Manager view)
   */
  async getAllLogs(filters: ProductivityFilters) {
    const { userId, jobCardId, activityType, startDate, endDate, page = 1, limit = 50 } = filters;
    const skip = (page - 1) * limit;

    const query: any = {};

    if (userId && userId !== "all") {
      query.userId = new mongoose.Types.ObjectId(userId);
    }
    if (jobCardId && jobCardId !== "all") {
      query.jobCardId = new mongoose.Types.ObjectId(jobCardId);
    }
    if (activityType && activityType !== "all") {
      query.activityType = activityType;
    }
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = getISTStartOfDay(new Date(startDate));
      if (endDate) query.timestamp.$lte = getISTEndOfDay(new Date(endDate));
    }

    const [logs, total] = await Promise.all([
      ProductivityLog.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .populate("userId", "id fullName email designation department employeeType")
        .populate("jobCardId", "id jobCardNumber title clientName status")
        .lean(),
      ProductivityLog.countDocuments(query),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get Productivity Aggregation Statistics
   */
  async getProductivityStats(filters: { userId?: string; startDate?: string; endDate?: string }) {
    const query: any = {};

    if (filters.userId && filters.userId !== "all") {
      query.userId = new mongoose.Types.ObjectId(filters.userId);
    }
    if (filters.startDate || filters.endDate) {
      query.timestamp = {};
      if (filters.startDate) query.timestamp.$gte = getISTStartOfDay(new Date(filters.startDate));
      if (filters.endDate) query.timestamp.$lte = getISTEndOfDay(new Date(filters.endDate));
    }

    // Aggregations
    const [byActivity, byJobCard, byEmployee, totalResult] = await Promise.all([
      // Hours by activity type
      ProductivityLog.aggregate([
        { $match: query },
        {
          $group: {
            _id: "$activityType",
            totalMinutes: { $sum: "$durationMinutes" },
            totalHours: { $sum: "$hoursSpent" },
            count: { $sum: 1 },
          },
        },
        { $sort: { totalHours: -1 } },
      ]),

      // Hours by Job Card
      ProductivityLog.aggregate([
        { $match: { ...query, jobCardId: { $exists: true, $ne: null } } },
        {
          $group: {
            _id: "$jobCardId",
            totalMinutes: { $sum: "$durationMinutes" },
            totalHours: { $sum: "$hoursSpent" },
            count: { $sum: 1 },
          },
        },
        { $sort: { totalHours: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "jobcards",
            localField: "_id",
            foreignField: "_id",
            as: "jobCard",
          },
        },
        { $unwind: "$jobCard" },
        {
          $project: {
            jobCardId: "$_id",
            jobCardNumber: "$jobCard.jobCardNumber",
            title: "$jobCard.title",
            clientName: "$jobCard.clientName",
            status: "$jobCard.status",
            totalHours: 1,
            count: 1,
          },
        },
      ]),

      // Hours by Employee
      ProductivityLog.aggregate([
        { $match: query },
        {
          $group: {
            _id: "$userId",
            totalMinutes: { $sum: "$durationMinutes" },
            totalHours: { $sum: "$hoursSpent" },
            count: { $sum: 1 },
          },
        },
        { $sort: { totalHours: -1 } },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: "$user" },
        {
          $project: {
            userId: "$_id",
            fullName: "$user.fullName",
            email: "$user.email",
            designation: "$user.designation",
            department: "$user.department",
            employeeType: "$user.employeeType",
            totalHours: 1,
            count: 1,
          },
        },
      ]),

      // Total aggregate
      ProductivityLog.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalHours: { $sum: "$hoursSpent" },
            totalLogs: { $sum: 1 },
          },
        },
      ]),
    ]);

    const totalHours = totalResult[0]?.totalHours || 0;
    const totalLogs = totalResult[0]?.totalLogs || 0;

    return {
      totalHours: Math.round(totalHours * 100) / 100,
      totalLogs,
      byActivity,
      byJobCard,
      byEmployee,
    };
  },
};
