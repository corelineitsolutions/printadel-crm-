import { Router } from "express";
import { taskController } from "../controllers/task.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

/**
 * Task Routes
 * All routes require authentication
 */

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @route   GET /api/tasks/stats
 * @desc    Get task statistics
 * @access  Private (All authenticated users)
 */
router.get("/stats", taskController.getStats);

/**
 * @route   GET /api/tasks/my-tasks
 * @desc    Get my tasks (current user)
 * @access  Private (All authenticated users)
 */
router.get("/my-tasks", taskController.getMyTasks);

/**
 * @route   GET /api/tasks/timer/active
 * @desc    Get active timer for current user
 * @access  Private (All authenticated users)
 */
router.get("/timer/active", taskController.getActiveTimer);

/**
 * @route   POST /api/tasks/timer/:timerId/stop
 * @desc    Stop task timer
 * @access  Private (Owner)
 */
router.post("/timer/:timerId/stop", taskController.stopTimer);

/**
 * @route   POST /api/tasks/timer/:timerId/pause
 * @desc    Pause task timer
 * @access  Private (Owner)
 */
router.post("/timer/:timerId/pause", taskController.pauseTimer);

/**
 * @route   POST /api/tasks/timer/:timerId/resume
 * @desc    Resume task timer
 * @access  Private (Owner)
 */
router.post("/timer/:timerId/resume", taskController.resumeTimer);

/**
 * @route   PUT /api/tasks/subtasks/:subtaskId
 * @desc    Update subtask
 * @access  Private (All authenticated users)
 */
router.put("/subtasks/:subtaskId", taskController.updateSubtask);

/**
 * @route   DELETE /api/tasks/subtasks/:subtaskId
 * @desc    Delete subtask
 * @access  Private (All authenticated users)
 */
router.delete("/subtasks/:subtaskId", taskController.deleteSubtask);

/**
 * @route   POST /api/tasks
 * @desc    Create a new task
 * @access  Private (All authenticated users)
 */
router.post("/", taskController.createTask);

/**
 * @route   GET /api/tasks
 * @desc    Get all tasks (role-filtered)
 * @access  Private (All authenticated users)
 */
router.get("/", taskController.getTasks);

/**
 * @route   GET /api/tasks/:id
 * @desc    Get task by ID
 * @access  Private (All authenticated users)
 */
router.get("/:id", taskController.getTaskById);

/**
 * @route   PUT /api/tasks/:id
 * @desc    Update task
 * @access  Private (All authenticated users)
 */
router.put("/:id", taskController.updateTask);

/**
 * @route   DELETE /api/tasks/:id
 * @desc    Delete task
 * @access  Private (All authenticated users)
 */
router.delete("/:id", taskController.deleteTask);

/**
 * @route   POST /api/tasks/:id/timer/start
 * @desc    Start task timer
 * @access  Private (Owner)
 */
router.post("/:id/timer/start", taskController.startTimer);

/**
 * @route   POST /api/tasks/:id/comments
 * @desc    Add comment to task
 * @access  Private (All authenticated users)
 */
router.post("/:id/comments", taskController.addComment);

/**
 * @route   POST /api/tasks/:id/subtasks
 * @desc    Create subtask
 * @access  Private (All authenticated users)
 */
router.post("/:id/subtasks", taskController.createSubtask);

/**
 * @route   POST /api/tasks/:id/block
 * @desc    Report task blocker
 * @access  Private (All authenticated users)
 */
router.post("/:id/block", taskController.reportBlocker);

/**
 * @route   POST /api/tasks/:id/unblock
 * @desc    Resolve task blocker
 * @access  Private (All authenticated users)
 */
router.post("/:id/unblock", taskController.resolveBlocker);

export default router;
