import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt.utils";
import { unauthorizedResponse } from "../utils/response.utils";
import User from "../models/User";

/**
 * Authentication Middleware
 * Verifies JWT token and attaches user to request
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      unauthorizedResponse(res, "No token provided");
      return;
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Verify token signature & expiry
    const decoded = verifyToken(token);

    // Live isActive check — prevents deactivated/fired users from accessing the system
    // even if their token has not expired yet.
    const user = await User.findById(decoded.userId).select("isActive role email").lean();
    if (!user) {
      unauthorizedResponse(res, "User account no longer exists");
      return;
    }
    if (!user.isActive) {
      unauthorizedResponse(res, "Your account has been deactivated. Please contact your administrator.");
      return;
    }

    // Attach user data to request
    req.user = {
      id: decoded.userId,
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role as any,
    };

    next();
  } catch (error) {
    unauthorizedResponse(res, "Invalid or expired token");
    return;
  }
}

/**
 * Optional Authentication Middleware
 * Attaches user if token exists, but doesn't require it
 */
export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const decoded = verifyToken(token);

      req.user = {
        id: decoded.userId,
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role as any,
      };
    }

    next();
  } catch (error) {
    // Continue without user if token is invalid
    next();
  }
}

/**
 * Role Authorization Middleware
 * Checks if user has required role
 */
export function authorize(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      unauthorizedResponse(res, "Not authenticated");
      return;
    }

    if (!roles.includes(req.user.role)) {
      unauthorizedResponse(res, "Not authorized to access this resource");
      return;
    }

    next();
  };
}

