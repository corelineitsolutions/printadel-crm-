import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { requireRoles } from "../middleware/role.middleware";
import { UserRole } from "../models/User";
import {
  getOffices,
  createOffice,
  updateOffice,
  deleteOffice,
} from "../controllers/office.controller";

/**
 * Office Routes
 * Base path: /api/offices
 */
const router = Router();

router.use(authenticate);

router.get("/", getOffices);
router.post("/", requireRoles(UserRole.ADMIN), createOffice);
router.put("/:id", requireRoles(UserRole.ADMIN), updateOffice);
router.delete("/:id", requireRoles(UserRole.ADMIN), deleteOffice);

export default router;
