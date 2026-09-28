import { Request, Response } from "express";
import { loginUser, getUserProfile, changePassword } from "../services/auth.service";
import { successResponse, errorResponse } from "../utils/response.utils";
import { z } from "zod";

/**
 * Authentication Controller
 * Handles authentication-related HTTP requests
 */

// ==================== Validation Schemas ====================

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const changePasswordSchema = z.object({
  oldPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

// ==================== Controllers ====================

/**
 * POST /api/auth/login
 * Login user
 */
export async function login(req: Request, res: Response) {
  try {
    // Validate request body
    const { email, password } = loginSchema.parse(req.body);
    
    // Authenticate user
    const result = await loginUser(email, password);
    
    return successResponse(res, result, "Login successful", 200);
  } catch (error: any) {
    return errorResponse(res, error.message, 401);
  }
}

/**
 * POST /api/auth/logout
 * Logout user (client-side token removal)
 */
export async function logout(_req: Request, res: Response) {
  try {
    // Note: JWT logout is handled client-side by removing the token
    // This endpoint is here for consistency and future session management
    return successResponse(res, null, "Logout successful", 200);
  } catch (error: any) {
    return errorResponse(res, error.message);
  }
}

/**
 * GET /api/auth/profile
 * Get current user profile
 */
export async function getProfile(req: Request, res: Response) {
  try {
    if (!req.user) {
      return errorResponse(res, "User not authenticated", 401);
    }
    
    const profile = await getUserProfile(req.user.userId);
    
    return successResponse(res, profile, "Profile retrieved successfully");
  } catch (error: any) {
    return errorResponse(res, error.message);
  }
}

/**
 * POST /api/auth/change-password
 * Change user password
 */
export async function changeUserPassword(req: Request, res: Response) {
  try {
    if (!req.user) {
      return errorResponse(res, "User not authenticated", 401);
    }
    
    // Validate request body
    const { oldPassword, newPassword } = changePasswordSchema.parse(req.body);
    
    // Change password
    await changePassword(req.user.userId, oldPassword, newPassword);
    
    return successResponse(res, null, "Password changed successfully");
  } catch (error: any) {
    return errorResponse(res, error.message, 400);
  }
}
