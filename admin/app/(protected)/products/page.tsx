"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  Layers,
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CatalogOptionType,
  PricingUnit,
  ProductPayload,
  productCatalogAPI,
} from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency } from "@/lib/utils";

const NONE = "none";

const OPTION_GROUPS: {
  type: CatalogOptionType;
  key: keyof Pick<
    ProductPayload,
    "specifications" | "operations" | "postOperations1" | "postOperations2" | "postOperations3"
  >;
  label: string;
}[] = [
  { type: "SPECIFICATION", key: "specifications", label: "Specification" },
  { type: "OPERATION", key: "operations", label: "Operation" },
  { type: "POST_OPERATION_1", key: "postOperations1", label: "Post Operation 1" },
  { type: "POST_OPERATION_2", key: "postOperations2", label: "Post Operation 2" },
  { type: "POST_OPERATION_3", key: "postOperations3", label: "Post Operation 3" },
];

const PRICING_LABELS: Record<PricingUnit, string> = {
  SQUARE_FEET: "Square Feet",
  QUANTITY: "Quantity",
};

const idOf = (item: any) => String(item?._id || item?.id || "");

interface ProductForm {
  categoryId: string;
  subcategoryId: string;
  name: string;
  price: string;
  pricingUnit: PricingUnit;
  specifications: string[];
  operations: string[];
  postOperations1: string[];
  postOperations2: string[];
  postOperations3: string[];
  notes: string;
  isActive: boolean;
}

const emptyProductForm = (): ProductForm => ({
  categoryId: NONE,
  subcategoryId: NONE,
  name: "",
  price: "",
  pricingUnit: "QUANTITY",
  specifications: [],
  operations: [],
  postOperations1: [],
  postOperations2: [],
  postOperations3: [],
  notes: "",
  isActive: true,
});

