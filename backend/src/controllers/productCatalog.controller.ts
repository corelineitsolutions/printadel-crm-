import { Request, Response } from "express";
import { z } from "zod";
import { productCatalogService } from "../services/productCatalog.service";
import { successResponse, errorResponse } from "../utils/response.utils";
import { CatalogOptionType, PricingUnit } from "../models/ProductCatalog";

const nameSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

const categoryUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
});

const subCategoryCreateSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
});

const subCategoryUpdateSchema = z.object({
  categoryId: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
});

const optionCreateSchema = z.object({
  type: z.nativeEnum(CatalogOptionType),
  name: z.string().trim().min(1).max(120),
});

const optionUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
});

const idList = z.array(z.string()).optional();

const productSchema = z.object({
  subcategoryId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  price: z.number().min(0),
  pricingUnit: z.nativeEnum(PricingUnit),
  specifications: idList,
  operations: idList,
  postOperations1: idList,
  postOperations2: idList,
  postOperations3: idList,
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

const fail = (res: Response, error: any, fallback: string) => {
  const message = error?.errors?.[0]?.message || error?.message || fallback;
  const status = /access|only/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400;
  return errorResponse(res, message, status);
};

// ---------- Categories ----------
export async function listCategories(req: Request, res: Response) {
  try {
    const activeOnly = req.query.activeOnly === "true";
    return successResponse(res, await productCatalogService.listCategories(activeOnly), "Categories retrieved");
  } catch (error: any) {
    return fail(res, error, "Failed to load categories");
  }
}

export async function createCategory(req: Request, res: Response) {
  try {
    const { name } = nameSchema.parse(req.body);
    return successResponse(res, await productCatalogService.createCategory(name, req.user!.id), "Category created", 201);
  } catch (error: any) {
    return fail(res, error, "Failed to create category");
  }
}

export async function updateCategory(req: Request, res: Response) {
  try {
    const data = categoryUpdateSchema.parse(req.body);
    return successResponse(res, await productCatalogService.updateCategory(String(req.params.id), data), "Category updated");
  } catch (error: any) {
    return fail(res, error, "Failed to update category");
  }
}

export async function deleteCategory(req: Request, res: Response) {
  try {
    return successResponse(res, await productCatalogService.deleteCategory(String(req.params.id)), "Category deleted");
  } catch (error: any) {
    return fail(res, error, "Failed to delete category");
  }
}

// ---------- Sub categories ----------
export async function listSubCategories(req: Request, res: Response) {
  try {
    const categoryId = req.query.categoryId as string | undefined;
    const activeOnly = req.query.activeOnly === "true";
    return successResponse(
      res,
      await productCatalogService.listSubCategories(categoryId, activeOnly),
      "Sub categories retrieved"
    );
  } catch (error: any) {
    return fail(res, error, "Failed to load sub categories");
  }
}

export async function createSubCategory(req: Request, res: Response) {
  try {
    const { categoryId, name } = subCategoryCreateSchema.parse(req.body);
    return successResponse(
      res,
      await productCatalogService.createSubCategory(categoryId, name, req.user!.id),
      "Sub category created",
      201
    );
  } catch (error: any) {
    return fail(res, error, "Failed to create sub category");
  }
}

export async function updateSubCategory(req: Request, res: Response) {
  try {
    const data = subCategoryUpdateSchema.parse(req.body);
    return successResponse(res, await productCatalogService.updateSubCategory(String(req.params.id), data), "Sub category updated");
  } catch (error: any) {
    return fail(res, error, "Failed to update sub category");
  }
}

export async function deleteSubCategory(req: Request, res: Response) {
  try {
    return successResponse(res, await productCatalogService.deleteSubCategory(String(req.params.id)), "Sub category deleted");
  } catch (error: any) {
    return fail(res, error, "Failed to delete sub category");
  }
}

// ---------- Options ----------
export async function listOptions(req: Request, res: Response) {
  try {
    const type = req.query.type as CatalogOptionType | undefined;
    if (type && !Object.values(CatalogOptionType).includes(type)) {
      return errorResponse(res, "Invalid option type", 400);
    }
    const activeOnly = req.query.activeOnly === "true";
    return successResponse(res, await productCatalogService.listOptions(type, activeOnly), "Options retrieved");
  } catch (error: any) {
    return fail(res, error, "Failed to load options");
  }
}

export async function createOption(req: Request, res: Response) {
  try {
    const { type, name } = optionCreateSchema.parse(req.body);
    return successResponse(res, await productCatalogService.createOption(type, name, req.user!.id), "Option created", 201);
  } catch (error: any) {
    return fail(res, error, "Failed to create option");
  }
}

export async function updateOption(req: Request, res: Response) {
  try {
    const data = optionUpdateSchema.parse(req.body);
    return successResponse(res, await productCatalogService.updateOption(String(req.params.id), data), "Option updated");
  } catch (error: any) {
    return fail(res, error, "Failed to update option");
  }
}

export async function deleteOption(req: Request, res: Response) {
  try {
    return successResponse(res, await productCatalogService.deleteOption(String(req.params.id)), "Option deleted");
  } catch (error: any) {
    return fail(res, error, "Failed to delete option");
  }
}

// ---------- Products ----------
export async function listProducts(req: Request, res: Response) {
  try {
    return successResponse(
      res,
      await productCatalogService.listProducts({
        subcategoryId: req.query.subcategoryId as string | undefined,
        categoryId: req.query.categoryId as string | undefined,
        search: req.query.search as string | undefined,
        activeOnly: req.query.activeOnly === "true",
      }),
      "Products retrieved"
    );
  } catch (error: any) {
    return fail(res, error, "Failed to load products");
  }
}

export async function getProductById(req: Request, res: Response) {
  try {
    return successResponse(res, await productCatalogService.getProductById(String(req.params.id)), "Product retrieved");
  } catch (error: any) {
    return fail(res, error, "Failed to load product");
  }
}

export async function createProduct(req: Request, res: Response) {
  try {
    const data = productSchema.parse(req.body);
    return successResponse(res, await productCatalogService.createProduct(data, req.user!.id), "Product created", 201);
  } catch (error: any) {
    return fail(res, error, "Failed to create product");
  }
}

export async function updateProduct(req: Request, res: Response) {
  try {
    const data = productSchema.partial().parse(req.body);
    return successResponse(res, await productCatalogService.updateProduct(String(req.params.id), data), "Product updated");
  } catch (error: any) {
    return fail(res, error, "Failed to update product");
  }
}

export async function deleteProduct(req: Request, res: Response) {
  try {
    return successResponse(res, await productCatalogService.deleteProduct(String(req.params.id)), "Product deleted");
  } catch (error: any) {
    return fail(res, error, "Failed to delete product");
  }
}
