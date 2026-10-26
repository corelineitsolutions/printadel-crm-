"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  ClipboardList,
  Eye,
  FileText,
  Hash,
  Loader2,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CustomerType,
  orderFormAPI,
  OrderFormPayload,
  PricingUnit,
  productCatalogAPI,
} from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency } from "@/lib/utils";

type OrderType = "NEW" | "REPEAT" | "REPRINT";
type Priority = "NORMAL" | "URGENT";

const CUSTOMER_TYPES: { value: CustomerType; label: string; hint: string }[] = [
  { value: "B2B", label: "B2B", hint: "Business to business orders" },
  { value: "CORPORATE", label: "Corporate", hint: "Corporate / company accounts" },
  { value: "RETAILER", label: "Retailer", hint: "Walk-in / retail customers" },
];

const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  B2B: "B2B",
  CORPORATE: "Corporate",
  RETAILER: "Retailer",
};

const NO_PRODUCT = "manual";

const ORDER_TYPES: { value: OrderType; label: string }[] = [
  { value: "NEW", label: "New" },
  { value: "REPEAT", label: "Repeat" },
  { value: "REPRINT", label: "Reprint" },
];

const PRIORITIES: { value: Priority; label: string; hint: string }[] = [
  { value: "NORMAL", label: "Normal", hint: "After 24 hours" },
  { value: "URGENT", label: "Urgent", hint: "Within 24 hours" },
];

const CATEGORIES: { value: string; label: string }[] = [
  { value: "DIGITAL", label: "Digital" },
  { value: "ACRYLIC", label: "Acrylic" },
  { value: "FLEX_VINYL_BOARD", label: "Flex, Vinyl & Board" },
  { value: "OFFSET", label: "Offset" },
  { value: "PHOTO_ALBUM", label: "Photo Album" },
  { value: "EVENT", label: "Event" },
  { value: "ADVERTISING", label: "Advertising" },
  { value: "OTHER", label: "Other" },
];

const DELIVERY_MODES: { value: string; label: string }[] = [
  { value: "PICKUP", label: "Pickup" },
  { value: "DELIVERY", label: "Delivery" },
  { value: "INSTALL", label: "Install" },
];

const PAYMENT_MODES = ["Cash", "UPI", "Card", "Bank Transfer", "Cheque", "Credit"];
const NO_PAYMENT_MODE = "none";

interface ItemRow {
  productId: string;
  productName: string;
  pricingUnit: PricingUnit | "";
  description: string;
  material: string;
  size: string;
  width: string;
  height: string;
  quantity: string;
  rate: string;
}

interface FormState {
  orderDate: string;
  branch: string;
  customerType: CustomerType;
  customerName: string;
  companyName: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
  orderTakenBy: string;
  orderType: OrderType;
  priority: Priority;
  categories: string[];
  otherCategory: string;
  jobName: string;
  items: ItemRow[];
  finish: string;
  artworkInstructions: string;
  deliveryDateTime: string;
  deliveryModes: string[];
  siteAddress: string;
  landmark: string;
  siteContact: string;
  contactPhone: string;
  installationDateTime: string;
  extras: string;
  discount: string;
  transport: string;
  taxPercent: string;
  advance: string;
  paymentMode: string;
}

const emptyItem = (): ItemRow => ({
  productId: NO_PRODUCT,
  productName: "",
  pricingUnit: "",
  description: "",
  material: "",
  size: "",
  width: "",
  height: "",
  quantity: "1",
  rate: "",
});

const emptyForm = (orderTakenBy = "", customerType: CustomerType = "RETAILER"): FormState => ({
  orderDate: format(new Date(), "yyyy-MM-dd"),
  branch: "",
  customerType,
  customerName: "",
  companyName: "",
  phone: "",
  email: "",
  address: "",
  gstin: "",
  orderTakenBy,
  orderType: "NEW",
  priority: "NORMAL",
  categories: [],
  otherCategory: "",
  jobName: "",
  items: [emptyItem()],
  finish: "",
  artworkInstructions: "",
  deliveryDateTime: "",
  deliveryModes: [],
  siteAddress: "",
  landmark: "",
  siteContact: "",
  contactPhone: "",
  installationDateTime: "",
  extras: "0",
  discount: "0",
  transport: "0",
  taxPercent: "18",
  advance: "0",
  paymentMode: NO_PAYMENT_MODE,
});

