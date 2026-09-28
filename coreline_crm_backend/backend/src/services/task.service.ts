import mongoose from "mongoose";
import Task, { TaskStatus, TaskPriority } from "../models/Task";
import Project from "../models/Project";
import Milestone from "../models/Milestone";
import TaskTimer from "../models/TaskTimer";
import TaskComment from "../models/TaskComment";
import User, { UserRole } from "../models/User";
import Subtask from "../models/Subtask";
import Attendance from "../models/Attendance";
import Setting from "../models/Setting";
import { getISTStartOfDay, getISTEndOfDay } from "../utils/date.utils";
import { createNotification } from "./notification.service";
import { NotificationType } from "../models/Notification";
import { sendEmail } from "../config/email";

/**
 * Task Service
 * Handles all task-related business logic including timers, comments, and subtasks
 */

interface CreateTaskData {
  title: string;
  description?: string;
  projectId?: string;
  milestoneId?: string;
  assignedTo: string | string[]; // Accept both single string and array
  assignedBy: string;
  priority?: TaskPriority;
  estimatedHours?: number;
  deadline?: Date;
  tags?: string[];
  isSelfCreated?: boolean;
  taskImages?: string[];
}

interface UpdateTaskData {
  title?: string;
  description?: string;
  projectId?: string;
  milestoneId?: string;
  assignedTo?: string | string[];
  priority?: TaskPriority;
  status?: TaskStatus;
  estimatedHours?: number;
  actualHours?: number;
  deadline?: Date;
  tags?: string[];
  taskImages?: string[];
}

interface GetTasksFilters {
  projectId?: string;
  milestoneId?: string;
  assignedTo?: string;
  assignedBy?: string;
  status?: TaskStatus | "ACTIVE_ALL";
  priority?: TaskPriority;
  search?: string;
  page?: number;
  limit?: number;
  taskType?: "self" | "assigned" | "overall" | "collaboration" | "my-tasks";
}

