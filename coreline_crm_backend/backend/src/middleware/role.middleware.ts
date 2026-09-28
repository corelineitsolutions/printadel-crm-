import { Request, Response, NextFunction } from "express";
import { UserRole } from "../models/User";

/**
 * Role-Based Access Control Middleware
 * Checks if user has required role
 */

export function requireRoles(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    const userRole = req.user.role as UserRole;

    if (!allowedRoles.includes(userRole)) {
      res.status(403).json({
        success: false,
        message: "Access denied. Insufficient permissions.",
        requiredRoles: allowedRoles,
        userRole: userRole,
      });
      return;
    }

    next();
  };
}

// Convenience middleware for single role
export function requireRole(role: UserRole) {
  return requireRoles(role);
}

// Specific role middlewares
export const requireAdmin = requireRole(UserRole.ADMIN);
export const requireManager = requireRoles(UserRole.ADMIN, UserRole.MANAGER);
export const requireEmployee = requireRoles(UserRole.ADMIN, UserRole.MANAGER, UserRole.EMPLOYEE);
export const requireManagerOrAdmin = requireManager;
