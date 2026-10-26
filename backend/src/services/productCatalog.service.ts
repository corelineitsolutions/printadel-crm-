import mongoose from "mongoose";
import {
  ProductCategory,
  ProductSubCategory,
  CatalogOption,
  Product,
  CatalogOptionType,
  PricingUnit,
} from "../models/ProductCatalog";

function isDuplicateKeyError(error: any) {
  return error?.code === 11000;
}

function toDoc(doc: any) {
  if (!doc) return doc;
  const obj = doc.toObject ? doc.toObject({ virtuals: true }) : { ...doc };
  obj.id = String(obj._id);
  return obj;
}

function normalizeName(name: string) {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length < 1 || trimmed.length > 120) {
    throw new Error("Name must be between 1 and 120 characters");
  }
  return trimmed;
}

async function assertCategory(categoryId: string) {
  if (!mongoose.Types.ObjectId.isValid(categoryId)) throw new Error("Category not found");
  const category = await ProductCategory.findById(categoryId);
  if (!category) throw new Error("Category not found");
  return category;
}

async function assertSubCategory(subcategoryId: string) {
  if (!mongoose.Types.ObjectId.isValid(subcategoryId)) throw new Error("Sub category not found");
  const subcategory = await ProductSubCategory.findById(subcategoryId);
  if (!subcategory) throw new Error("Sub category not found");
  return subcategory;
}

async function resolveOptionIds(type: CatalogOptionType, ids: string[] | undefined) {
  if (!ids?.length) return [] as mongoose.Types.ObjectId[];
  const unique = Array.from(new Set(ids.filter((id) => mongoose.Types.ObjectId.isValid(id))));
  if (!unique.length) return [];
  const options = await CatalogOption.find({
    _id: { $in: unique },
    type,
    isActive: true,
  }).select("_id");
  if (options.length !== unique.length) {
    throw new Error(`One or more ${type.replace(/_/g, " ").toLowerCase()} options are invalid`);
  }
  return options.map((o) => o._id as mongoose.Types.ObjectId);
}

const OPTION_FIELDS = [
  { key: "specifications", type: CatalogOptionType.SPECIFICATION },
  { key: "operations", type: CatalogOptionType.OPERATION },
  { key: "postOperations1", type: CatalogOptionType.POST_OPERATION_1 },
  { key: "postOperations2", type: CatalogOptionType.POST_OPERATION_2 },
  { key: "postOperations3", type: CatalogOptionType.POST_OPERATION_3 },
] as const;

