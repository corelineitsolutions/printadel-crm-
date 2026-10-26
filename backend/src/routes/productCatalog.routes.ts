import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware";
import { requireRoles } from "../middleware/role.middleware";
import { UserRole } from "../models/User";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listSubCategories,
  createSubCategory,
  updateSubCategory,
  deleteSubCategory,
  listOptions,
  createOption,
  updateOption,
  deleteOption,
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../controllers/productCatalog.controller";

/**
 * Product Catalog Routes
 * Base path: /api/products
 *
 * Manages categories, sub categories, reusable options
 * (specification / operation / post operations) and products.
 */
const router = Router();

router.use(authenticate);

const canManage = requireRoles(UserRole.ADMIN, UserRole.MANAGER);

// Categories
router.get("/categories", listCategories);
router.post("/categories", canManage, createCategory);
router.put("/categories/:id", canManage, updateCategory);
router.delete("/categories/:id", requireRoles(UserRole.ADMIN), deleteCategory);

// Sub categories
router.get("/subcategories", listSubCategories);
router.post("/subcategories", canManage, createSubCategory);
router.put("/subcategories/:id", canManage, updateSubCategory);
router.delete("/subcategories/:id", requireRoles(UserRole.ADMIN), deleteSubCategory);

// Spec / operation / post-operation options
router.get("/options", listOptions);
router.post("/options", canManage, createOption);
router.put("/options/:id", canManage, updateOption);
router.delete("/options/:id", requireRoles(UserRole.ADMIN), deleteOption);

// Products
router.get("/", listProducts);
router.get("/:id", getProductById);
router.post("/", canManage, createProduct);
router.put("/:id", canManage, updateProduct);
router.delete("/:id", requireRoles(UserRole.ADMIN), deleteProduct);

export default router;