const toNumber = (value: string) => {
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const toLocalDateTime = (value?: string | null) => (value ? format(new Date(value), "yyyy-MM-dd'T'HH:mm") : "");
const toIso = (value: string) => (value ? new Date(value).toISOString() : null);
const formatDateTime = (value?: string | null) => (value ? format(new Date(value), "dd MMM yyyy, hh:mm a") : "—");

/** Square feet: W × H × qty × rate. Quantity: qty × rate. */
function itemAmount(item: ItemRow) {
  const qty = toNumber(item.quantity) || 1;
  const rate = toNumber(item.rate);
  if (item.pricingUnit === "SQUARE_FEET") {
    return toNumber(item.width) * toNumber(item.height) * qty * rate;
  }
  return qty * rate;
}

function itemArea(item: ItemRow) {
  return toNumber(item.width) * toNumber(item.height) * (toNumber(item.quantity) || 1);
}

/** Mirrors the backend: tax applies to items + extras + transport after discount. */
function computeTotals(form: FormState) {
  const subtotal = form.items.reduce((sum, item) => sum + itemAmount(item), 0);
  const extras = toNumber(form.extras);
  const transport = toNumber(form.transport);
  const gross = subtotal + extras + transport;
  const discount = Math.min(gross, toNumber(form.discount));
  const taxAmount = ((gross - discount) * Math.min(100, toNumber(form.taxPercent))) / 100;
  const total = gross - discount + taxAmount;
  return { subtotal, extras, transport, discount, taxAmount, total, balance: total - toNumber(form.advance) };
}

const labelOf = (list: { value: string; label: string }[], value: string) =>
  list.find((o) => o.value === value)?.label || value;

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Opens a print-ready copy laid out like the paper order form. */
function printOrderForm(o: any) {
  const box = (checked: boolean, label: string) => `<span class="cb">${checked ? "&#9745;" : "&#9744;"} ${escapeHtml(label)}</span>`;
  const line = (label: string, value: unknown) =>
    `<div class="ln"><span class="lb">${escapeHtml(label)}</span><span class="v">${escapeHtml(value || "")}</span></div>`;
  const categories = CATEGORIES.map((c) =>
    box(o.categories?.includes(c.value), c.value === "OTHER" && o.otherCategory ? `Other: ${o.otherCategory}` : c.label)
  ).join("");
  const rows = (o.items || [])
    .map((i: any) => {
      const sizeLabel =
        i.pricingUnit === "SQUARE_FEET" && i.width && i.height
          ? `${i.width} × ${i.height} ft`
          : i.size || "";
      const qtyLabel =
        i.pricingUnit === "SQUARE_FEET"
          ? `${i.quantity || 1} (${Number(i.width || 0) * Number(i.height || 0) * (i.quantity || 1)} sq ft)`
          : i.quantity;
      return `<tr><td>${escapeHtml(i.productName || i.description)}${i.pricingUnit === "SQUARE_FEET" ? " <small>(sq ft)</small>" : i.pricingUnit === "QUANTITY" ? " <small>(qty)</small>" : ""}</td><td>${escapeHtml(i.material)}</td><td>${escapeHtml(sizeLabel)}</td><td class="r">${escapeHtml(qtyLabel)}</td><td class="r">${formatCurrency(i.rate)}</td><td class="r">${formatCurrency(i.amount)}</td></tr>`;
    })
    .join("");

  const html = `<!doctype html><html><head><title>${escapeHtml(o.formNumber)}</title><style>
    *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;font-size:12px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}
    .title{background:#222;color:#fff;font-size:28px;font-weight:800;padding:6px 16px;border-radius:0 14px 0 0;display:inline-block}
    .sub{font-weight:700;margin-top:4px} .meta div{margin-bottom:6px} .meta b{display:inline-block;width:70px}
    .sec{border-left:5px solid #222;border-top:1px solid #ccc;border-right:1px solid #ccc;border-bottom:1px solid #ccc;padding:10px 14px;margin:14px 0}
    .sh{background:#eee;font-weight:700;font-size:13px;padding:5px 8px;margin-bottom:8px}
    .grid{display:grid;grid-template-columns:1fr 1fr;column-gap:24px} .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;column-gap:24px}
    .ln{display:flex;gap:6px;margin:6px 0} .lb{white-space:nowrap} .v{flex:1;border-bottom:1px solid #999;min-height:15px;font-weight:600}
    .cb{margin-right:14px;white-space:nowrap} table{width:100%;border-collapse:collapse;margin:8px 0}
    th,td{border:1px solid #999;padding:5px} th{background:#eee} .r{text-align:right} .foot{margin-top:18px;font-size:10px;color:#444}
    @media print{body{margin:10mm}}
  </style></head><body>
  <div class="top"><div><div class="title">ORDER FORM</div><div class="sub">CUSTOMER PRINTING AND SIGNAGE ORDER</div>
    ${line("Print shop / Branch", o.branch)}</div>
    <div class="meta"><div><b>Form No.:</b> ${escapeHtml(o.formNumber)}</div><div><b>Date:</b> ${o.orderDate ? format(new Date(o.orderDate), "dd / MM / yyyy") : ""}</div></div></div>
  <div class="sec"><div class="sh">01 Customer details</div>
    ${line("Customer type", CUSTOMER_TYPE_LABELS[o.customerType as CustomerType] || o.customerType)}
    <div class="grid">
    ${line("Customer name", o.customerName)}${line("Company name", o.companyName)}
    ${line("Mobile / Phone", o.phone)}${line("Email", o.email)}</div>
    ${line("Address", o.address)}<div class="grid">${line("GSTIN / Tax ID", o.gstin)}${line("Order taken by", o.orderTakenBy)}</div></div>
  <div class="sec"><div class="sh">02 Order details</div>
    <div style="display:flex;justify-content:space-between"><div><b>Order Type:</b> ${ORDER_TYPES.map((t) => box(o.orderType === t.value, t.label)).join("")}</div>
    <div><b>Priority:</b> ${PRIORITIES.map((p) => box(o.priority === p.value, `${p.label} (${p.hint})`)).join("")}</div></div>
    <div style="margin-top:8px"><b>Order category:</b></div><div style="margin:4px 0">${categories}</div>
    ${line("Job name / Reference / PO No.", o.jobName)}
    <table><thead><tr><th>Item / Description</th><th>Material / Thickness</th><th>Size + Units</th><th>Qty</th><th>Unit Rate</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
    ${line("Finish / Lamination / Mounting / Lighting", o.finish)}${line("Artwork file / Version / Special instructions", o.artworkInstructions)}</div>
  <div class="sec"><div class="sh">03 Delivery and installation (If any)</div>
    <div class="grid">${line("Delivery date / Time", o.deliveryDateTime ? formatDateTime(o.deliveryDateTime) : "")}
    <div class="ln">${DELIVERY_MODES.map((m) => box(o.deliveryModes?.includes(m.value), m.label)).join("")}</div></div>
    ${line("Delivery / Site address", o.siteAddress)}<div class="grid">${line("Location / Landmark", o.landmark)}${line("Site contact", o.siteContact)}
    ${line("Contact phone", o.contactPhone)}${line("Installation date / Time", o.installationDateTime ? formatDateTime(o.installationDateTime) : "")}</div></div>
  <div class="sec"><div class="sh">04 Amount and payment</div><div class="grid3">
    ${line("Subtotal", formatCurrency(o.subtotal || 0))}${line("Extras*", formatCurrency(o.extras || 0))}${line("Discount", formatCurrency(o.discount || 0))}
    ${line(`Tax (${o.taxPercent || 0}%)`, formatCurrency(o.taxAmount || 0))}${line("Total amount", formatCurrency(o.totalAmount || 0))}${line("Advance", formatCurrency(o.advance || 0))}
    ${line("Balance due", formatCurrency(o.balanceDue || 0))}${line("Payment mode", o.paymentMode)}${line("Transport", formatCurrency(o.transport || 0))}</div>
    <div style="font-size:10px;margin-top:4px">*Design, delivery, installation or other agreed charges. Attach a breakdown if needed.</div></div>
  <div class="foot">Attach approved proof, detailed specifications and payment reference as applicable.</div>
  <script>window.onload=function(){window.print()}</script></body></html>`;

  const win = window.open("", "_blank");
  if (!win) {
    toast.error("Allow pop-ups to print the order form");
    return;
  }
  win.document.write(html);
  win.document.close();
}

function SectionHeader({ number, title }: { number: string; title: string }) {
  return (
    <div className="rounded bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-800">
      {number} <span className="ml-1">{title}</span>
    </div>
  );
}

function Section({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-md border border-l-4 border-l-slate-800 p-3 sm:p-4">
      <SectionHeader number={number} title={title} />
      {children}
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className || ""}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function CheckOption({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} />
      <span>
        {label}
        {hint && <span className="ml-1 text-xs text-muted-foreground">({hint})</span>}
      </span>
    </label>
  );
}

function StatusBadge({ status }: { status: string }) {
  return status === "CONVERTED" ? (
    <Badge variant="outline" className="border-green-200 bg-green-100 text-green-800">Converted</Badge>
  ) : (
    <Badge variant="outline" className="border-amber-200 bg-amber-100 text-amber-800">Pending</Badge>
  );
}

function DetailLine({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <p className="text-sm">
      <span className="text-muted-foreground">{label}:</span> <span className="font-medium">{value || "—"}</span>
    </p>
  );
}

export default function OrderFormsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user?.role === "ADMIN";
  const isManagerOrAdmin = user?.role === "ADMIN" || user?.role === "MANAGER";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [customerTypeOpen, setCustomerTypeOpen] = useState(false);
  const [pendingCustomerType, setPendingCustomerType] = useState<CustomerType | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [convertTarget, setConvertTarget] = useState<any | null>(null);

  const { data: catalogProducts = [] } = useQuery({
    queryKey: ["products", "order-form"],
    queryFn: async () => {
      const res = await productCatalogAPI.getProducts({ activeOnly: true });
      return Array.isArray(res.data.data) ? res.data.data : [];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["order-forms"] });
    queryClient.invalidateQueries({ queryKey: ["order-form"] });
    queryClient.invalidateQueries({ queryKey: ["quotations"] });
  };

  const { data: orderForms = [], isLoading } = useQuery({
    queryKey: ["order-forms", statusFilter, search],
    queryFn: async () => {
      const res = await orderFormAPI.getOrderForms({
        status: statusFilter === "all" ? undefined : statusFilter,
        search: search.trim() || undefined,
      });
      return Array.isArray(res.data.data) ? res.data.data : [];
    },
  });

  const { data: nextNumber } = useQuery({
    queryKey: ["order-form-next-number", formOpen],
    queryFn: async () => (await orderFormAPI.getNextNumber()).data.data?.formNumber as string,
    enabled: formOpen && !editingId,
  });

  const { data: details, isLoading: detailsLoading } = useQuery({
    queryKey: ["order-form", detailsId],
    queryFn: async () => (await orderFormAPI.getOrderFormById(detailsId!)).data.data,
    enabled: !!detailsId,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: OrderFormPayload) =>
      editingId ? orderFormAPI.updateOrderForm(editingId, payload) : orderFormAPI.createOrderForm(payload),
    onSuccess: () => {
      toast.success(editingId ? "Order form updated" : "Order form created");
      invalidate();
      setFormOpen(false);
    },
    onError: (error: any) => toast.error(error.response?.data?.message || "Failed to save order form"),
  });

  const convertMutation = useMutation({
    mutationFn: (id: string) => orderFormAPI.convertToQuotation(id),
    onSuccess: (res) => {
      invalidate();
      setConvertTarget(null);
      toast.success(res.data?.message || "Converted to quotation", {
        action: { label: "Open Quotations", onClick: () => router.push("/quotations") },
      });
    },
    onError: (error: any) => toast.error(error.response?.data?.message || "Failed to convert order form"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => orderFormAPI.deleteOrderForm(id),
    onSuccess: () => {
      toast.success("Order form deleted");
      invalidate();
      setDetailsId(null);
    },
    onError: (error: any) => toast.error(error.response?.data?.message || "Failed to delete order form"),
  });

  const totals = useMemo(() => computeTotals(form), [form]);

  const stats = useMemo(() => {
    const list = orderForms as any[];
    return {
      total: list.length,
      pending: list.filter((o) => o.status === "PENDING").length,
      converted: list.filter((o) => o.status === "CONVERTED").length,
      value: list.reduce((s, o) => s + (o.totalAmount || 0), 0),
    };
  }, [orderForms]);

  const canModify = (o: any) =>
    isManagerOrAdmin || String(o.createdBy?._id || o.createdBy?.id || o.createdBy) === String(user?.id);
  const canEdit = (o: any) => canModify(o) && (o.status !== "CONVERTED" || isAdmin);

  const openCreate = () => {
    setPendingCustomerType(null);
    setCustomerTypeOpen(true);
  };

  const continueWithCustomerType = () => {
    if (!pendingCustomerType) return toast.error("Select a customer type");
    setEditingId(null);
    setForm(emptyForm(user?.fullName || "", pendingCustomerType));
    setCustomerTypeOpen(false);
    setFormOpen(true);
  };

  const openEdit = (o: any) => {
    setEditingId(o.id);
    setForm({
      orderDate: o.orderDate ? format(new Date(o.orderDate), "yyyy-MM-dd") : "",
      branch: o.branch || "",
      customerType: (o.customerType as CustomerType) || "RETAILER",
      customerName: o.customerName || "",
      companyName: o.companyName || "",
      phone: o.phone || "",
      email: o.email || "",
      address: o.address || "",
      gstin: o.gstin || "",
      orderTakenBy: o.orderTakenBy || "",
      orderType: o.orderType || "NEW",
      priority: o.priority || "NORMAL",
      categories: o.categories || [],
      otherCategory: o.otherCategory || "",
      jobName: o.jobName || "",
      items: (o.items?.length ? o.items : [emptyItem()]).map((i: any) => ({
        productId: i.productId ? String(i.productId) : NO_PRODUCT,
        productName: i.productName || "",
        pricingUnit: (i.pricingUnit as PricingUnit) || "",
        description: i.description || "",
        material: i.material || "",
        size: i.size || "",
        width: String(i.width ?? ""),
        height: String(i.height ?? ""),
        quantity: String(i.quantity ?? 1),
        rate: String(i.rate ?? ""),
      })),
      finish: o.finish || "",
      artworkInstructions: o.artworkInstructions || "",
      deliveryDateTime: toLocalDateTime(o.deliveryDateTime),
      deliveryModes: o.deliveryModes || [],
      siteAddress: o.siteAddress || "",
      landmark: o.landmark || "",
      siteContact: o.siteContact || "",
      contactPhone: o.contactPhone || "",
      installationDateTime: toLocalDateTime(o.installationDateTime),
      extras: String(o.extras ?? 0),
      discount: String(o.discount ?? 0),
      transport: String(o.transport ?? 0),
      taxPercent: String(o.taxPercent ?? 0),
      advance: String(o.advance ?? 0),
      paymentMode: o.paymentMode || NO_PAYMENT_MODE,
    });
    setDetailsId(null);
    setFormOpen(true);
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggleIn = (key: "categories" | "deliveryModes", value: string, on: boolean) =>
    setForm((f) => ({ ...f, [key]: on ? [...f[key], value] : f[key].filter((v) => v !== value) }));
  const updateItem = (index: number, patch: Partial<ItemRow>) =>
    setForm((f) => ({ ...f, items: f.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));

  const applyProduct = (index: number, productId: string) => {
    if (productId === NO_PRODUCT) {
      updateItem(index, {
        productId: NO_PRODUCT,
        productName: "",
        pricingUnit: "",
        description: "",
        rate: "",
        width: "",
        height: "",
      });
      return;
    }
    const product = (catalogProducts as any[]).find((p) => String(p._id || p.id) === productId);
    if (!product) return;
    updateItem(index, {
      productId,
      productName: product.name || "",
      pricingUnit: product.pricingUnit || "QUANTITY",
      description: product.name || "",
      rate: String(product.price ?? 0),
      width: product.pricingUnit === "SQUARE_FEET" ? "" : "",
      height: product.pricingUnit === "SQUARE_FEET" ? "" : "",
      quantity: "1",
    });
  };

  const handleSave = () => {
    if (form.customerName.trim().length < 2) return toast.error("Customer name is required");
    for (const item of form.items) {
      if (!item.description.trim() && item.productId === NO_PRODUCT) continue;
      if (item.pricingUnit === "SQUARE_FEET" && (toNumber(item.width) <= 0 || toNumber(item.height) <= 0)) {
        return toast.error(`Enter width and height (ft) for "${item.description || item.productName || "item"}"`);
      }
    }
    const items = form.items
      .filter((i) => i.description.trim() || i.productId !== NO_PRODUCT)
      .map((i) => ({
        productId: i.productId === NO_PRODUCT ? null : i.productId,
        productName: i.productName.trim() || undefined,
        pricingUnit: (i.pricingUnit || null) as PricingUnit | null,
        description: (i.description || i.productName).trim(),
        material: i.material.trim() || undefined,
        size:
          i.pricingUnit === "SQUARE_FEET" && toNumber(i.width) > 0 && toNumber(i.height) > 0
            ? `${toNumber(i.width)} × ${toNumber(i.height)} ft`
            : i.size.trim() || undefined,
        width: toNumber(i.width),
        height: toNumber(i.height),
        quantity: toNumber(i.quantity) || 1,
        rate: toNumber(i.rate),
      }));
    if (items.length === 0) return toast.error("Add at least one product or item");

    saveMutation.mutate({
      orderDate: form.orderDate || null,
      branch: form.branch.trim() || undefined,
      customerType: form.customerType,
      customerName: form.customerName.trim(),
      companyName: form.companyName.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
      gstin: form.gstin.trim() || undefined,
      orderTakenBy: form.orderTakenBy.trim() || undefined,
      orderType: form.orderType,
      priority: form.priority,
      categories: form.categories,
      otherCategory: form.otherCategory.trim() || undefined,
      jobName: form.jobName.trim() || undefined,
      items,
      finish: form.finish.trim() || undefined,
      artworkInstructions: form.artworkInstructions.trim() || undefined,
      deliveryDateTime: toIso(form.deliveryDateTime),
      deliveryModes: form.deliveryModes,
      siteAddress: form.siteAddress.trim() || undefined,
      landmark: form.landmark.trim() || undefined,
      siteContact: form.siteContact.trim() || undefined,
      contactPhone: form.contactPhone.trim() || undefined,
      installationDateTime: toIso(form.installationDateTime),
      extras: toNumber(form.extras),
      discount: toNumber(form.discount),
      transport: toNumber(form.transport),
      taxPercent: toNumber(form.taxPercent),
      advance: toNumber(form.advance),
      paymentMode: form.paymentMode === NO_PAYMENT_MODE ? undefined : form.paymentMode,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold text-slate-900 sm:text-3xl">
            <span className="rounded-xl bg-gradient-to-tr from-slate-800 to-slate-600 p-2 text-white shadow-md">
              <ClipboardList className="h-6 w-6" />
            </span>
            Order Forms
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Customer printing and signage orders. Convert an order into a quotation in one click.
          </p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Order Form
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total Orders", value: stats.total },
          { label: "Pending", value: stats.pending },
          { label: "Converted", value: stats.converted },
          { label: "Order Value", value: formatCurrency(stats.value) },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-2xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by form no., customer, company, job or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
            <SelectTrigger className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="CONVERTED">Converted</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          </div>
        ) : (orderForms as any[]).length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <ClipboardList className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            No order forms yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Form No.</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Job</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(orderForms as any[]).map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-mono text-xs font-semibold">{o.formNumber}</td>
                    <td className="whitespace-nowrap px-4 py-3">{o.orderDate ? format(new Date(o.orderDate), "dd MMM yyyy") : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{o.customerName}</div>
                      {o.companyName && <div className="text-xs text-muted-foreground">{o.companyName}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="text-xs">
                        {CUSTOMER_TYPE_LABELS[o.customerType as CustomerType] || o.customerType || "—"}
                      </Badge>
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3">{o.jobName || "—"}</td>
                    <td className="px-4 py-3">
                      {o.priority === "URGENT" ? (
                        <Badge className="bg-rose-100 text-rose-700" variant="secondary">Urgent</Badge>
                      ) : (
                        <span className="text-muted-foreground">Normal</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{formatCurrency(o.totalAmount || 0)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={o.status} />
                      {o.quotationId?.quotationNumber && (
                        <div className="mt-1 font-mono text-[11px] text-muted-foreground">{o.quotationId.quotationNumber}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Details" onClick={() => setDetailsId(o.id)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canEdit(o) && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => openEdit(o)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Print" onClick={() => printOrderForm(o)}>
                          <Printer className="h-4 w-4" />
                        </Button>
                        {o.status !== "CONVERTED" && canModify(o) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => setConvertTarget(o)}
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                            Quotation
                          </Button>
                        )}
                        {isAdmin && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                            title="Delete"
                            disabled={deleteMutation.isPending}
                            onClick={() => confirm(`Delete order form ${o.formNumber}?`) && deleteMutation.mutate(o.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Step 1: Customer type */}
      <Dialog open={customerTypeOpen} onOpenChange={setCustomerTypeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Customer Type</DialogTitle>
            <p className="text-sm text-muted-foreground">Choose the customer type, then continue to the order form.</p>
          </DialogHeader>
          <div className="grid gap-3">
            {CUSTOMER_TYPES.map((t) => {
              const selected = pendingCustomerType === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setPendingCustomerType(t.value)}
                  className={`rounded-lg border p-4 text-left transition ${
                    selected
                      ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                      : "border-slate-200 hover:border-slate-400 hover:bg-slate-50"
                  }`}
                >
                  <div className="text-base font-semibold">{t.label}</div>
                  <div className={`mt-0.5 text-sm ${selected ? "text-slate-200" : "text-muted-foreground"}`}>
                    {t.hint}
                  </div>
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomerTypeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={continueWithCustomerType} disabled={!pendingCustomerType}>
              Next
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create / Edit */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Order Form" : "New Order Form"}</DialogTitle>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Customer printing and signage order
              {form.customerType && (
                <> · <span className="text-slate-800">{CUSTOMER_TYPE_LABELS[form.customerType]}</span></>
              )}
            </p>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Form No.">
              <div className="flex h-10 items-center gap-2 rounded-md border bg-muted/40 px-3 font-mono text-sm">
                <Hash className="h-4 w-4 text-primary" />
                {editingId ? (orderForms as any[]).find((o) => o.id === editingId)?.formNumber : nextNumber || "…"}
              </div>
            </Field>
            <Field label="Date">
              <Input type="date" value={form.orderDate} onChange={(e) => set("orderDate", e.target.value)} />
            </Field>
            <Field label="Print shop / Branch">
              <Input value={form.branch} onChange={(e) => set("branch", e.target.value)} />
            </Field>
          </div>

          <div className="space-y-4">
            <Section number="01" title="Customer details">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Customer type *">
                  <Select
                    value={form.customerType}
                    onValueChange={(v) => v && set("customerType", v as CustomerType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CUSTOMER_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Customer name *">
                  <Input value={form.customerName} onChange={(e) => set("customerName", e.target.value)} />
                </Field>
                <Field label="Company name">
                  <Input value={form.companyName} onChange={(e) => set("companyName", e.target.value)} />
                </Field>
                <Field label="Mobile / Phone">
                  <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
                </Field>
                <Field label="Email">
                  <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
                </Field>
                <Field label="Address" className="sm:col-span-2">
                  <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
                </Field>
                <Field label="GSTIN / Tax ID if applicable">
                  <Input value={form.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} />
                </Field>
                <Field label="Order taken by">
                  <Input value={form.orderTakenBy} onChange={(e) => set("orderTakenBy", e.target.value)} />
                </Field>
              </div>
            </Section>

            <Section number="02" title="Order details">
              <div className="flex flex-col justify-between gap-3 sm:flex-row">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="text-sm font-semibold">Order Type:</span>
                  {ORDER_TYPES.map((t) => (
                    <CheckOption key={t.value} label={t.label} checked={form.orderType === t.value} onChange={() => set("orderType", t.value)} />
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <span className="text-sm font-semibold">Priority:</span>
                  {PRIORITIES.map((p) => (
                    <CheckOption
                      key={p.value}
                      label={p.label}
                      hint={p.hint}
                      checked={form.priority === p.value}
                      onChange={() => set("priority", p.value)}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold">Order category (tick all that apply)</p>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {CATEGORIES.map((c) => (
                    <CheckOption
                      key={c.value}
                      label={c.label}
                      checked={form.categories.includes(c.value)}
                      onChange={(on) => toggleIn("categories", c.value, on)}
                    />
                  ))}
                </div>
                {form.categories.includes("OTHER") && (
                  <Input
                    className="max-w-xs"
                    placeholder="Other category"
                    value={form.otherCategory}
                    onChange={(e) => set("otherCategory", e.target.value)}
                  />
                )}
              </div>

              <Field label="Job name / Reference / PO No.">
                <Input value={form.jobName} onChange={(e) => set("jobName", e.target.value)} />
              </Field>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Products / Items *</p>
                  {(catalogProducts as any[]).length === 0 && (
                    <p className="text-xs text-amber-700">No catalog products yet — you can still type a custom item.</p>
                  )}
                </div>
                {form.items.map((item, idx) => {
                  const isSqFt = item.pricingUnit === "SQUARE_FEET";
                  return (
                    <div key={idx} className="space-y-2 rounded-md border p-3">
                      <div className="flex flex-wrap items-start gap-2">
                        <div className="min-w-[200px] flex-1 space-y-1">
                          <Label className="text-xs text-muted-foreground">Product</Label>
                          <Select value={item.productId} onValueChange={(v) => v && applyProduct(idx, v)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select product" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_PRODUCT}>Custom item (no product)</SelectItem>
                              {(catalogProducts as any[]).map((p) => {
                                const id = String(p._id || p.id);
                                return (
                                  <SelectItem key={id} value={id}>
                                    {p.name} — {formatCurrency(p.price || 0)}/
                                    {p.pricingUnit === "SQUARE_FEET" ? "sq ft" : "qty"}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="min-w-[140px] flex-1 space-y-1">
                          <Label className="text-xs text-muted-foreground">Description</Label>
                          <Input
                            placeholder="Item / Description"
                            value={item.description}
                            onChange={(e) => updateItem(idx, { description: e.target.value })}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="mt-5 h-8 w-8 shrink-0 text-rose-500"
                          disabled={form.items.length === 1}
                          onClick={() => set("items", form.items.filter((_, i) => i !== idx))}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Material / Thickness</Label>
                          <Input
                            placeholder="Material"
                            value={item.material}
                            onChange={(e) => updateItem(idx, { material: e.target.value })}
                          />
                        </div>
                        {isSqFt ? (
                          <>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Width (ft) *</Label>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                placeholder="W"
                                value={item.width}
                                onChange={(e) => updateItem(idx, { width: e.target.value })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Height (ft) *</Label>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                placeholder="H"
                                value={item.height}
                                onChange={(e) => updateItem(idx, { height: e.target.value })}
                              />
                            </div>
                          </>
                        ) : (
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Size</Label>
                            <Input
                              placeholder="e.g. A4 / 6 x 3 ft"
                              value={item.size}
                              onChange={(e) => updateItem(idx, { size: e.target.value })}
                            />
                          </div>
                        )}
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            {isSqFt ? "Qty (pieces)" : "Quantity"}
                          </Label>
                          <Input
                            type="number"
                            min={0}
                            placeholder="Qty"
                            value={item.quantity}
                            onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">
                            Rate {isSqFt ? "(₹ / sq ft)" : "(₹ / qty)"}
                          </Label>
                          <Input
                            type="number"
                            min={0}
                            placeholder="Rate"
                            value={item.rate}
                            onChange={(e) => updateItem(idx, { rate: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <div className="text-muted-foreground">
                          {item.pricingUnit === "SQUARE_FEET" ? (
                            <span>
                              Count type: <Badge variant="secondary" className="bg-amber-100 text-amber-800">Square Feet</Badge>
                              {" · "}
                              Area: <b>{itemArea(item).toFixed(2)} sq ft</b>
                              {" · "}W × H × Qty × Rate
                            </span>
                          ) : item.pricingUnit === "QUANTITY" ? (
                            <span>
                              Count type: <Badge variant="secondary" className="bg-sky-100 text-sky-800">Quantity</Badge>
                              {" · "}Qty × Rate
                            </span>
                          ) : (
                            <span>Custom item · Qty × Rate</span>
                          )}
                        </div>
                        <div className="font-semibold">Amount: {formatCurrency(itemAmount(item))}</div>
                      </div>
                    </div>
                  );
                })}
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => set("items", [...form.items, emptyItem()])}>
                  <Plus className="h-3.5 w-3.5" />
                  Add Product / Item
                </Button>
              </div>

              <Field label="Finish / Lamination / Mounting / Lighting">
                <Input value={form.finish} onChange={(e) => set("finish", e.target.value)} />
              </Field>
              <Field label="Artwork file / Version / Special instructions">
                <Textarea rows={2} value={form.artworkInstructions} onChange={(e) => set("artworkInstructions", e.target.value)} />
              </Field>
            </Section>

            <Section number="03" title="Delivery and installation (If any)">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Delivery date / Time">
                  <Input type="datetime-local" value={form.deliveryDateTime} onChange={(e) => set("deliveryDateTime", e.target.value)} />
                </Field>
                <div className="flex flex-wrap items-end gap-5 pb-2">
                  {DELIVERY_MODES.map((m) => (
                    <CheckOption
                      key={m.value}
                      label={m.label}
                      checked={form.deliveryModes.includes(m.value)}
                      onChange={(on) => toggleIn("deliveryModes", m.value, on)}
                    />
                  ))}
                </div>
                <Field label="Delivery / Site address" className="sm:col-span-2">
                  <Input value={form.siteAddress} onChange={(e) => set("siteAddress", e.target.value)} />
                </Field>
                <Field label="Location / Landmark">
                  <Input value={form.landmark} onChange={(e) => set("landmark", e.target.value)} />
                </Field>
                <Field label="Site contact">
                  <Input value={form.siteContact} onChange={(e) => set("siteContact", e.target.value)} />
                </Field>
                <Field label="Contact phone">
                  <Input value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} />
                </Field>
                <Field label="Installation date / Time">
                  <Input
                    type="datetime-local"
                    value={form.installationDateTime}
                    onChange={(e) => set("installationDateTime", e.target.value)}
                  />
                </Field>
              </div>
            </Section>

            <Section number="04" title="Amount and payment">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Subtotal">
                  <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm font-semibold">
                    {formatCurrency(totals.subtotal)}
                  </div>
                </Field>
                <Field label="Extras*">
                  <Input type="number" min={0} value={form.extras} onChange={(e) => set("extras", e.target.value)} />
                </Field>
                <Field label="Discount">
                  <Input type="number" min={0} value={form.discount} onChange={(e) => set("discount", e.target.value)} />
                </Field>
                <Field label={`Tax % (${formatCurrency(totals.taxAmount)})`}>
                  <Input type="number" min={0} max={100} value={form.taxPercent} onChange={(e) => set("taxPercent", e.target.value)} />
                </Field>
                <Field label="Total amount">
                  <div className="flex h-10 items-center rounded-md border bg-primary/5 px-3 text-sm font-bold text-primary">
                    {formatCurrency(totals.total)}
                  </div>
                </Field>
                <Field label="Advance">
                  <Input type="number" min={0} value={form.advance} onChange={(e) => set("advance", e.target.value)} />
                </Field>
                <Field label="Balance due">
                  <div
                    className={`flex h-10 items-center rounded-md border px-3 text-sm font-semibold ${
                      totals.balance > 0 ? "bg-amber-50 text-amber-800" : "bg-green-50 text-green-700"
                    }`}
                  >
                    {formatCurrency(totals.balance)}
                  </div>
                </Field>
                <Field label="Payment mode">
                  <Select value={form.paymentMode} onValueChange={(v) => v && set("paymentMode", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_PAYMENT_MODE}>Not set</SelectItem>
                      {PAYMENT_MODES.map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Transport">
                  <Input type="number" min={0} value={form.transport} onChange={(e) => set("transport", e.target.value)} />
                </Field>
              </div>
              <p className="text-xs text-muted-foreground">
                *Design, delivery, installation or other agreed charges. Tax is calculated on items + extras + transport after discount.
              </p>
            </Section>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-2">
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingId ? "Save Changes" : "Create Order Form"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details */}
      <Dialog open={!!detailsId} onOpenChange={(open) => !open && setDetailsId(null)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              Order Form {details?.formNumber}
              {details && <StatusBadge status={details.status} />}
            </DialogTitle>
          </DialogHeader>

          {detailsLoading || !details ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-1 sm:grid-cols-3">
                <DetailLine label="Date" value={details.orderDate ? format(new Date(details.orderDate), "dd MMM yyyy") : null} />
                <DetailLine label="Branch" value={details.branch} />
                <DetailLine label="Created by" value={details.createdBy?.fullName} />
              </div>

              {details.quotationId?.quotationNumber && (
                <div className="flex items-center justify-between gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Converted to quotation <b className="font-mono">{details.quotationId.quotationNumber}</b>
                    {details.convertedBy?.fullName && ` by ${details.convertedBy.fullName}`}
                  </span>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => router.push("/quotations")}>
                    Open Quotations
                  </Button>
                </div>
              )}

              <Section number="01" title="Customer details">
                <div className="grid gap-1 sm:grid-cols-2">
                  <DetailLine
                    label="Customer type"
                    value={CUSTOMER_TYPE_LABELS[details.customerType as CustomerType] || details.customerType}
                  />
                  <DetailLine label="Customer" value={details.customerName} />
                  <DetailLine label="Company" value={details.companyName} />
                  <DetailLine label="Phone" value={details.phone} />
                  <DetailLine label="Email" value={details.email} />
                  <DetailLine label="Address" value={details.address} />
                  <DetailLine label="GSTIN" value={details.gstin} />
                  <DetailLine label="Order taken by" value={details.orderTakenBy} />
                </div>
              </Section>

              <Section number="02" title="Order details">
                <div className="grid gap-1 sm:grid-cols-2">
                  <DetailLine label="Order type" value={labelOf(ORDER_TYPES, details.orderType)} />
                  <DetailLine label="Priority" value={labelOf(PRIORITIES, details.priority)} />
                  <DetailLine
                    label="Category"
                    value={(details.categories || [])
                      .map((c: string) => (c === "OTHER" && details.otherCategory ? details.otherCategory : labelOf(CATEGORIES, c)))
                      .join(", ")}
                  />
                  <DetailLine label="Job / Reference / PO" value={details.jobName} />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-xs text-slate-600">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Item</th>
                        <th className="px-2 py-1.5 text-left">Material</th>
                        <th className="px-2 py-1.5 text-left">Size</th>
                        <th className="px-2 py-1.5 text-right">Qty</th>
                        <th className="px-2 py-1.5 text-right">Rate</th>
                        <th className="px-2 py-1.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(details.items || []).map((i: any, idx: number) => (
                        <tr key={idx}>
                          <td className="px-2 py-1.5">
                            <div>{i.productName || i.description}</div>
                            {i.pricingUnit && (
                              <div className="text-[11px] text-muted-foreground">
                                {i.pricingUnit === "SQUARE_FEET" ? "Square Feet" : "Quantity"}
                                {i.pricingUnit === "SQUARE_FEET" && i.width && i.height
                                  ? ` · ${i.width}×${i.height} ft`
                                  : ""}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-1.5">{i.material || "—"}</td>
                          <td className="px-2 py-1.5">{i.size || "—"}</td>
                          <td className="px-2 py-1.5 text-right">{i.quantity}</td>
                          <td className="px-2 py-1.5 text-right">{formatCurrency(i.rate)}</td>
                          <td className="px-2 py-1.5 text-right font-medium">{formatCurrency(i.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <DetailLine label="Finish / Lamination / Mounting / Lighting" value={details.finish} />
                <DetailLine label="Artwork / Special instructions" value={details.artworkInstructions} />
              </Section>

              <Section number="03" title="Delivery and installation">
                <div className="grid gap-1 sm:grid-cols-2">
                  <DetailLine label="Delivery" value={formatDateTime(details.deliveryDateTime)} />
                  <DetailLine
                    label="Mode"
                    value={(details.deliveryModes || []).map((m: string) => labelOf(DELIVERY_MODES, m)).join(", ")}
                  />
                  <DetailLine label="Site address" value={details.siteAddress} />
                  <DetailLine label="Landmark" value={details.landmark} />
                  <DetailLine label="Site contact" value={details.siteContact} />
                  <DetailLine label="Contact phone" value={details.contactPhone} />
                  <DetailLine label="Installation" value={formatDateTime(details.installationDateTime)} />
                </div>
              </Section>

              <Section number="04" title="Amount and payment">
                <div className="grid gap-1 sm:grid-cols-3">
                  <DetailLine label="Subtotal" value={formatCurrency(details.subtotal || 0)} />
                  <DetailLine label="Extras" value={formatCurrency(details.extras || 0)} />
                  <DetailLine label="Discount" value={formatCurrency(details.discount || 0)} />
                  <DetailLine label={`Tax (${details.taxPercent || 0}%)`} value={formatCurrency(details.taxAmount || 0)} />
                  <DetailLine label="Transport" value={formatCurrency(details.transport || 0)} />
                  <DetailLine label="Total" value={<span className="font-bold">{formatCurrency(details.totalAmount || 0)}</span>} />
                  <DetailLine label="Advance" value={formatCurrency(details.advance || 0)} />
                  <DetailLine label="Balance due" value={formatCurrency(details.balanceDue || 0)} />
                  <DetailLine label="Payment mode" value={details.paymentMode} />
                </div>
              </Section>
            </div>
          )}

          {details && (
            <DialogFooter className="flex-wrap gap-2">
              <Button variant="outline" className="gap-2" onClick={() => printOrderForm(details)}>
                <Printer className="h-4 w-4" />
                Print
              </Button>
              {canEdit(details) && (
                <Button variant="outline" className="gap-2" onClick={() => openEdit(details)}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
              )}
              {details.status !== "CONVERTED" && canModify(details) && (
                <Button className="gap-2" onClick={() => setConvertTarget(details)}>
                  <ArrowRightLeft className="h-4 w-4" />
                  Convert to Quotation
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Convert confirmation */}
      <Dialog open={!!convertTarget} onOpenChange={(open) => !open && setConvertTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Convert to Quotation</DialogTitle>
          </DialogHeader>
          {convertTarget && (
            <div className="space-y-2 text-sm">
              <p>
                Create a quotation from order form <b className="font-mono">{convertTarget.formNumber}</b> for{" "}
                <b>{convertTarget.customerName}</b>?
              </p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Customer details and all items are copied (material and size go into the item description).</li>
                <li>Extras and transport are added as separate lines; discount and tax % carry over.</li>
                <li>Finishing, artwork, delivery and advance details go into the quotation notes.</li>
              </ul>
              <p className="pt-1 font-semibold">Total: {formatCurrency(convertTarget.totalAmount || 0)}</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertTarget(null)}>Cancel</Button>
            <Button
              className="gap-2"
              disabled={convertMutation.isPending}
              onClick={() => convertTarget && convertMutation.mutate(convertTarget.id)}
            >
              {convertMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Convert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
