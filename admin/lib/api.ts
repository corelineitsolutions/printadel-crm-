import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:7834";

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }),
  logout: () => api.post("/auth/logout"),
  getProfile: () => api.get("/auth/profile"),
  changePassword: (data: any) => api.post("/auth/change-password", data),
};

// Attendance API
export const attendanceAPI = {
  punchIn: (location: { lat: number; lng: number; accuracy?: number } | null, isWFH: boolean = false) =>
    api.post("/attendance/punch-in", { location, isWFH }),
  punchOut: (location: { lat: number; lng: number; accuracy?: number } | null, workSummary?: string, workImages?: string[]) =>
    api.post("/attendance/punch-out", { location, workSummary, workImages }),
  getNetworkStatus: () => api.get("/attendance/network-status"),
  startBreak: () => api.post("/attendance/start-break"),
  endBreak: () => api.post("/attendance/end-break"),
  getTodayAttendance: () => api.get("/attendance/today"),
  getMyAttendance: (month?: number, year?: number) =>
    api.get("/attendance/my-attendance", { params: { month, year } }),
  // Corrections
  requestCorrection: (data: {
    attendanceId?: string;
    date: string;
    reason: string;
    requestedPunchIn?: string;
    requestedPunchOut?: string;
  }) => api.post("/attendance/correction-request", data),
  getCorrections: (params?: { status?: string; userId?: string }) =>
    api.get("/attendance/corrections", { params }),
  approveCorrection: (id: string, data: { status: string; adminNotes?: string }) =>
    api.put(`/attendance/corrections/${id}`, data),
  // WFH
  assignWFH: (data: { userId: string; startDate: string; endDate: string; reason?: string }) =>
    api.post("/attendance/wfh", data),
  getWFHAssignments: (userId?: string) =>
    api.get("/attendance/wfh", { params: { userId } }),
  deactivateWFH: (id: string) =>
    api.delete(`/attendance/wfh/${id}`),
  updateStatus: (id: string, data: { status: string; date: string; userId: string }) =>
    api.patch(`/attendance/${id}/status`, data),
  getOvertime: (params?: { employeeId?: string; startDate?: string; endDate?: string; month?: number; year?: number }) =>
    api.get("/attendance/overtime", { params }),
};

// Employee API
export const employeeAPI = {
  getAllEmployees: (params?: {
    search?: string;
    department?: string;
    role?: string;
    employeeType?: string;
    isActive?: boolean;
    managerId?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }) => api.get("/employees", { params }),
  getEmployeeById: (id: string) => api.get(`/employees/${id}`),
  createEmployee: (data: {
    email: string;
    password: string;
    fullName: string;
    role: string;
    employeeType?: string;
    designation?: string;
    department?: string | null;
    phone?: string;
    address?: string;
    emergencyContact?: string;
    dateOfBirth?: string;
    joinDate?: string;
    managerId?: string | null;
    hourlyRate?: number;
    monthlySalary?: number | null;
    allowWorkFromHome?: boolean;
    isActive?: boolean;
  } | any) => api.post("/employees", data),
  updateEmployee: (id: string, data: any) => api.put(`/employees/${id}`, data),
  toggleEmployeeStatus: (id: string) => api.patch(`/employees/${id}/toggle-status`),
  deleteEmployee: (id: string) => api.delete(`/employees/${id}`),
  getAllDepartments: () => api.get("/employees/departments"),
  createDepartment: (name: string) => api.post("/employees/departments", { name }),
  getAllCustomRoles: () => api.get("/employees/roles"),
  createCustomRole: (data: { name: string; baseRole: "ADMIN" | "MANAGER" | "EMPLOYEE" }) =>
    api.post("/employees/roles", data),
  getAllManagers: () => api.get("/employees/managers"),
  uploadDocument: (documentType: "pan-card" | "aadhaar-card", image: string) =>
    api.post("/employees/documents", { documentType, image }),
  getDocumentUrl: (id: string, documentType: "pan-card" | "aadhaar-card") =>
    api.get(`/employees/${id}/documents/${documentType}`),
};