function OptionPicker({
  label,
  options,
  selected,
  onChange,
  onAdd,
  canManage,
}: {
  label: string;
  options: any[];
  selected: string[];
  onChange: (ids: string[]) => void;
  onAdd: () => void;
  canManage: boolean;
}) {
  const toggle = (id: string, on: boolean) => {
    onChange(on ? [...selected, id] : selected.filter((v) => v !== id));
  };

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-semibold">{label}</Label>
        {canManage && (
          <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        )}
      </div>
      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground">No options yet. Click Add to create one.</p>
      ) : (
        <div className="flex max-h-36 flex-wrap gap-x-4 gap-y-2 overflow-y-auto">
          {options.map((opt) => {
            const id = idOf(opt);
            return (
              <label key={id} className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={selected.includes(id)} onCheckedChange={(v) => toggle(id, !!v)} />
                <span>{opt.name}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ProductsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const canManage = user?.role === "ADMIN" || user?.role === "MANAGER";
  const isAdmin = user?.role === "ADMIN";

  const [search, setSearch] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState(NONE);
  const [filterSubCategoryId, setFilterSubCategoryId] = useState(NONE);

  const [productOpen, setProductOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyProductForm());

  const [quickAdd, setQuickAdd] = useState<{
    kind: "category" | "subcategory" | CatalogOptionType;
    name: string;
  } | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["product-categories"] });
    queryClient.invalidateQueries({ queryKey: ["product-subcategories"] });
    queryClient.invalidateQueries({ queryKey: ["product-options"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const { data: categories = [] } = useQuery({
    queryKey: ["product-categories"],
    queryFn: async () => {
      const res = await productCatalogAPI.getCategories();
      return Array.isArray(res.data.data) ? res.data.data : [];
    },
  });

  const { data: allSubCategories = [] } = useQuery({
    queryKey: ["product-subcategories"],
    queryFn: async () => {
      const res = await productCatalogAPI.getSubCategories();
      return Array.isArray(res.data.data) ? res.data.data : [];
    },
  });

  const { data: options = [] } = useQuery({
    queryKey: ["product-options"],
    queryFn: async () => {
      const res = await productCatalogAPI.getOptions({ activeOnly: true });
      return Array.isArray(res.data.data) ? res.data.data : [];
    },
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", filterCategoryId, filterSubCategoryId, search],
    queryFn: async () => {
      const res = await productCatalogAPI.getProducts({
        categoryId: filterCategoryId === NONE ? undefined : filterCategoryId,
        subcategoryId: filterSubCategoryId === NONE ? undefined : filterSubCategoryId,
        search: search.trim() || undefined,
      });
      return Array.isArray(res.data.data) ? res.data.data : [];
    },
  });

  const filteredSubCategories = useMemo(() => {
    if (filterCategoryId === NONE) return allSubCategories;
    return allSubCategories.filter((s: any) => String(s.categoryId) === filterCategoryId);
  }, [allSubCategories, filterCategoryId]);

  const formSubCategories = useMemo(() => {
    if (form.categoryId === NONE) return [];
    return allSubCategories.filter((s: any) => String(s.categoryId) === form.categoryId);
  }, [allSubCategories, form.categoryId]);

  const optionsByType = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const group of OPTION_GROUPS) map[group.type] = [];
    for (const opt of options as any[]) {
      if (!map[opt.type]) map[opt.type] = [];
      map[opt.type].push(opt);
    }
    return map;
  }, [options]);

  const saveProductMutation = useMutation({
    mutationFn: (payload: ProductPayload) =>
      editingId ? productCatalogAPI.updateProduct(editingId, payload) : productCatalogAPI.createProduct(payload),
    onSuccess: () => {
      toast.success(editingId ? "Product updated" : "Product created");
      invalidate();
      setProductOpen(false);
    },
    onError: (error: any) => toast.error(error.response?.data?.message || "Failed to save product"),
  });

  const deleteProductMutation = useMutation({
    mutationFn: (id: string) => productCatalogAPI.deleteProduct(id),
    onSuccess: () => {
      toast.success("Product deleted");
      invalidate();
    },
    onError: (error: any) => toast.error(error.response?.data?.message || "Failed to delete product"),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => productCatalogAPI.deleteCategory(id),
    onSuccess: () => {
      toast.success("Category deleted");
      if (filterCategoryId !== NONE) setFilterCategoryId(NONE);
      invalidate();
    },
    onError: (error: any) => toast.error(error.response?.data?.message || "Failed to delete category"),
  });

  const deleteSubCategoryMutation = useMutation({
    mutationFn: (id: string) => productCatalogAPI.deleteSubCategory(id),
    onSuccess: () => {
      toast.success("Sub category deleted");
      if (filterSubCategoryId !== NONE) setFilterSubCategoryId(NONE);
      invalidate();
    },
    onError: (error: any) => toast.error(error.response?.data?.message || "Failed to delete sub category"),
  });

  const deleteOptionMutation = useMutation({
    mutationFn: (id: string) => productCatalogAPI.deleteOption(id),
    onSuccess: () => {
      toast.success("Option deleted");
      invalidate();
    },
    onError: (error: any) => toast.error(error.response?.data?.message || "Failed to delete option"),
  });

  const quickAddMutation = useMutation({
    mutationFn: async () => {
      if (!quickAdd) throw new Error("Nothing to add");
      const name = quickAdd.name.trim();
      if (!name) throw new Error("Name is required");

      if (quickAdd.kind === "category") {
        return { kind: "category" as const, res: await productCatalogAPI.createCategory(name) };
      }
      if (quickAdd.kind === "subcategory") {
        const categoryId = productOpen ? form.categoryId : filterCategoryId;
        if (categoryId === NONE) throw new Error("Select a category first");
        return {
          kind: "subcategory" as const,
          res: await productCatalogAPI.createSubCategory(categoryId, name),
        };
      }
      return {
        kind: "option" as const,
        type: quickAdd.kind,
        res: await productCatalogAPI.createOption(quickAdd.kind, name),
      };
    },
    onSuccess: (result) => {
      invalidate();
      const created = result.res.data.data;
      const createdId = idOf(created);
      toast.success("Added successfully");

      if (result.kind === "category" && productOpen) {
        setForm((f) => ({ ...f, categoryId: createdId, subcategoryId: NONE }));
      } else if (result.kind === "subcategory" && productOpen) {
        setForm((f) => ({ ...f, subcategoryId: createdId }));
      } else if (result.kind === "option" && productOpen) {
        const group = OPTION_GROUPS.find((g) => g.type === result.type);
        if (group) {
          setForm((f) => ({ ...f, [group.key]: [...f[group.key], createdId] }));
        }
      }
      setQuickAdd(null);
    },
    onError: (error: any) => toast.error(error.response?.data?.message || error.message || "Failed to add"),
  });

  const openCreateProduct = () => {
    setEditingId(null);
    setForm({
      ...emptyProductForm(),
      categoryId: filterCategoryId !== NONE ? filterCategoryId : NONE,
      subcategoryId: filterSubCategoryId !== NONE ? filterSubCategoryId : NONE,
    });
    setProductOpen(true);
  };

  const openEditProduct = (p: any) => {
    setEditingId(idOf(p));
    const categoryId = String(p.category?._id || p.category?.id || p.subcategory?.categoryId?._id || p.subcategory?.categoryId || NONE);
    setForm({
      categoryId: categoryId || NONE,
      subcategoryId: String(p.subcategoryId || NONE),
      name: p.name || "",
      price: String(p.price ?? ""),
      pricingUnit: p.pricingUnit || "QUANTITY",
      specifications: (p.specifications || []).map(idOf),
      operations: (p.operations || []).map(idOf),
      postOperations1: (p.postOperations1 || []).map(idOf),
      postOperations2: (p.postOperations2 || []).map(idOf),
      postOperations3: (p.postOperations3 || []).map(idOf),
      notes: p.notes || "",
      isActive: p.isActive !== false,
    });
    setProductOpen(true);
  };

  const handleSaveProduct = () => {
    if (form.categoryId === NONE) return toast.error("Select a category");
    if (form.subcategoryId === NONE) return toast.error("Select a sub category");
    if (form.name.trim().length < 1) return toast.error("Product name is required");
    const price = parseFloat(form.price);
    if (!Number.isFinite(price) || price < 0) return toast.error("Enter a valid price");

    saveProductMutation.mutate({
      subcategoryId: form.subcategoryId,
      name: form.name.trim(),
      price,
      pricingUnit: form.pricingUnit,
      specifications: form.specifications,
      operations: form.operations,
      postOperations1: form.postOperations1,
      postOperations2: form.postOperations2,
      postOperations3: form.postOperations3,
      notes: form.notes.trim() || null,
      isActive: form.isActive,
    });
  };

  const quickAddTitle =
    quickAdd?.kind === "category"
      ? "Add Category"
      : quickAdd?.kind === "subcategory"
        ? "Add Sub Category"
        : quickAdd
          ? `Add ${OPTION_GROUPS.find((g) => g.type === quickAdd.kind)?.label || "Option"}`
          : "";

  if (!canManage) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          Only administrators and managers can manage products.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold text-slate-900 sm:text-3xl">
            <span className="rounded-xl bg-gradient-to-tr from-indigo-600 to-sky-600 p-2 text-white shadow-md">
              <Package className="h-6 w-6" />
            </span>
            Products
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Categories, sub categories, products with specification, operations and pricing by square feet or quantity.
          </p>
        </div>
        <Button className="gap-2" onClick={openCreateProduct}>
          <Plus className="h-4 w-4" />
          Add Product
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Left: category tree */}
        <Card className="h-fit">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="h-4 w-4" />
              Categories
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1"
              onClick={() => setQuickAdd({ kind: "category", name: "" })}
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </CardHeader>
          <CardContent className="space-y-1 pt-0">
            <button
              type="button"
              className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm ${
                filterCategoryId === NONE ? "bg-indigo-50 font-semibold text-indigo-800" : "hover:bg-slate-50"
              }`}
              onClick={() => {
                setFilterCategoryId(NONE);
                setFilterSubCategoryId(NONE);
              }}
            >
              <span>All products</span>
              <Badge variant="secondary" className="text-xs">
                {(products as any[]).length}
              </Badge>
            </button>

            {(categories as any[]).map((cat) => {
              const catId = idOf(cat);
              const active = filterCategoryId === catId;
              const subs = allSubCategories.filter((s: any) => String(s.categoryId) === catId);
              return (
                <div key={catId} className="space-y-0.5">
                  <div
                    className={`group flex items-center gap-1 rounded-md px-1 ${
                      active && filterSubCategoryId === NONE ? "bg-indigo-50" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className={`min-w-0 flex-1 rounded-md px-1.5 py-2 text-left text-sm ${
                        active && filterSubCategoryId === NONE ? "font-semibold text-indigo-800" : "hover:bg-slate-50"
                      }`}
                      onClick={() => {
                        setFilterCategoryId(catId);
                        setFilterSubCategoryId(NONE);
                      }}
                    >
                      <span className="truncate">{cat.name}</span>
                      <span className="ml-1 text-xs text-muted-foreground">({cat.subcategoryCount || 0})</span>
                    </button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 opacity-60 hover:opacity-100"
                      title="Add sub category"
                      onClick={() => {
                        setFilterCategoryId(catId);
                        setQuickAdd({ kind: "subcategory", name: "" });
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    {isAdmin && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 text-rose-500 opacity-0 group-hover:opacity-100"
                        title="Delete category"
                        onClick={() => {
                          if (confirm(`Delete category "${cat.name}"?`)) deleteCategoryMutation.mutate(catId);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  {active &&
                    subs.map((sub: any) => {
                      const subId = idOf(sub);
                      const subActive = filterSubCategoryId === subId;
                      return (
                        <div
                          key={subId}
                          className={`group ml-3 flex items-center gap-1 rounded-md px-1 ${
                            subActive ? "bg-sky-50" : ""
                          }`}
                        >
                          <button
                            type="button"
                            className={`min-w-0 flex-1 rounded-md px-1.5 py-1.5 text-left text-sm ${
                              subActive ? "font-medium text-sky-800" : "text-muted-foreground hover:bg-slate-50"
                            }`}
                            onClick={() => setFilterSubCategoryId(subId)}
                          >
                            {sub.name}
                            <span className="ml-1 text-xs">({sub.productCount || 0})</span>
                          </button>
                          {isAdmin && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 shrink-0 text-rose-500 opacity-0 group-hover:opacity-100"
                              title="Delete sub category"
                              onClick={() => {
                                if (confirm(`Delete sub category "${sub.name}"?`)) {
                                  deleteSubCategoryMutation.mutate(subId);
                                }
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                </div>
              );
            })}

            {(categories as any[]).length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                No categories yet. Click Add to create one.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Right: products list */}
        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search products…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {filterCategoryId !== NONE && (
                <Select
                  value={filterSubCategoryId}
                  onValueChange={(v) => v && setFilterSubCategoryId(v)}
                >
                  <SelectTrigger className="sm:w-56">
                    <SelectValue placeholder="All sub categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>All sub categories</SelectItem>
                    {filteredSubCategories.map((s: any) => (
                      <SelectItem key={idOf(s)} value={idOf(s)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            {isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
              </div>
            ) : (products as any[]).length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <Package className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                No products yet. Click Add Product to create one.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-slate-50">
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3">Product</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Count Type</th>
                      <th className="px-4 py-3 text-right">Price</th>
                      <th className="px-4 py-3">Options</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(products as any[]).map((p) => {
                      const optionCount =
                        (p.specifications?.length || 0) +
                        (p.operations?.length || 0) +
                        (p.postOperations1?.length || 0) +
                        (p.postOperations2?.length || 0) +
                        (p.postOperations3?.length || 0);
                      return (
                        <tr key={idOf(p)} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">{p.name}</div>
                            {p.notes && (
                              <div className="line-clamp-1 text-xs text-muted-foreground">{p.notes}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm">{p.category?.name || "—"}</div>
                            <div className="text-xs text-muted-foreground">{p.subcategory?.name || ""}</div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant="secondary"
                              className={
                                p.pricingUnit === "SQUARE_FEET"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-sky-100 text-sky-800"
                              }
                            >
                              {PRICING_LABELS[p.pricingUnit as PricingUnit] || p.pricingUnit}
                            </Badge>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                            {formatCurrency(p.price || 0)}
                            <span className="block text-[11px] font-normal text-muted-foreground">
                              per {p.pricingUnit === "SQUARE_FEET" ? "sq ft" : "qty"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">{optionCount} linked</td>
                          <td className="px-4 py-3">
                            {p.isActive !== false ? (
                              <Badge className="bg-emerald-100 text-emerald-800" variant="secondary">
                                Active
                              </Badge>
                            ) : (
                              <Badge className="bg-slate-100 text-slate-600" variant="secondary">
                                Inactive
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openEditProduct(p)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {isAdmin && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                                  disabled={deleteProductMutation.isPending}
                                  onClick={() => {
                                    if (confirm(`Delete product "${p.name}"?`)) {
                                      deleteProductMutation.mutate(idOf(p));
                                    }
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Manage reusable options */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Specification & Operation Options</CardTitle>
              <p className="text-sm text-muted-foreground">
                Shared options you can attach to any product. Use + on a product form, or manage them here.
              </p>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {OPTION_GROUPS.map((group) => (
                <div key={group.type} className="rounded-md border p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{group.label}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-xs"
                      onClick={() => setQuickAdd({ kind: group.type, name: "" })}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </Button>
                  </div>
                  <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                    {(optionsByType[group.type] || []).length === 0 ? (
                      <span className="text-xs text-muted-foreground">None yet</span>
                    ) : (
                      (optionsByType[group.type] || []).map((opt: any) => (
                        <span
                          key={idOf(opt)}
                          className="inline-flex items-center gap-1 rounded-full border bg-slate-50 px-2 py-0.5 text-xs"
                        >
                          {opt.name}
                          {isAdmin && (
                            <button
                              type="button"
                              className="rounded-full p-0.5 text-rose-500 hover:bg-rose-50"
                              title="Delete"
                              onClick={() => {
                                if (confirm(`Delete "${opt.name}"?`)) deleteOptionMutation.mutate(idOf(opt));
                              }}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Product create / edit */}
      <Dialog open={productOpen} onOpenChange={setProductOpen}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Product" : "Add Product"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Category *</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => setQuickAdd({ kind: "category", name: "" })}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </Button>
                </div>
                <Select
                  value={form.categoryId}
                  onValueChange={(v) => v && setForm({ ...form, categoryId: v, subcategoryId: NONE })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Select category</SelectItem>
                    {(categories as any[]).map((c) => (
                      <SelectItem key={idOf(c)} value={idOf(c)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Sub Category *</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 px-2 text-xs"
                    disabled={form.categoryId === NONE}
                    onClick={() => setQuickAdd({ kind: "subcategory", name: "" })}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </Button>
                </div>
                <Select
                  value={form.subcategoryId}
                  onValueChange={(v) => v && setForm({ ...form, subcategoryId: v })}
                  disabled={form.categoryId === NONE}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select sub category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Select sub category</SelectItem>
                    {formSubCategories.map((s: any) => (
                      <SelectItem key={idOf(s)} value={idOf(s)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Product Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Vinyl Print, Printed Cup"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Count Type *</Label>
                <Select
                  value={form.pricingUnit}
                  onValueChange={(v) => v && setForm({ ...form, pricingUnit: v as PricingUnit })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SQUARE_FEET">Square Feet (e.g. vinyl, flex)</SelectItem>
                    <SelectItem value="QUANTITY">Quantity (e.g. cups, visiting cards)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {form.pricingUnit === "SQUARE_FEET"
                    ? "Price is charged per square foot."
                    : "Price is charged per piece / unit quantity."}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Price (₹) *</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder={form.pricingUnit === "SQUARE_FEET" ? "Per sq ft" : "Per quantity"}
                />
              </div>
            </div>

            {OPTION_GROUPS.map((group) => (
              <OptionPicker
                key={group.type}
                label={group.label}
                options={optionsByType[group.type] || []}
                selected={form[group.key]}
                onChange={(ids) => setForm({ ...form, [group.key]: ids })}
                onAdd={() => setQuickAdd({ kind: group.type, name: "" })}
                canManage={canManage}
              />
            ))}

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Optional notes about this product"
              />
            </div>

            {editingId && (
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <Label htmlFor="product-active" className="cursor-pointer">
                  Active
                </Label>
                <Switch
                  id="product-active"
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setProductOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveProduct} disabled={saveProductMutation.isPending} className="gap-2">
              {saveProductMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingId ? "Save Changes" : "Create Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick add dialog for category / subcategory / options */}
      <Dialog open={!!quickAdd} onOpenChange={(open) => !open && setQuickAdd(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{quickAddTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {quickAdd?.kind === "subcategory" &&
              (productOpen ? form.categoryId : filterCategoryId) === NONE && (
                <p className="text-sm text-amber-700">Select a category first, then add a sub category.</p>
              )}
            <Label>Name</Label>
            <Input
              autoFocus
              value={quickAdd?.name || ""}
              onChange={(e) => quickAdd && setQuickAdd({ ...quickAdd, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  quickAddMutation.mutate();
                }
              }}
              placeholder="Enter name"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickAdd(null)}>
              Cancel
            </Button>
            <Button
              className="gap-2"
              disabled={quickAddMutation.isPending || !quickAdd?.name.trim()}
              onClick={() => quickAddMutation.mutate()}
            >
              {quickAddMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
