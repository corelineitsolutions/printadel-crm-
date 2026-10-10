import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { requireRoles } from "../middleware/role.middleware";
import { UserRole } from "../models/User";
import {
  getNextFormNumber,
  getOrderForms,
  getOrderFormById,
  createOrderForm,
  updateOrderForm,
  convertOrderForm,
  deleteOrderForm,
} from "../controllers/orderForm.controller";

/**
 * Order Form Routes
 * Base path: /api/order-forms
 */
const router = Router();

router.use(authenticate);

router.get("/", getOrderForms);
router.get("/next-number", getNextFormNumber);
router.get("/:id", getOrderFormById);
router.post("/", createOrderForm);
router.put("/:id", updateOrderForm);
router.post("/:id/convert", convertOrderForm);
router.delete("/:id", requireRoles(UserRole.ADMIN), deleteOrderForm);

export default router;
