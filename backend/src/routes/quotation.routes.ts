import { Router } from "express";
import {
  assignQuotation,
  createQuotation,
  deleteQuotation,
  getDesigners,
  getNextQuotationNumber,
  getQuotationById,
  getQuotations,
  updateQuotation,
  updateQuotationStatus,
} from "../controllers/quotation.controller";
import { authenticate } from "../middleware/auth.middleware";
import { requireRoles } from "../middleware/role.middleware";
import { UserRole } from "../models/User";

const router = Router();
const adminOnly = requireRoles(UserRole.ADMIN);

router.use(authenticate);

router.get("/", getQuotations);
router.get("/next-number", getNextQuotationNumber);
router.get("/designers", adminOnly, getDesigners);
router.get("/:id", getQuotationById);

router.post("/", createQuotation);
router.put("/:id", updateQuotation);
router.patch("/:id/status", updateQuotationStatus);
router.patch("/:id/assign", adminOnly, assignQuotation);
router.delete("/:id", adminOnly, deleteQuotation);

export default router;
