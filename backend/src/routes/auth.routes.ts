import { Router } from "express";
import {
  login,
  logout,
  getProfile,
  changeUserPassword,
} from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth.middleware";

/**
 * Authentication Routes
 * /api/auth/*
 */

const router = Router();

// Public routes
router.post("/login", login);
router.post("/logout", logout);

// Protected routes (require authentication)
router.get("/profile", authenticate, getProfile);
router.post("/change-password", authenticate, changeUserPassword);

export default router;