// Leave API
export const leaveAPI = {
  applyLeave: (data: {
    leaveType: string;
    startDate: string;
    endDate: string;
    isHalfDay?: boolean;
    reason: string;
  }) => api.post("/leaves", data),
  getMyLeaves: (params?: {
    userId?: string;
    status?: string;
    leaveType?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) => api.get("/leaves", { params }),
  getAllLeaves: (params?: {
    userId?: string;
    status?: string;
    leaveType?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) => api.get("/leaves", { params }),
  getLeaveById: (id: string) => api.get(`/leaves/${id}`),
  updateLeaveStatus: (
    id: string,
    data: { status: string; rejectionReason?: string }
  ) => api.patch(`/leaves/${id}/status`, data),
  cancelLeave: (id: string) => api.delete(`/leaves/${id}`),
  getMyLeaveBalance: (year?: number) =>
    api.get("/leaves/balance", { params: { year } }),
  getUserLeaveBalance: (userId: string, year?: number) =>
    api.get(`/leaves/balance/${userId}`, { params: { year } }),
  getLeaveStats: (userId?: string) =>
    api.get("/leaves/stats", { params: { userId } }),
};

// Project API
export const projectAPI = {
  createProject: (data: any) => api.post("/projects", data),
  getAllProjects: (params?: any) => api.get("/projects", { params }),
  getProjectById: (id: string) => api.get(`/projects/${id}`),
  updateProject: (id: string, data: any) => api.put(`/projects/${id}`, data),
  deleteProject: (id: string) => api.delete(`/projects/${id}`),
  addMembers: (id: string, memberIds: string[]) =>
    api.post(`/projects/${id}/members`, { memberIds }),
  removeMember: (id: string, memberId: string) =>
    api.delete(`/projects/${id}/members/${memberId}`),
  getProjectStats: (projectId?: string) =>
    api.get("/projects/stats", { params: { projectId } }),
};

// Payroll API
export const payrollAPI = {
  calculatePayroll: (userId: string, month: number, year: number) =>
    api.post("/payroll/calculate", { userId, month, year }),
  generatePayroll: (userId: string, month: number, year: number) =>
    api.post("/payroll/generate", { userId, month, year }),
  bulkGeneratePayroll: (month: number, year: number) =>
    api.post("/payroll/bulk-generate", { month, year }),
  processPayroll: (payrollId: string) =>
    api.post(`/payroll/${payrollId}/process`),
  markPayrollAsPaid: (payrollId: string) =>
    api.post(`/payroll/${payrollId}/mark-paid`),
  getPayrollById: (payrollId: string) =>
    api.get(`/payroll/${payrollId}`),
  getPayrolls: (params?: {
    month?: number;
    year?: number;
    status?: string;
    employeeId?: string;
  }) => api.get("/payroll", { params }),
  getStatistics: (month?: number, year?: number) =>
    api.get("/payroll/statistics", { params: { month, year } }),
  updateSalarySheet: (
    payrollId: string,
    data: { daysWorked?: number | null; advanceDeduction?: number; otherDeduction?: number }
  ) => api.patch(`/payroll/${payrollId}/salary-sheet`, data),
};

// Task API
export const taskAPI = {
  createTask: (data: any) => api.post("/tasks", data),
  getAllTasks: (params?: any) => api.get("/tasks", { params }),
  getMyTasks: () => api.get("/tasks/my-tasks"),
  getTaskById: (id: string) => api.get(`/tasks/${id}`),
  updateTask: (id: string, data: any) => api.put(`/tasks/${id}`, data),
  deleteTask: (id: string) => api.delete(`/tasks/${id}`),
  startTimer: (taskId: string) => api.post(`/tasks/${taskId}/timer/start`),
  stopTimer: (timerId: string) => api.post(`/tasks/timer/${timerId}/stop`),
  getActiveTimer: () => api.get("/tasks/timer/active"),
  addComment: (taskId: string, comment: string) =>
    api.post(`/tasks/${taskId}/comments`, { comment }),
  createSubtask: (taskId: string, data: { title: string; description?: string }) =>
    api.post(`/tasks/${taskId}/subtasks`, data),
  updateSubtask: (subtaskId: string, data: any) =>
    api.put(`/tasks/subtasks/${subtaskId}`, data),
  deleteSubtask: (subtaskId: string) => api.delete(`/tasks/subtasks/${subtaskId}`),
  getTaskStats: (userId?: string, projectId?: string) =>
    api.get("/tasks/stats", { params: { userId, projectId } }),
};

// Milestone API
export const milestoneAPI = {
  getMilestones: (params?: { projectId?: string; status?: string }) =>
    api.get("/milestones", { params }),
  getMilestoneById: (id: string) => api.get(`/milestones/${id}`),
};

// Notification API
export const notificationAPI = {
  getNotifications: (unreadOnly: boolean = false, limit: number = 20) =>
    api.get("/notifications", { params: { unreadOnly, limit } }),
  getUnreadCount: () => api.get("/notifications/unread-count"),
  markAsRead: (id: string) => api.post(`/notifications/${id}/mark-read`),
  markAllAsRead: () => api.post("/notifications/mark-all-read"),
  deleteNotification: (id: string) => api.delete(`/notifications/${id}`),
};

// Job Card API
export const jobCardAPI = {
  createJobCard: (data: any) => api.post("/job-cards", data),
  getAllJobCards: (params?: any) => api.get("/job-cards", { params }),
  getJobCardById: (id: string) => api.get(`/job-cards/${id}`),
  updateJobCard: (id: string, data: any) => api.put(`/job-cards/${id}`, data),
  updateJobCardStatus: (id: string, status: string, note?: string) =>
    api.patch(`/job-cards/${id}/status`, { status, note }),
  deleteJobCard: (id: string) => api.delete(`/job-cards/${id}`),
  getJobCardStats: () => api.get("/job-cards/stats"),
  getNextJobCardNumber: () => api.get("/job-cards/next-number"),
};

// Office API
export interface QuotationPayload {
  subject: string;
  clientName: string;
  clientCompany?: string;
  clientPhone?: string;
  clientEmail?: string;
  clientAddress?: string;
  items: { description: string; quantity: number; rate: number }[];
  discount?: number;
  gstPercent?: number;
  validUntil?: string | null;
  notes?: string;
  terms?: string;
  assignedTo?: string | null;
}

export const quotationAPI = {
  getQuotations: (params?: { status?: string; search?: string; assignedTo?: string }) =>
    api.get("/quotations", { params }),
  getQuotationById: (id: string) => api.get(`/quotations/${id}`),
  getNextNumber: () => api.get("/quotations/next-number"),
  getDesigners: () => api.get("/quotations/designers"),
  createQuotation: (data: QuotationPayload) => api.post("/quotations", data),
  updateQuotation: (id: string, data: Partial<QuotationPayload>) => api.put(`/quotations/${id}`, data),
  assignQuotation: (id: string, designerId: string | null) =>
    api.patch(`/quotations/${id}/assign`, { designerId }),
  updateStatus: (id: string, data: { status: string; screenshots?: string[]; note?: string }) =>
    api.patch(`/quotations/${id}/status`, data),
  deleteQuotation: (id: string) => api.delete(`/quotations/${id}`),
};

export const officeAPI = {
  getOffices: (params?: { activeOnly?: boolean }) => api.get("/offices", { params }),
  createOffice: (data: {
    name: string;
    address?: string | null;
    latitude: number;
    longitude: number;
    radiusMeters?: number;
    wifiIps?: string[];
    isActive?: boolean;
  }) => api.post("/offices", data),
  updateOffice: (id: string, data: any) => api.put(`/offices/${id}`, data),
  addCurrentWifiIp: (id: string) => api.post(`/offices/${id}/wifi-ips/current`),
  deleteOffice: (id: string) => api.delete(`/offices/${id}`),
};

// Productivity API
export const productivityAPI = {
  logActivity: (data: {
    jobCardId?: string;
    activityType: string;
    durationMinutes?: number;
    notes?: string;
    isLogoutSession?: boolean;
  }) => api.post("/productivity/log", data),
  logActivities: (data: {
    entries: { jobCardId?: string; activityType: string; durationMinutes?: number }[];
    notes?: string;
    isLogoutSession?: boolean;
  }) => api.post("/productivity/log-batch", data),
  getMyLogs: (params?: any) => api.get("/productivity/my-logs", { params }),
  getAllLogs: (params?: any) => api.get("/productivity/all", { params }),
  getStats: (params?: any) => api.get("/productivity/stats", { params }),
  getActivityTypes: () => api.get("/productivity/activity-types"),
};

export default api;
