import mongoose from "mongoose";
import Project, { ProjectStatus } from "../models/Project";
import ProjectMember from "../models/ProjectMember";
import { UserRole } from "../models/User";
import Task from "../models/Task";
import Milestone from "../models/Milestone";
import Subtask from "../models/Subtask";
import TaskTimer from "../models/TaskTimer";
import { createNotification } from "./notification.service";
import { NotificationType } from "../models/Notification";

/**
 * Project Service
 * Handles all project-related business logic
 */

interface CreateProjectData {
  name: string;
  code: string;
  description?: string;
  requirements?: string;
  clientName?: string;
  startDate?: Date;
  deadline?: Date;
  budget?: number;
  createdBy: string;
  memberIds?: string[];
}

interface UpdateProjectData {
  name?: string;
  description?: string;
  requirements?: string;
  clientName?: string;
  startDate?: Date;
  deadline?: Date;
  budget?: number;
  status?: ProjectStatus;
  memberIds?: string[];
}

interface GetProjectsFilters {
  status?: ProjectStatus;
  search?: string;
  createdBy?: string;
  memberId?: string;
  page?: number;
  limit?: number;
}

export const projectService = {
  /**
   * Create a new project
   */
  async createProject(data: CreateProjectData) {
    const { memberIds, ...projectData } = data;

    // Check if code already exists
    const existingProject = await Project.findOne({ code: data.code });

    if (existingProject) {
      throw new Error("Project code already exists");
    }

    if (data.startDate && data.deadline && new Date(data.deadline) < new Date(data.startDate)) {
      throw new Error("Project deadline cannot be before the start date");
    }

    // Create project
    const project = await Project.create({
      ...projectData,
      creator: data.createdBy, // Mapping createdBy to creator
      startDate: data.startDate ? new Date(data.startDate) : undefined,
      deadline: data.deadline ? new Date(data.deadline) : undefined,
    });

    // Create members if any
    if (memberIds && memberIds.length > 0) {
      await ProjectMember.insertMany(
        memberIds.map((userId) => ({
          projectId: project._id,
          userId,
          role: "Developer",
        }))
      );
    }

    // Fetch created project with details to return
    const createdProject = await Project.findById(project._id).populate(
      "creator",
      "id fullName email"
    );

    // Manually fetch members since we don't have virtuals set up yet mostly
    const members = await ProjectMember.find({ projectId: project._id }).populate(
      "user",
      "id fullName email employeeId designation"
    );

    const [milestoneCount, taskCount] = await Promise.all([
      Milestone.countDocuments({ projectId: project._id }),
      Task.countDocuments({ projectId: project._id }),
    ]);

    // Notify members
    if (memberIds && memberIds.length > 0) {
      for (const mId of memberIds) {
        if (mId.toString() !== data.createdBy.toString()) {
          await createNotification({
            userId: mId,
            type: NotificationType.PROJECT_ASSIGNED,
            title: "New Project Assigned",
            message: `You have been assigned to project: ${project.name}`,
            link: `/projects/${project._id}`,
          });
        }
      }
    }

    return {
      ...createdProject?.toObject(),
      members,
      _count: {
        tasks: taskCount,
        milestones: milestoneCount,
      },
    };
  },

  /**
   * Get all projects with filters
   */
  async getProjects(filters: GetProjectsFilters, userId: string, userUserRole: UserRole) {
    const {
      status,
      search,
      createdBy,
      memberId,
      page = 1,
      limit = 20,
    } = filters;

    const skip = (page - 1) * limit;
    const where: any = {};

    // UserRole-based filtering logic
    const role = userUserRole ? userUserRole.toString().trim().toUpperCase() : "";

    if (role === "EMPLOYEE") {
      // Find projects where user is a member
      const memberships = await ProjectMember.find({ userId: new mongoose.Types.ObjectId(userId) }).select("projectId");
      const pIds = memberships.map((m) => m.projectId);
      where._id = { $in: pIds };
    } else if (role === "MANAGER" && memberId) {
      // For managers, if memberId is provided, filter by that member's projects
      const memberships = await ProjectMember.find({ userId: new mongoose.Types.ObjectId(memberId) }).select(
        "projectId"
      );
      const pIds = memberships.map((m) => m.projectId);
      where._id = { $in: pIds };
    }
    // Note: ADMIN and MANAGER (without memberId) can see all projects

    // Apply other filters
    if (status) where.status = status;
    if (createdBy) where.creator = createdBy;
    if (search) {
      where.$or = [
        { name: { $regex: search, $options: "i" } },
        { code: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const projectsQuery = Project.find(where)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("creator", "id fullName email");

    const [projects, total] = await Promise.all([
      projectsQuery.lean(),
      Project.countDocuments(where),
    ]);

    const projectIds = projects.map(p => p._id);

    // Bulk fetch related data to avoid N+1 queries
    const [allMembers, taskCounts, milestoneCounts] = await Promise.all([
      ProjectMember.find({ projectId: { $in: projectIds } })
        .populate("user", "id fullName email employeeId designation department")
        .lean(),
      Task.aggregate([
        { $match: { projectId: { $in: projectIds } } },
        { $group: { _id: "$projectId", count: { $sum: 1 } } }
      ]),
      Milestone.aggregate([
        { $match: { projectId: { $in: projectIds } } },
        { $group: { _id: "$projectId", count: { $sum: 1 } } }
      ])
    ]);

    // Map data for fast lookup
    const memberMap = new Map();
    allMembers.forEach(m => {
      const pid = m.projectId.toString();
      if (!memberMap.has(pid)) memberMap.set(pid, []);
      memberMap.get(pid).push(m);
    });

    const taskCountMap = new Map(taskCounts.map(t => [t._id.toString(), t.count]));
    const milestoneCountMap = new Map(milestoneCounts.map(m => [m._id.toString(), m.count]));

    const enhancedProjects = projects.map((p: any) => ({
      ...p,
      members: memberMap.get(p._id.toString()) || [],
      _count: {
        tasks: taskCountMap.get(p._id.toString()) || 0,
        milestones: milestoneCountMap.get(p._id.toString()) || 0,
      },
    }));

    return {
      projects: enhancedProjects,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get project by ID
   */
  async getProjectById(projectId: string, userId: string, userUserRole: UserRole) {
    const project = await Project.findById(projectId).populate(
      "creator",
      "id fullName email"
    );

    if (!project) {
      throw new Error("Project not found");
    }

    // Fetch members first to check permissions
    const members = await ProjectMember.find({ projectId }).populate(
      "user",
      "id fullName email employeeId designation department"
    );

    // Check permissions early before heavy querying
    const role = userUserRole ? userUserRole.toString().trim().toUpperCase() : "";
    if (role === "EMPLOYEE") {
      const isMember = members.some((m) => m.userId.toString() === userId);
      if (!isMember) {
        throw new Error("You don't have access to this project");
      }
    }

    // Now fetch related data only for authorized users
    const milestones = await Milestone.find({ projectId })
      .sort({ deadline: 1 })
      .lean();

    // Enhance milestones with task counts
    const enhancedMilestones = await Promise.all(
      milestones.map(async (m: any) => {
        const tCount = await Task.countDocuments({ milestoneId: m._id });
        return { ...m, _count: { tasks: tCount } };
      })
    );

    const tasks = await Task.find({ projectId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("assignedTo", "id fullName");

    const taskCount = await Task.countDocuments({ projectId });
    const milestoneCount = await Milestone.countDocuments({ projectId });

    return {
      ...project.toObject(),
      members,
      milestones: enhancedMilestones,
      tasks,
      _count: {
        tasks: taskCount,
        milestones: milestoneCount,
      },
    };
  },

  /**
   * Update project
   */
  async updateProject(
    projectId: string,
    data: UpdateProjectData,
    userId: string,
    userUserRole: UserRole
  ) {
    const project = await Project.findById(projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    // Also check if updated deadline is before existing startDate
    const projectStartDate = data.startDate ? new Date(data.startDate) : new Date(project.startDate || 0);
    const newDeadline = data.deadline ? new Date(data.deadline) : (project.deadline ? new Date(project.deadline) : null);

    if (newDeadline && newDeadline < projectStartDate) {
      throw new Error("Project deadline cannot be before the start date");
    }

    // NEW: Check if any existing tasks/milestones exceed the NEW project deadline
    if (data.deadline) {
      const latestTask = await Task.findOne({ projectId }).sort({ deadline: -1 });
      if (latestTask && latestTask.deadline && new Date(latestTask.deadline) > new Date(data.deadline)) {
        throw new Error(`Cannot move project deadline to ${new Date(data.deadline).toLocaleDateString()} because Task "${latestTask.title}" has a later deadline of ${new Date(latestTask.deadline).toLocaleDateString()}.`);
      }

      // Note: Milestone uses 'dueDate', not 'deadline'
      const latestMilestone = await Milestone.findOne({ projectId }).sort({ dueDate: -1 });
      if (latestMilestone && latestMilestone.dueDate && new Date(latestMilestone.dueDate) > new Date(data.deadline)) {
        throw new Error(`Cannot move project deadline to ${new Date(data.deadline).toLocaleDateString()} because Milestone "${latestMilestone.title}" has a later due date of ${new Date(latestMilestone.dueDate).toLocaleDateString()}.`);
      }
    }

    // Check permissions (only creator, manager, or admin can update)
    const role = userUserRole ? userUserRole.toString().trim().toUpperCase() : "";
    if (
      role === "EMPLOYEE" ||
      (role === "MANAGER" && project.creator.toString() !== userId)
    ) {
      throw new Error("You don't have permission to update this project");
    }

    const { memberIds, ...updateFields } = data;

    const updatedProject = await Project.findByIdAndUpdate(
      projectId,
      {
        $set: {
          ...updateFields,
          startDate: data.startDate ? new Date(data.startDate) : undefined,
          deadline: data.deadline ? new Date(data.deadline) : undefined,
        },
      },
      { new: true }
    ).populate("creator", "id fullName email");

    // Sync Members
    if (data.memberIds) {
      // Get current members
      const currentMembers = await ProjectMember.find({ projectId });
      const currentMemberIds = currentMembers.map((m) => m.userId.toString());

      // Members to add
      const membersToAdd = data.memberIds.filter(
        (id) => !currentMemberIds.includes(id)
      );

      // Members to remove
      const membersToRemove = currentMemberIds.filter(
        (id) => !data.memberIds!.includes(id)
      );

      // Execute additions
      if (membersToAdd.length > 0) {
        await ProjectMember.insertMany(
          membersToAdd.map((uId) => ({
            projectId,
            userId: uId,
            role: "Developer",
          }))
        );

        // Notify new members
        for (const mId of membersToAdd) {
          if (mId.toString() !== userId.toString()) {
            await createNotification({
              userId: mId,
              type: NotificationType.PROJECT_ASSIGNED,
              title: "New Project Assigned",
              message: `You have been assigned to project: ${project.name}`,
              link: `/projects/${projectId}`,
            });
          }
        }
      }

      // Execute removals
      if (membersToRemove.length > 0) {
        await ProjectMember.deleteMany({
          projectId,
          userId: { $in: membersToRemove },
        });
      }
    }

    // Ripple Effect: If Project is NOT Active, stop all timers for its tasks to prevent unearned overtime
    if (updatedProject && data.status && ["COMPLETED", "CANCELLED", "ON_HOLD"].includes(data.status)) {
      const projectTasks = await Task.find({ projectId: project._id }).select("_id");
      const projectTaskIds = projectTasks.map(t => t._id);

      const activeTimers = await TaskTimer.find({
        taskId: { $in: projectTaskIds },
        endTime: null
      });

      for (const timer of activeTimers) {
        const endTime = new Date();
        const durationSeconds = (endTime.getTime() - new Date(timer.startTime).getTime()) / 1000;

        await TaskTimer.findByIdAndUpdate(timer._id, {
          endTime,
          durationSeconds: Math.max(0, durationSeconds),
          notes: `Auto-stopped: Project marked as ${data.status}`
        });
      }
    }

    // Fetch members for return
    const members = await ProjectMember.find({ projectId }).populate(
      "user",
      "id fullName email"
    );

    return {
      ...updatedProject?.toObject(),
      members,
    };
  },

  /**
   * Delete project
   */
  async deleteProject(projectId: string, userId: string, userUserRole: UserRole) {
    const project = await Project.findById(projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    // Only creator or admin can delete
    if (
      userUserRole !== "ADMIN" &&
      project.creator.toString() !== userId
    ) {
      throw new Error("You don't have permission to delete this project");
    }

    // Delete related items (Deep Cascade Cleanup)
    const taskIds = (await Task.find({ projectId })).map(t => t._id);
    await Subtask.deleteMany({ taskId: { $in: taskIds } });

    // Task Timers are PRESERVED (not deleted) for labor audit and salary verification.
    await TaskTimer.updateMany({ taskId: { $in: taskIds } }, { $set: { note: `Project "${project.name}" deleted. Work proof preserved.` } });

    await Task.deleteMany({ projectId });
    await Milestone.deleteMany({ projectId });
    await ProjectMember.deleteMany({ projectId });

    // Delete project itself
    await Project.findByIdAndDelete(projectId);

    return { message: "Project deleted successfully" };
  },

  /**
   * Add members to project
   */
  async addProjectMembers(
    projectId: string,
    memberIds: string[],
    userId: string,
    userUserRole: UserRole
  ) {
    const project = await Project.findById(projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    // Check permissions
    const role = userUserRole ? userUserRole.toString().trim().toUpperCase() : "";
    if (
      role === "EMPLOYEE" ||
      (role === "MANAGER" && project.creator.toString() !== userId)
    ) {
      throw new Error("You don't have permission to add members");
    }

    // Get existing members
    const existingMembers = await ProjectMember.find({
      projectId,
      userId: { $in: memberIds },
    });

    const existingMemberIds = existingMembers.map((m) => m.userId.toString());
    const newMemberIds = memberIds.filter(
      (id) => !existingMemberIds.includes(id)
    );

    if (newMemberIds.length === 0) {
      throw new Error("All users are already members of this project");
    }

    await ProjectMember.insertMany(
      newMemberIds.map((userId) => ({
        projectId,
        userId,
        role: "Developer",
      }))
    );

    // Notify new members
    for (const mId of newMemberIds) {
      await createNotification({
        userId: mId,
        type: NotificationType.PROJECT_ASSIGNED,
        title: "New Project Assigned",
        message: `You have been assigned to project: ${project.name}`,
        link: `/projects/${project._id}`,
      });
    }

    return await this.getProjectById(projectId, userId, userUserRole);
  },

  /**
   * Remove member from project
   */
  async removeProjectMember(
    projectId: string,
    memberId: string,
    userId: string,
    userUserRole: UserRole
  ) {
    const project = await Project.findById(projectId);

    if (!project) {
      throw new Error("Project not found");
    }

    // Check permissions
    const role = userUserRole ? userUserRole.toString().trim().toUpperCase() : "";
    if (
      role === "EMPLOYEE" ||
      (role === "MANAGER" && project.creator.toString() !== userId)
    ) {
      throw new Error("You don't have permission to remove members");
    }

    await ProjectMember.findOneAndDelete({
      projectId,
      userId: memberId,
    });

    // Auto-unassign member from all tasks in this project (prevent zombie tasks)
    await Task.updateMany(
      { projectId, assignedTo: memberId },
      { $pull: { assignedTo: memberId } }
    );

    // Notify removed member
    await createNotification({
      userId: memberId,
      type: NotificationType.GENERAL,
      title: "Removed from Project",
      message: `You have been removed from project: ${project.name}`,
    });

    return await this.getProjectById(projectId, userId, userUserRole);
  },

  /**
   * Get project statistics
   */
  async getProjectStats(userId?: string, userRole?: UserRole, projectId?: string) {
    const where: any = projectId ? { _id: projectId } : {};

    const role = userRole ? userRole.toString().trim().toUpperCase() : "";

    if (role === "EMPLOYEE" && userId) {
      const memberships = await ProjectMember.find({ userId: new mongoose.Types.ObjectId(userId) }).select("projectId");
      const pIds = memberships.map((m) => m.projectId);
      where._id = { $in: pIds };
    }

    const [
      totalProjects,
      activeProjects,
      completedProjects,
      onHoldProjects,
    ] = await Promise.all([
      Project.countDocuments(where),
      Project.countDocuments({ ...where, status: "IN_PROGRESS" }),
      Project.countDocuments({ ...where, status: "COMPLETED" }),
      Project.countDocuments({ ...where, status: "ON_HOLD" }),
    ]);

    return {
      totalProjects,
      activeProjects,
      completedProjects,
      onHoldProjects,
    };
  },
};
