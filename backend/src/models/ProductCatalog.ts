import mongoose, { Schema, Document } from "mongoose";

export enum PricingUnit {
  SQUARE_FEET = "SQUARE_FEET",
  QUANTITY = "QUANTITY",
}

export enum CatalogOptionType {
  SPECIFICATION = "SPECIFICATION",
  OPERATION = "OPERATION",
  POST_OPERATION_1 = "POST_OPERATION_1",
  POST_OPERATION_2 = "POST_OPERATION_2",
  POST_OPERATION_3 = "POST_OPERATION_3",
}

export interface IProductCategory extends Document {
  name: string;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IProductSubCategory extends Document {
  categoryId: mongoose.Types.ObjectId;
  name: string;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICatalogOption extends Document {
  type: CatalogOptionType;
  name: string;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IProduct extends Document {
  subcategoryId: mongoose.Types.ObjectId;
  name: string;
  price: number;
  pricingUnit: PricingUnit;
  specifications: mongoose.Types.ObjectId[];
  operations: mongoose.Types.ObjectId[];
  postOperations1: mongoose.Types.ObjectId[];
  postOperations2: mongoose.Types.ObjectId[];
  postOperations3: mongoose.Types.ObjectId[];
  notes?: string | null;
  isActive: boolean;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ProductCategorySchema = new Schema<IProductCategory>(
  {
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

ProductCategorySchema.index({ name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });
ProductCategorySchema.set("toJSON", { virtuals: true });
ProductCategorySchema.set("toObject", { virtuals: true });

const ProductSubCategorySchema = new Schema<IProductSubCategory>(
  {
    categoryId: { type: Schema.Types.ObjectId, ref: "ProductCategory", required: true },
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

ProductSubCategorySchema.index(
  { categoryId: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);
ProductSubCategorySchema.index({ categoryId: 1 });
ProductSubCategorySchema.set("toJSON", { virtuals: true });
ProductSubCategorySchema.set("toObject", { virtuals: true });

const CatalogOptionSchema = new Schema<ICatalogOption>(
  {
    type: { type: String, enum: Object.values(CatalogOptionType), required: true },
    name: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

CatalogOptionSchema.index(
  { type: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);
CatalogOptionSchema.index({ type: 1 });
CatalogOptionSchema.set("toJSON", { virtuals: true });
CatalogOptionSchema.set("toObject", { virtuals: true });

const ProductSchema = new Schema<IProduct>(
  {
    subcategoryId: { type: Schema.Types.ObjectId, ref: "ProductSubCategory", required: true },
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0, default: 0 },
    pricingUnit: {
      type: String,
      enum: Object.values(PricingUnit),
      required: true,
      default: PricingUnit.QUANTITY,
    },
    specifications: [{ type: Schema.Types.ObjectId, ref: "CatalogOption" }],
    operations: [{ type: Schema.Types.ObjectId, ref: "CatalogOption" }],
    postOperations1: [{ type: Schema.Types.ObjectId, ref: "CatalogOption" }],
    postOperations2: [{ type: Schema.Types.ObjectId, ref: "CatalogOption" }],
    postOperations3: [{ type: Schema.Types.ObjectId, ref: "CatalogOption" }],
    notes: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

ProductSchema.index(
  { subcategoryId: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);
ProductSchema.index({ subcategoryId: 1 });
ProductSchema.index({ pricingUnit: 1 });
ProductSchema.set("toJSON", { virtuals: true });
ProductSchema.set("toObject", { virtuals: true });

export const ProductCategory = mongoose.model<IProductCategory>("ProductCategory", ProductCategorySchema);
export const ProductSubCategory = mongoose.model<IProductSubCategory>("ProductSubCategory", ProductSubCategorySchema);
export const CatalogOption = mongoose.model<ICatalogOption>("CatalogOption", CatalogOptionSchema);
export const Product = mongoose.model<IProduct>("Product", ProductSchema);