export const taskService = {
  /**
   * Create a new task
   */
  /**
   * Create a new task
   */
  async createTask(data: CreateTaskData) {
    // Validate project and milestone exist if provided
    if (data.projectId && data.projectId !== "none") {
      const project = await Project.findById(data.projectId);
      if (!project) throw new Error("Project not found");
    }

    if (data.milestoneId && data.milestoneId !== "none") {
      const milestone = await Milestone.findById(data.milestoneId);
      if (!milestone) throw new Error("Milestone not found");
    }

    // Clean up 'none' values to undefined
    const projectId = data.projectId === "none" ? undefined : data.projectId;
    const milestoneId = data.milestoneId === "none" ? undefined : data.milestoneId;

    // Convert assignedTo to array if it's a single string
    const assignedToArray = Array.isArray(data.assignedTo) ? data.assignedTo : [data.assignedTo];

    // Safety check for Base64 image sizes to prevent document overflow (16MB limit)
    if (data.taskImages && data.taskImages.length > 0) {
      const totalSize = data.taskImages.reduce((sum, img) => sum + (img?.length || 0), 0);
      if (totalSize > 14 * 1024 * 1024) { // 14MB safety limit
        throw new Error("Total image size exceeds 14MB limit. Please compress images.");
      }
    }

    // Deadline Paradox. Task cannot exceed Project deadline.
    // Fixed: Use already-imported Project model instead of require()
    if (projectId && data.deadline) {
      const project = await Project.findById(projectId).lean();
      if (project && (project as any).deadline && new Date(data.deadline) > new Date((project as any).deadline)) {
        throw new Error(`Task deadline (${new Date(data.deadline).toLocaleDateString()}) cannot exceed Project deadline (${new Date((project as any).deadline).toLocaleDateString()}).`);
      }
    }

    const task = await Task.create({
      ...data,
      projectId,
      milestoneId,
      assignedTo: assignedToArray,
      deadline: data.deadline ? new Date(data.deadline) : undefined,
      priority: data.priority || TaskPriority.MEDIUM,
      status: TaskStatus.TO_DO,
    });

    const populatedTask = await Task.findById(task._id)
      .populate("assignedTo", "id fullName email employeeId")
      .populate("assignedBy", "id fullName")
      .populate("projectId", "id name code")
      .populate("milestoneId", "id title");

    // Notify assigned users
    if (populatedTask) {
      try {
        const creatorsName = (populatedTask.assignedBy as any)?.fullName || "ADMIN";
        const assignedTo = populatedTask.assignedTo as any[];

        for (const user of assignedTo) {
          if (!user) continue;
          const targetUserId = (user.id || user._id)?.toString();
          if (!targetUserId) continue;

          // Don't notify the person who created the task (if they assigned themselves)
          if (targetUserId !== data.assignedBy.toString()) {
            await createNotification({
              userId: targetUserId,
              type: NotificationType.TASK_ASSIGNED,
              title: "New Task Assigned",
              message: `${creatorsName} assigned a new task to you: ${populatedTask.title}`,
              link: `/tasks/${populatedTask._id}`,
            }).catch(e => console.error("Notification error:", e));

            // Send Email
            if (user.email) {
              await sendEmail({
                to: user.email,
                subject: "New Task Assigned",
                html: `<p>Hello ${user.fullName},</p>
                      <p><strong>${creatorsName}</strong> has assigned a new task to you: <strong>${populatedTask.title}</strong>.</p>
                      <p>Description: ${populatedTask.description || 'No description provided'}</p>
                      <p>Priority: ${populatedTask.priority}</p>
                      <p>Deadline: ${populatedTask.deadline ? populatedTask.deadline.toDateString() : 'No deadline'}</p>`,
              }).catch(e => console.error("Email error:", e));
            }
          }
        }
      } catch (err) {
        console.error("Error sending notifications for new task:", err);
      }
    }

    return populatedTask;
  },

  /**
   * Get tasks with filters
   */
  /**
   * Get tasks with filters
   */
  async getTasks(filters: GetTasksFilters, userId: string, userUserRole: UserRole) {
    const {
      projectId,
      milestoneId,
      assignedTo,
      assignedBy,
      status,
      priority,
      search,
      page = 1,
      limit = 50,
      taskType,
    } = filters;

    const skip = (page - 1) * limit;
    const where: any = {};
    const conditions: any[] = [];

    // Role-based visibility
    const role = userUserRole ? userUserRole.toString().trim().toUpperCase() : "";

    // Safety check for userId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid user ID");
    }
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Visibility filter:
    // 1. Employees: ALWAYS restricted to their own tasks (assigned by OR to them)
    // 2. Managers: Restricted ONLY if requesting a specific source tab (self, assigned, collaboration, my-tasks)
    // 3. Admins: Restricted ONLY if requesting a specific source tab (self, assigned, collaboration, my-tasks)
    const isSpecificSourceRequested = ["self", "assigned", "collaboration", "my-tasks"].includes(taskType as string);

    if (role === "EMPLOYEE" || (isSpecificSourceRequested && (role === "MANAGER" || role === "ADMIN"))) {
      if (taskType === "self") {
        // Self Created: tasks where user is BOTH the creator AND THE ONLY assignee
        conditions.push({
          assignedBy: userObjectId,
          assignedTo: { $size: 1, $all: [userObjectId] }
        });
      } else if (taskType === "assigned") {
        // Assigned to Me: tasks assigned to the user by SOMEONE ELSE (not self-created)
        conditions.push({ assignedTo: userObjectId, assignedBy: { $ne: userObjectId } });
      } else if (taskType === "collaboration") {
        // Collaboration: 
        // 1. Created by me and assigned to others
        // 2. Assigned to me by someone else
        conditions.push({
          $or: [
            { assignedBy: userObjectId, assignedTo: { $nin: [userObjectId] } },
            { assignedTo: userObjectId, assignedBy: { $ne: userObjectId } }
          ]
        });
      } else if (taskType === "my-tasks") {
        // My Tasks: Any task where I am either the creator or an assignee
        conditions.push({
          $or: [
            { assignedBy: userObjectId },
            { assignedTo: userObjectId }
          ]
        });
      } else {
        // Default restriction for Employees (or Managers if no taskType but we want safety)
        conditions.push({ $or: [{ assignedTo: userObjectId }, { assignedBy: userObjectId }] });
      }
    }
    // 'overall' taskType intentionally doesn't add source filters here (handled in role-based visibility)


    // Apply basic filters
    if (projectId && projectId !== "all" && projectId !== "none") where.projectId = projectId;
    if (milestoneId) where.milestoneId = milestoneId;
    if (assignedTo) where.assignedTo = assignedTo;
    if (assignedBy) where.assignedBy = assignedBy;
    if (status) {
      if ((status as string) === "ACTIVE_ALL") {
        where.status = { $in: [TaskStatus.TO_DO, TaskStatus.IN_PROGRESS, TaskStatus.UNDER_REVIEW] };
      } else {
        where.status = status;
      }
    }
    if (priority) where.priority = priority;

    // Enhanced Search
    if (search) {
      // Find matching users for name search (assignedBy and assignedTo)
      const matchingUsers = await User.find({
        fullName: { $regex: search, $options: "i" }
      }).select("_id");
      const userIds = matchingUsers.map(u => u._id);

      const searchOr: any[] = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { assignedBy: { $in: userIds } }
      ];

      // If MANAGER or ADMIN, also search in assignedTo (employee name)
      if (role === "ADMIN" || role === "MANAGER") {
        searchOr.push({ assignedTo: { $in: userIds } });
      }

      conditions.push({ $or: searchOr });
    }

    // Combine conditions into where clause
    if (conditions.length > 0) {
      where.$and = conditions;
    }

    const tasksQuery = Task.find(where)
      .select("-taskImages") // Performance: Exclude heavy Base64 images from list view
      .sort({ status: 1, priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("assignedTo", "id fullName email employeeId")
      .populate("assignedBy", "id fullName")
      .populate("projectId", "id name code")
      .populate("milestoneId", "id title");

    const [tasks, total] = await Promise.all([
      tasksQuery,
      Task.countDocuments(where),
    ]);

    const taskIds = tasks.map((t: any) => t._id);

    // Bulk count queries to avoid N+1 (was 150+ queries for 50 tasks, now 3)
    const [commentCounts, subtaskCounts, timerCounts] = await Promise.all([
      TaskComment.aggregate([{ $match: { taskId: { $in: taskIds } } }, { $group: { _id: "$taskId", count: { $sum: 1 } } }]),
      Subtask.aggregate([{ $match: { taskId: { $in: taskIds } } }, { $group: { _id: "$taskId", count: { $sum: 1 } } }]),
      TaskTimer.aggregate([{ $match: { taskId: { $in: taskIds } } }, { $group: { _id: "$taskId", count: { $sum: 1 } } }]),
    ]);

    const commentMap = new Map(commentCounts.map((c: any) => [c._id.toString(), c.count]));
    const subtaskMap = new Map(subtaskCounts.map((c: any) => [c._id.toString(), c.count]));
    const timerMap = new Map(timerCounts.map((c: any) => [c._id.toString(), c.count]));

    const enhancedTasks = tasks.map((t: any) => ({
      ...t.toObject(),
      _count: {
        comments: commentMap.get(t._id.toString()) || 0,
        subtasks: subtaskMap.get(t._id.toString()) || 0,
        timers: timerMap.get(t._id.toString()) || 0,
      },
    }));

    return {
      tasks: enhancedTasks,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get task by ID
   */
  /**
   * Get task by ID
   */
  async getTaskById(taskId: string, userId: string, userRole: UserRole) {
    const task = await Task.findById(taskId)
      .populate("assignedTo", "id fullName email employeeId")
      .populate("assignedBy", "id fullName email")
      .populate("projectId", "id name code")
      .populate("milestoneId", "id title");

    if (!task) {
      throw new Error("Task not found");
    }

    // Role-based visibility
    const role = userRole ? userRole.toString().trim().toUpperCase() : "";
    if (role === "EMPLOYEE") {
      const assignedToIds = task.assignedTo.map((a: any) => (a._id || a.id || a).toString());

      const isAssigned = assignedToIds.includes(userId.toString());
      const isCreator = task.assignedBy.toString() === userId.toString();

      if (!isAssigned && !isCreator) {
        throw new Error("You don't have access to this task");
      }
    }

    // Get active timer for this task
    const activeTimer = await TaskTimer.findOne({
      taskId,
      endTime: null,
    });

    // Fetch related data manually to mimic include
    const comments = await TaskComment.find({ taskId }).sort({ createdAt: -1 }).populate("userId", "id fullName");
    const subtasks = await Subtask.find({ taskId }).sort({ createdAt: 1 });
    const timers = await TaskTimer.find({ taskId }).sort({ startTime: -1 }).limit(10);

    return {
      ...task.toObject(),
      activeTimer,
      comments,
      subtasks,
      timers
    };
  },

  /**
   * Update task
   */
  /**
   * Update task
   */
  async updateTask(
    taskId: string,
    data: UpdateTaskData,
    userId: string,
    userUserRole: UserRole
  ) {
    const task = await Task.findById(taskId);

    if (!task) {
      throw new Error("Task not found");
    }

    // Check permissions
    const role = userUserRole ? userUserRole.toString().trim().toUpperCase() : "";
    if (role === "EMPLOYEE") {
      const assignedToIds = task.assignedTo.map(id => id.toString());

      const isAssigned = assignedToIds.includes(userId.toString());
      const isCreator = task.assignedBy.toString() === userId.toString();

      // Employees can only update their assigned tasks or tasks they created
      if (!isAssigned && !isCreator) {
        throw new Error("You don't have permission to update this task");
      }

      // Employees can't change assignee
      if (data.assignedTo) {
        const newAssignedTo = Array.isArray(data.assignedTo) ? data.assignedTo : [data.assignedTo];
        const hasChanges = JSON.stringify(newAssignedTo.sort()) !== JSON.stringify(assignedToIds.sort());

        if (hasChanges) {
          throw new Error("You don't have permission to reassign tasks");
        }
      }
    }

    // Safety check for Base64 image sizes to prevent document overflow (16MB limit)
    if (data.taskImages && data.taskImages.length > 0) {
        const totalSize = data.taskImages.reduce((sum, img) => sum + (img?.length || 0), 0);
        if (totalSize > 14 * 1024 * 1024) { // 14MB safety limit
            throw new Error("Total image size exceeds 14MB limit. Please compress images.");
        }
    }

    const updateData = { ...data };
    if (updateData.projectId === "none") updateData.projectId = undefined;
    if (updateData.milestoneId === "none") updateData.milestoneId = undefined;

    // Deadline Paradox. Task cannot exceed Project deadline.
    const effectiveProjectId = updateData.projectId || task.projectId;
    const newDeadline = updateData.deadline;

    if (effectiveProjectId && newDeadline) {
      const project = await Project.findById(effectiveProjectId).lean();
      if (project && (project as any).deadline && new Date(newDeadline) > new Date((project as any).deadline)) {
        throw new Error(`Task deadline (${new Date(newDeadline).toLocaleDateString()}) cannot exceed Project deadline (${new Date((project as any).deadline).toLocaleDateString()}).`);
      }
    }

    // Timer Cleanup. Stop timers for users who are being removed from the task
    if (data.assignedTo) {
      const assignedToIds = task.assignedTo.map(id => id.toString());
      const newAssignedToIds = (Array.isArray(data.assignedTo) ? data.assignedTo : [data.assignedTo]).map(id => id.toString());
      const removedUserIds = assignedToIds.filter(id => !newAssignedToIds.includes(id));
      
      for (const removedUserId of removedUserIds) {
        const activeTimer = await TaskTimer.findOne({ taskId, userId: removedUserId, endTime: null });
        if (activeTimer) {
          await this.stopTimer(activeTimer._id.toString(), removedUserId.toString(), "Auto-stopped due to task reassignment");
        }
      }
    }

    // Ripple Effect: If Task is COMPLETED, mark all Subtasks as COMPLETED and stop timers
    if (data.status === "COMPLETED") {
       await Subtask.updateMany({ taskId }, { $set: { isCompleted: true } });
       
       // Stop all active timers for this task
       const activeTimers = await TaskTimer.find({ taskId, endTime: null });
       for (const timer of activeTimers) {
           await this.stopTimer(timer._id.toString(), timer.userId.toString(), "Auto-stopped on task completion");
       }
    }

    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      {
        $set: {
          ...updateData,
          deadline: data.deadline ? new Date(data.deadline) : undefined,
        },
      },
      { new: true }
    )
      .populate("assignedTo", "id fullName email")
      .populate("assignedBy", "id fullName")
      .populate("projectId", "id name");

    // Notify assigned users and creator if status changed
    if (updatedTask && data.status && data.status !== (task as any).status) {
      try {
        const assignedTo = updatedTask.assignedTo as any[];
        const updater = await User.findById(userId);

        // Notify all current assignees
        for (const user of assignedTo) {
          if (!user) continue;
          const targetUserId = (user.id || user._id)?.toString();
          if (!targetUserId) continue;

          // Notify assignees (even if the updater is one of them)
          if (targetUserId !== userId.toString()) {
            const notificationType = data.status === "COMPLETED"
              ? NotificationType.TASK_COMPLETED
              : NotificationType.TASK_STATUS_UPDATED;

            await createNotification({
              userId: targetUserId,
              type: notificationType,
              title: "Task Status Updated",
              message: `Task "${updatedTask.title}" status changed to ${data.status.replace("_", " ")} by ${updater?.fullName || 'User'}`,
              link: `/tasks/${updatedTask._id}`,
            }).catch(e => console.error("Notification error:", e));
          }

          // Send email to assignees
          if (user.email) {
            await sendEmail({
              to: user.email,
              subject: "Task Status Updated",
              html: `<p>Hello ${user.fullName},</p>
                      <p>The status of the task <strong>${updatedTask.title}</strong> has been updated to <strong>${data.status.replace("_", " ")}</strong> by ${updater?.fullName || 'User'}.</p>`,
            }).catch(e => console.error("Email error:", e));
          }
        }

        // Notify the creator (manager) if they are not the updater
        const creatorId = (updatedTask.assignedBy as any)?._id || (updatedTask.assignedBy as any)?.id || updatedTask.assignedBy;
        if (creatorId && creatorId.toString() !== userId.toString()) {
          const notificationType = data.status === "COMPLETED"
            ? NotificationType.TASK_COMPLETED
            : NotificationType.TASK_STATUS_UPDATED;

          await createNotification({
            userId: creatorId.toString(),
            type: notificationType,
            title: "Task Status Updated",
            message: `Task "${updatedTask.title}" status changed to ${data.status.replace("_", " ")} by ${updater?.fullName || 'User'}`,
            link: `/tasks/${updatedTask._id}`,
          }).catch(e => console.error("Notification error:", e));
        }

        // Notify company admin when a task is COMPLETED
        if (data.status === "COMPLETED") {
          const companyEmailSetting = await Setting.findOne({ key: "companyEmail" });
          const adminNotificationEmail = companyEmailSetting?.value || process.env.EMAIL_FROM || "admin@printadel.com";

          await sendEmail({
            to: adminNotificationEmail,
            subject: `Task Completed: ${updatedTask.title}`,
            html: `
              <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
                <h2 style="color: #10b981;">Task Completed</h2>
                <p>The following task has been marked as <strong>COMPLETED</strong>:</p>
                <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 5px 0;"><strong>Task Title:</strong> ${updatedTask.title}</p>
                  <p style="margin: 5px 0;"><strong>Project:</strong> ${(updatedTask.projectId as any)?.name || 'N/A'}</p>
                  <p style="margin: 5px 0;"><strong>Completed By:</strong> ${updater?.fullName || 'User'}</p>
                  <p style="margin: 5px 0;"><strong>Completion Date:</strong> ${new Date().toLocaleString()}</p>
                </div>
                <p>Please review the task progress in the CRM.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 12px; color: #666;">This is an automated notification from Printadel CRM.</p>
              </div>
            `,
          }).catch(e => console.error("Completion email error:", e));
        }
      } catch (err) {
        console.error("Error sending status update notifications:", err);
      }
    }

    // Notify new assignees if assignedTo changed
    if (data.assignedTo) {
      const oldAssignedToIds = task.assignedTo.map(id => id.toString());
      const newAssignedToIds = Array.isArray(data.assignedTo) ? data.assignedTo : [data.assignedTo];

      const addedMemberIds = newAssignedToIds.filter(id => !oldAssignedToIds.includes(id));

      if (addedMemberIds.length > 0) {
        const updater = await User.findById(userId);
        // Notify new members (only those who weren't already assigned)
        const currentAssignees = task.assignedTo.map(a => a.toString());
        for (const mId of addedMemberIds) {
          if (!currentAssignees.includes(mId.toString()) && mId.toString() !== userId.toString()) {
            await createNotification({
              userId: mId,
              type: NotificationType.TASK_ASSIGNED,
              title: "New Task Assigned",
              message: `${updater?.fullName} assigned a task to you: ${updatedTask ? updatedTask.title : task.title}`,
              link: `/tasks/${taskId}`,
            });
          }
        }
      }
    }

    return updatedTask;
  },

  /**
   * Delete task
   */
  /**
   * Delete task
   */
  async deleteTask(taskId: string, userId: string, userUserRole: UserRole) {
    const task = await Task.findById(taskId);

    if (!task) {
      throw new Error("Task not found");
    }

    // Only creator, admin, or manager can delete
    const role = userUserRole ? userUserRole.toString().trim().toUpperCase() : "";
    if (role === "EMPLOYEE" && task.assignedBy.toString() !== userId) {
      throw new Error("You don't have permission to delete this task");
    }

    await Task.findByIdAndDelete(taskId);

    // Cleanup
    await TaskComment.deleteMany({ taskId });
    await Subtask.deleteMany({ taskId });
    await TaskTimer.deleteMany({ taskId });

    return { message: "Task deleted successfully" };
  },

  /**
   * Start task timer
   */
  /**
   * Start task timer
   */
  async startTimer(taskId: string, userId: string) {
    const task = await Task.findById(taskId);
    if (!task) throw new Error("Task not found");

    // Check if user is assigned to this task or is the creator
    // assignedTo is always an array in the schema
    const isAssigned = (task.assignedTo as mongoose.Types.ObjectId[]).some(
      (assignee) => assignee.toString() === userId
    );

    const isCreator = task.assignedBy?.toString() === userId;

    // Project State Lock. Cannot start timer if project is not active.
    // Fixed: Use already-imported Project model instead of require()
    if (task.projectId) {
        const project = await Project.findById(task.projectId).lean();
        if (project && ["COMPLETED", "ON_HOLD", "CANCELLED"].includes((project as any).status)) {
            throw new Error(`Cannot start work on this task because the parent project is ${(project as any).status}.`);
        }
    }

    if (!isAssigned && !isCreator) {
      throw new Error("You can only start timer for tasks assigned to you");
    }

    // Check if user is actually at work (Punched In)
    const today = new Date();
    const attendance = await Attendance.findOne({
      userId,
      date: { $gte: getISTStartOfDay(today), $lte: getISTEndOfDay(today) }
    });

    if (!attendance || !attendance.punchInTime || attendance.punchOutTime) {
      throw new Error("You must punch in for the day before starting a task timer.");
    }

    // Check if there's already an active timer for this task
    const activeTimer = await TaskTimer.findOne({
      taskId,
      userId,
      endTime: null,
    });

    if (activeTimer) {
      throw new Error("Timer is already running for this task");
    }

    const timer = await TaskTimer.create({
      taskId,
      userId,
      startTime: new Date(),
    });

    // Update task status to IN_PROGRESS if it's TO_DO
    if (task.status === "TO_DO") {
      await Task.findByIdAndUpdate(taskId, { status: "IN_PROGRESS" });
    }

    return timer;
  },

  /**
   * Stop task timer
   */
  async stopTimer(timerId: string, userId: string, notes?: string) {
    const existingTimer = await TaskTimer.findById(timerId).populate("taskId", "title");

    if (!existingTimer) {
      throw new Error("Timer not found");
    }

    if (existingTimer.userId.toString() !== userId) {
      throw new Error("You can only stop your own timers");
    }

    if (existingTimer.endTime) {
      throw new Error("Timer is already stopped");
    }

    const endTime = new Date();
    let totalPauseDuration = existingTimer.pauseDuration || 0;

    // If timer is currently paused, add the current pause duration
    if (existingTimer.pauseStartTime) {
      const currentPauseDuration = endTime.getTime() - new Date(existingTimer.pauseStartTime).getTime();
      totalPauseDuration += currentPauseDuration;
    }

    let durationSeconds =
      (endTime.getTime() - existingTimer.startTime.getTime() - totalPauseDuration) / 1000;

    // Safety Cap: Maximum 12 hours per single timer session (prevents 'forgotten timer' errors)
    // Fixed: Mark the timer as capped for audit trail instead of silently discarding time
    let wasCapped = false;
    if (durationSeconds > 12 * 3600) {
      console.warn(`[TimerCap] Timer ${timerId} for user ${userId} exceeded 12h (${(durationSeconds/3600).toFixed(2)}h). Capping at 12h.`);
      durationSeconds = 12 * 3600;
      wasCapped = true;
    }

    const timer = await TaskTimer.findByIdAndUpdate(
      timerId,
      {
        endTime: new Date(),
        durationSeconds: Math.max(0, durationSeconds),
        pauseDuration: totalPauseDuration,
        pauseStartTime: null, // Clear pause state
        notes,
        ...(wasCapped && { wasCapped: true }), // Audit flag for capped sessions
      },
      { new: true }
    ).populate("taskId", "title");

    if (!timer) {
      throw new Error("Timer not found after update");
    }

    // Calculate duration and update task actual hours
    // Recalculate total actual hours for the task
    const allTimers = await TaskTimer.find({
      taskId: timer.taskId,
      endTime: { $ne: null },
    });

    const totalHours = allTimers.reduce((sum, t) => sum + (t.durationSeconds || 0) / 3600, 0);

    await Task.findByIdAndUpdate(timer.taskId, { actualHours: totalHours });

    return timer;
  },

  /**
   * Pause task timer
   */
  /**
   * Pause task timer
   */
  async pauseTimer(timerId: string, userId: string) {
    const timer = await TaskTimer.findById(timerId);

    if (!timer) {
      throw new Error("Timer not found");
    }

    if (timer.userId.toString() !== userId) {
      throw new Error("You can only pause your own timers");
    }

    if (timer.endTime) {
      throw new Error("Timer is already stopped");
    }

    if (timer.pauseStartTime) {
      throw new Error("Timer is already paused");
    }

    // Set pause start time
    const updatedTimer = await TaskTimer.findByIdAndUpdate(
      timerId,
      {
        pauseStartTime: new Date(),
      },
      { new: true }
    );

    return updatedTimer;
  },

  /**
   * Resume task timer
   */
  /**
   * Resume task timer
   */
  async resumeTimer(timerId: string, userId: string) {
    const timer = await TaskTimer.findById(timerId);

    if (!timer) {
      throw new Error("Timer not found");
    }

    if (timer.userId.toString() !== userId) {
      throw new Error("You can only resume your own timers");
    }

    if (timer.endTime) {
      throw new Error("Timer is already stopped");
    }

    if (!timer.pauseStartTime) {
      throw new Error("Timer is not paused");
    }

    // Calculate how long the timer was paused (in milliseconds)
    const pauseEnd = new Date();
    const pauseStart = new Date(timer.pauseStartTime);
    const thisPauseDuration = pauseEnd.getTime() - pauseStart.getTime();

    // Add this pause duration to the total (in milliseconds)
    const totalPauseDuration = (timer.pauseDuration || 0) + thisPauseDuration;

    const updatedTimer = await TaskTimer.findByIdAndUpdate(
      timerId,
      {
        pauseDuration: totalPauseDuration,
        pauseStartTime: null,
      },
      { new: true }
    );

    // Attendance-Timer Handshake. Resuming a task timer should end any active attendance breaks.
    // Fixed: Use dynamic import at call-time to avoid circular dependency compile error.
    try {
        const attendanceService = await import("./attendance.service");
        await attendanceService.endBreak(userId);
    } catch (err) {
        // Ignore if no break is active — this is a best-effort handshake
    }

    return updatedTimer;
  },

  /**
   * Get active timer for user
   */
  /**
   * Get active timer for user
   */
  async getActiveTimer(userId: string) {
    const timer = await TaskTimer.findOne({
      userId,
      endTime: null,
    }).populate("taskId", "title status");

    return timer;
  },

  /**
   * Add comment to task
   */
  /**
   * Add comment to task
   */
  async addComment(taskId: string, userId: string, comment: string, isFeedback: boolean = false) {
    const task = await Task.findById(taskId);

    if (!task) {
      throw new Error("Task not found");
    }

    const newComment = await TaskComment.create({
      taskId,
      userId,
      commentText: comment,
      isFeedback,
    });

    const populatedComment = await newComment.populate("userId", "id fullName email");

    // Notify other side
    const updater = await User.findById(userId);
    const assignedBy = task.assignedBy.toString();
    const assignedTo = task.assignedTo.map(id => id.toString());

    // Broadcast Notifications. Notify EVERYONE involved in the task.
    const allInvolved = [...new Set([assignedBy, ...assignedTo])];
    
    for (const involvedId of allInvolved) {
        if (involvedId !== userId.toString()) {
            await createNotification({
                userId: involvedId,
                type: NotificationType.GENERAL,
                title: "New Task Comment",
                message: `${updater?.fullName}${userId.toString() === assignedBy ? " (Manager)" : ""} commented on task: ${task.title}`,
                link: `/tasks/${taskId}`,
            });
        }
    }

    return populatedComment;
  },

  /**
   * Create subtask
   */
  /**
   * Create subtask
   */
  async createSubtask(
    taskId: string,
    title: string,
    description: string | undefined,
    userId: string,
    userUserRole: string
  ) {
    const task = await Task.findById(taskId);

    if (!task) {
      throw new Error("Task not found");
    }

    // Permission check for subtasks
    const isAssigned = task.assignedTo.some((id: any) => id.toString() === userId);
    const isCreator = task.assignedBy.toString() === userId;
    if (!isAssigned && !isCreator && userUserRole !== "ADMIN") {
        throw new Error("You don't have permission to add subtasks to this task");
    }

    // Block creation on finished tasks
    if (["COMPLETED", "REJECTED"].includes(task.status)) {
        throw new Error("Cannot add subtasks to a completed or rejected task");
    }

    const subtask = await Subtask.create({
      taskId,
      title,
      description,
      isCompleted: false,
      createdBy: userId,
    });

    return subtask;
  },

  /**
   * Update subtask
   */
  /**
   * Update subtask
   */
  async updateSubtask(
    subtaskId: string,
    data: { title?: string; description?: string; isCompleted?: boolean },
    userId: string,
    userUserRole: string
  ) {
    const subtask = await Subtask.findById(subtaskId).populate("taskId");
    if (!subtask) throw new Error("Subtask not found");

    const task = subtask.taskId as any;
    if (!task) throw new Error("Parent task not found");

    // Permission check for subtask updates
    const isAssigned = task.assignedTo.some((id: any) => id.toString() === userId);
    const isCreator = task.assignedBy.toString() === userId;
    if (!isAssigned && !isCreator && userUserRole !== "ADMIN") {
        throw new Error("You don't have permission to update this subtask");
    }

    // Prevent updates on closed/rejected tasks
    if (["COMPLETED", "REJECTED"].includes(task.status)) {
        throw new Error("Cannot update subtasks of a completed or rejected task");
    }

    const updatedSubtask = await Subtask.findByIdAndUpdate(
      subtaskId,
      { $set: data },
      { new: true }
    );

    // Auto-complete Parent Task if all subtasks are finished
    if (data.isCompleted !== undefined) {
      const allSubtasks = await Subtask.find({ taskId: subtask.taskId });
      const allDone = allSubtasks.every(s => s.isCompleted);

      if (allDone && data.isCompleted === true) {
        // All done — auto-complete the parent task
        await Task.findByIdAndUpdate(subtask.taskId, { status: "COMPLETED" });

        // Notify manager
        const parentTask = await Task.findById(subtask.taskId);
        if (parentTask) {
          await createNotification({
            userId: parentTask.assignedBy.toString(),
            type: NotificationType.GENERAL,
            title: "Task Completed Automatically",
            message: `Task: ${parentTask.title} has been completed as all subtasks are finished.`,
            link: `/tasks/${parentTask._id}`,
          });
        }
      } else if (data.isCompleted === false) {
        // A subtask was UNCHECKED — if the parent was auto-completed, revert it back
        const parentTask = await Task.findById(subtask.taskId);
        if (parentTask && parentTask.status === "COMPLETED") {
          await Task.findByIdAndUpdate(subtask.taskId, { status: "IN_PROGRESS" });
          console.info(`[SubtaskRevert] Task ${subtask.taskId} reverted to IN_PROGRESS because a subtask was unchecked.`);
        }
      }
    }

    return updatedSubtask;
  },

  /**
   * Delete subtask
   */
  /**
   * Delete subtask
   */
  async deleteSubtask(subtaskId: string, userId: string, userUserRole: string) {
    const subtask = await Subtask.findById(subtaskId).populate("taskId");
    if (!subtask) throw new Error("Subtask not found");

    const task = subtask.taskId as any;
    if (task) {
        // Security check for deletion
        const isAssigned = task.assignedTo.some((id: any) => id.toString() === userId);
        const isCreator = task.assignedBy.toString() === userId;
        if (!isAssigned && !isCreator && userUserRole !== "ADMIN") {
            throw new Error("You don't have permission to delete this subtask");
        }

        if (["COMPLETED", "REJECTED"].includes(task.status)) {
            throw new Error("Cannot delete subtasks of a completed or rejected task");
        }
    }

    await Subtask.findByIdAndDelete(subtaskId);
    return { message: "Subtask deleted successfully" };
  },

  /**
   * Get task statistics
   */
  /**
   * Get task statistics
   */
  async getTaskStats(userId?: string, projectId?: string, userRole?: UserRole) {
    const baseFilters: any = {};
    const userObjectId = userId && mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : null;

    if (projectId && projectId !== "all" && projectId !== "none") {
      baseFilters.projectId = projectId;
    }

    // Standard visibility: Employees only see their own/assigned by default, admins/managers see all
    const visibilityFilters = { ...baseFilters };
    const role = userRole ? userRole.toString().trim().toUpperCase() : "";
    if (role === "EMPLOYEE" && userObjectId) {
      visibilityFilters.$or = [{ assignedTo: userObjectId }, { assignedBy: userObjectId }];
    } else if (role === "MANAGER" && userObjectId) {
        // Manager Privacy. Only show tasks in their department or where they are involved.
        const manager = await User.findById(userObjectId).select("department");
        const teamMemberIds = (await User.find({ 
            $or: [{ managerId: userObjectId }, { department: manager?.department }] 
        }).select("_id")).map(u => u._id);
        
        visibilityFilters.$or = [
            { assignedTo: { $in: teamMemberIds } },
            { assignedBy: userObjectId },
            { department: manager?.department }
        ];
    }

    const [
      totalTasks,
      todoTasks,
      inProgressTasks,
      completedTasks,
      highPriorityTasks,
    ] = await Promise.all([
      Task.countDocuments(visibilityFilters),
      Task.countDocuments({ ...visibilityFilters, status: "TO_DO" }),
      Task.countDocuments({ ...visibilityFilters, status: { $in: ["IN_PROGRESS", "UNDER_REVIEW"] } }),
      Task.countDocuments({ ...visibilityFilters, status: "COMPLETED" }),
      Task.countDocuments({ ...visibilityFilters, priority: { $in: ["HIGH", "URGENT"] } }),
    ]);

    // Explicitly handle self vs assigned tasks for the target user (if they exist)
    let selfTasks = 0;
    let assignedTasks = 0;

    if (userObjectId) {
      // "Self Tasks" = tasks assigned to the user AND created by the user
      selfTasks = await Task.countDocuments({
        ...baseFilters,
        assignedTo: userObjectId,
        assignedBy: userObjectId
      });

      // "Assigned Tasks" = tasks assigned to the user but NOT created by them
      assignedTasks = await Task.countDocuments({
        ...baseFilters,
        assignedTo: userObjectId,
        assignedBy: { $ne: userObjectId }
      });
    }

    return {
      totalTasks,
      todoTasks,
      inProgressTasks,
      completedTasks,
      highPriorityTasks,
      selfTasks,
      assignedTasks,
    };
  },

  /**
   * Get my tasks (for current user)
   */
  /**
   * Get my tasks (for current user)
   */
  async getMyTasks(userId: string) {
    const tasks = await Task.find({
      assignedTo: userId,
      status: { $ne: TaskStatus.COMPLETED },
    })
      .sort({ priority: -1, deadline: 1 })
      .limit(20)
      .populate("projectId", "id name code")
      .populate("milestoneId", "id title");

    // Manually add subtask count
    const enhancedTasks = await Promise.all(
      tasks.map(async (t) => {
        const subtaskCount = await Subtask.countDocuments({ taskId: t._id });
        return {
          ...t.toObject(),
          _count: { subtasks: subtaskCount }
        }
      })
    );

    return enhancedTasks;
  },
  /**
   * Report blocker on task
   */
  async reportBlocker(taskId: string, userId: string, reason: string) {
    const task = await Task.findById(taskId);
    if (!task) throw new Error("Task not found");

    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      {
        isBlocked: true,
        blockerReason: reason
      },
      { new: true }
    );

    // Add a comment about the blocker
    await this.addComment(taskId, userId, `🚩 Task marked as BLOCKED: ${reason}`, true);

    // Notify manager if exists
    const reporter = await User.findById(userId);
    if (reporter && reporter.managerId) {
      await createNotification({
        userId: reporter.managerId.toString(),
        type: NotificationType.TASK_BLOCKED,
        title: "Task Blocked",
        message: `${reporter.fullName} marked task "${task.title}" as blocked: ${reason}`,
        link: `/tasks/${taskId}`,
      });
    }

    return updatedTask;
  },

  /**
   * Resolve blocker on task
   */
  async resolveBlocker(taskId: string, userId: string) {
    const task = await Task.findById(taskId);
    if (!task) throw new Error("Task not found");

    const updatedTask = await Task.findByIdAndUpdate(
      taskId,
      {
        isBlocked: false,
        blockerReason: null
      },
      { new: true }
    );

    // Add a comment about the resolution
    await this.addComment(taskId, userId, `✅ Blocker resolved - Task is now unblocked`, true);

    // Notify manager if exists
    const resolver = await User.findById(userId);
    if (resolver && resolver.managerId) {
      await createNotification({
        userId: resolver.managerId.toString(),
        type: NotificationType.TASK_UNBLOCKED,
        title: "Blocker Resolved",
        message: `${resolver.fullName} resolved the blocker on task "${task.title}"`,
        link: `/tasks/${taskId}`,
      });
    }

    return updatedTask;
  },
};
