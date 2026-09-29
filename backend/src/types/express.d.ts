import { UserRole } from "../models/User";

/**
 * Express Type Definitions
 * Extends Express Request interface to include user data
 */

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        userId: string;
        email: string;
        role: UserRole;
      };
    }
  }
}