export const productCatalogService = {
  // ---------- Categories ----------
  async listCategories(activeOnly = false) {
    const query = activeOnly ? { isActive: true } : {};
    const categories = await ProductCategory.find(query).sort({ name: 1 });
    const counts = await ProductSubCategory.aggregate([
      { $group: { _id: "$categoryId", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
    return categories.map((c) => ({
      ...toDoc(c),
      subcategoryCount: countMap.get(String(c._id)) || 0,
    }));
  },

  async createCategory(name: string, createdBy: string) {
    try {
      return toDoc(await ProductCategory.create({ name: normalizeName(name), createdBy }));
    } catch (error: any) {
      if (isDuplicateKeyError(error)) throw new Error("A category with this name already exists");
      throw error;
    }
  },

  async updateCategory(id: string, data: { name?: string; isActive?: boolean }) {
    const category = await ProductCategory.findById(id);
    if (!category) throw new Error("Category not found");
    if (data.name !== undefined) category.name = normalizeName(data.name);
    if (data.isActive !== undefined) category.isActive = data.isActive;
    try {
      return toDoc(await category.save());
    } catch (error: any) {
      if (isDuplicateKeyError(error)) throw new Error("A category with this name already exists");
      throw error;
    }
  },

  async deleteCategory(id: string) {
    const subCount = await ProductSubCategory.countDocuments({ categoryId: id });
    if (subCount > 0) {
      throw new Error(`This category has ${subCount} sub categor${subCount === 1 ? "y" : "ies"}. Delete or move them first.`);
    }
    const deleted = await ProductCategory.findByIdAndDelete(id);
    if (!deleted) throw new Error("Category not found");
    return { id };
  },

  // ---------- Sub categories ----------
  async listSubCategories(categoryId?: string, activeOnly = false) {
    const query: any = {};
    if (categoryId) {
      if (!mongoose.Types.ObjectId.isValid(categoryId)) throw new Error("Category not found");
      query.categoryId = categoryId;
    }
    if (activeOnly) query.isActive = true;
    const subcategories = await ProductSubCategory.find(query)
      .populate("categoryId", "id name isActive")
      .sort({ name: 1 });
    const counts = await Product.aggregate([{ $group: { _id: "$subcategoryId", count: { $sum: 1 } } }]);
    const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
    return subcategories.map((s) => ({
      ...toDoc(s),
      category: s.categoryId,
      categoryId: String((s.categoryId as any)?._id || s.categoryId),
      productCount: countMap.get(String(s._id)) || 0,
    }));
  },

  async createSubCategory(categoryId: string, name: string, createdBy: string) {
    await assertCategory(categoryId);
    try {
      const subcategory = await ProductSubCategory.create({
        categoryId,
        name: normalizeName(name),
        createdBy,
      });
      return toDoc(await ProductSubCategory.findById(subcategory._id).populate("categoryId", "id name"));
    } catch (error: any) {
      if (isDuplicateKeyError(error)) throw new Error("A sub category with this name already exists in this category");
      throw error;
    }
  },

  async updateSubCategory(id: string, data: { name?: string; categoryId?: string; isActive?: boolean }) {
    const subcategory = await ProductSubCategory.findById(id);
    if (!subcategory) throw new Error("Sub category not found");
    if (data.categoryId !== undefined) {
      await assertCategory(data.categoryId);
      subcategory.categoryId = new mongoose.Types.ObjectId(data.categoryId);
    }
    if (data.name !== undefined) subcategory.name = normalizeName(data.name);
    if (data.isActive !== undefined) subcategory.isActive = data.isActive;
    try {
      await subcategory.save();
      return toDoc(await ProductSubCategory.findById(id).populate("categoryId", "id name"));
    } catch (error: any) {
      if (isDuplicateKeyError(error)) throw new Error("A sub category with this name already exists in this category");
      throw error;
    }
  },

  async deleteSubCategory(id: string) {
    const productCount = await Product.countDocuments({ subcategoryId: id });
    if (productCount > 0) {
      throw new Error(`This sub category has ${productCount} product${productCount === 1 ? "" : "s"}. Delete or move them first.`);
    }
    const deleted = await ProductSubCategory.findByIdAndDelete(id);
    if (!deleted) throw new Error("Sub category not found");
    return { id };
  },

  // ---------- Catalog options (spec / operation / post ops) ----------
  async listOptions(type?: CatalogOptionType, activeOnly = false) {
    const query: any = {};
    if (type) query.type = type;
    if (activeOnly) query.isActive = true;
    const options = await CatalogOption.find(query).sort({ type: 1, name: 1 });
    return options.map(toDoc);
  },

  async createOption(type: CatalogOptionType, name: string, createdBy: string) {
    if (!Object.values(CatalogOptionType).includes(type)) throw new Error("Invalid option type");
    try {
      return toDoc(await CatalogOption.create({ type, name: normalizeName(name), createdBy }));
    } catch (error: any) {
      if (isDuplicateKeyError(error)) throw new Error("This option already exists");
      throw error;
    }
  },

  async updateOption(id: string, data: { name?: string; isActive?: boolean }) {
    const option = await CatalogOption.findById(id);
    if (!option) throw new Error("Option not found");
    if (data.name !== undefined) option.name = normalizeName(data.name);
    if (data.isActive !== undefined) option.isActive = data.isActive;
    try {
      return toDoc(await option.save());
    } catch (error: any) {
      if (isDuplicateKeyError(error)) throw new Error("This option already exists");
      throw error;
    }
  },

  async deleteOption(id: string) {
    const used = await Product.countDocuments({
      $or: [
        { specifications: id },
        { operations: id },
        { postOperations1: id },
        { postOperations2: id },
        { postOperations3: id },
      ],
    });
    if (used > 0) {
      throw new Error(`This option is used by ${used} product${used === 1 ? "" : "s"}. Remove it from products first.`);
    }
    const deleted = await CatalogOption.findByIdAndDelete(id);
    if (!deleted) throw new Error("Option not found");
    return { id };
  },

  // ---------- Products ----------
  async listProducts(filters: { subcategoryId?: string; categoryId?: string; search?: string; activeOnly?: boolean }) {
    const query: any = {};
    if (filters.activeOnly) query.isActive = true;
    if (filters.subcategoryId) {
      if (!mongoose.Types.ObjectId.isValid(filters.subcategoryId)) throw new Error("Sub category not found");
      query.subcategoryId = filters.subcategoryId;
    } else if (filters.categoryId) {
      if (!mongoose.Types.ObjectId.isValid(filters.categoryId)) throw new Error("Category not found");
      const subs = await ProductSubCategory.find({ categoryId: filters.categoryId }).select("_id");
      query.subcategoryId = { $in: subs.map((s) => s._id) };
    }
    if (filters.search) {
      query.name = new RegExp(filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    }

    const products = await Product.find(query)
      .populate({
        path: "subcategoryId",
        select: "id name categoryId",
        populate: { path: "categoryId", select: "id name" },
      })
      .populate("specifications", "id name type")
      .populate("operations", "id name type")
      .populate("postOperations1", "id name type")
      .populate("postOperations2", "id name type")
      .populate("postOperations3", "id name type")
      .sort({ name: 1 });

    return products.map((p) => {
      const doc = toDoc(p);
      const sub = p.subcategoryId as any;
      doc.subcategory = sub;
      doc.subcategoryId = String(sub?._id || p.subcategoryId);
      doc.category = sub?.categoryId || null;
      return doc;
    });
  },

  async getProductById(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error("Product not found");
    const product = await Product.findById(id)
      .populate({
        path: "subcategoryId",
        select: "id name categoryId",
        populate: { path: "categoryId", select: "id name" },
      })
      .populate("specifications", "id name type")
      .populate("operations", "id name type")
      .populate("postOperations1", "id name type")
      .populate("postOperations2", "id name type")
      .populate("postOperations3", "id name type");
    if (!product) throw new Error("Product not found");
    const doc = toDoc(product);
    const sub = product.subcategoryId as any;
    doc.subcategory = sub;
    doc.subcategoryId = String(sub?._id || product.subcategoryId);
    doc.category = sub?.categoryId || null;
    return doc;
  },

  async createProduct(
    data: {
      subcategoryId: string;
      name: string;
      price: number;
      pricingUnit: PricingUnit;
      specifications?: string[];
      operations?: string[];
      postOperations1?: string[];
      postOperations2?: string[];
      postOperations3?: string[];
      notes?: string | null;
    },
    createdBy: string
  ) {
    await assertSubCategory(data.subcategoryId);
    if (!Object.values(PricingUnit).includes(data.pricingUnit)) {
      throw new Error("Pricing unit must be Square Feet or Quantity");
    }
    const optionSets: Record<string, mongoose.Types.ObjectId[]> = {};
    for (const field of OPTION_FIELDS) {
      optionSets[field.key] = await resolveOptionIds(field.type, (data as any)[field.key]);
    }
    try {
      const product = await Product.create({
        subcategoryId: data.subcategoryId,
        name: normalizeName(data.name),
        price: Math.max(0, Number(data.price) || 0),
        pricingUnit: data.pricingUnit,
        ...optionSets,
        notes: data.notes?.trim() || null,
        createdBy,
      });
      return this.getProductById(String(product._id));
    } catch (error: any) {
      if (isDuplicateKeyError(error)) throw new Error("A product with this name already exists in this sub category");
      throw error;
    }
  },

  async updateProduct(
    id: string,
    data: Partial<{
      subcategoryId: string;
      name: string;
      price: number;
      pricingUnit: PricingUnit;
      specifications: string[];
      operations: string[];
      postOperations1: string[];
      postOperations2: string[];
      postOperations3: string[];
      notes: string | null;
      isActive: boolean;
    }>
  ) {
    const product = await Product.findById(id);
    if (!product) throw new Error("Product not found");
    if (data.subcategoryId !== undefined) {
      await assertSubCategory(data.subcategoryId);
      product.subcategoryId = new mongoose.Types.ObjectId(data.subcategoryId);
    }
    if (data.name !== undefined) product.name = normalizeName(data.name);
    if (data.price !== undefined) product.price = Math.max(0, Number(data.price) || 0);
    if (data.pricingUnit !== undefined) {
      if (!Object.values(PricingUnit).includes(data.pricingUnit)) {
        throw new Error("Pricing unit must be Square Feet or Quantity");
      }
      product.pricingUnit = data.pricingUnit;
    }
    for (const field of OPTION_FIELDS) {
      if ((data as any)[field.key] !== undefined) {
        (product as any)[field.key] = await resolveOptionIds(field.type, (data as any)[field.key]);
      }
    }
    if (data.notes !== undefined) product.notes = data.notes?.trim() || null;
    if (data.isActive !== undefined) product.isActive = data.isActive;
    try {
      await product.save();
      return this.getProductById(id);
    } catch (error: any) {
      if (isDuplicateKeyError(error)) throw new Error("A product with this name already exists in this sub category");
      throw error;
    }
  },

  async deleteProduct(id: string) {
    const deleted = await Product.findByIdAndDelete(id);
    if (!deleted) throw new Error("Product not found");
    return { id };
  },
};
