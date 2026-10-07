"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  CheckCircle2,
  Eye,
  FileText,
  Hash,
  ImagePlus,
  Loader2,
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { quotationAPI, QuotationPayload } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency } from "@/lib/utils";

type QuotationStatus = "PENDING" | "COMPLETED" | "CANCELLED";

interface ItemRow {
  description: string;
  quantity: string;
  rate: string;
}

interface FormState {
  subject: string;
  clientName: string;
  clientCompany: string;
  clientPhone: string;
  clientEmail: string;
  clientAddress: string;
  items: ItemRow[];
  discount: string;
  gstPercent: string;
  validUntil: string;
  notes: string;
  terms: string;
}

const STATUS_STYLES: Record<QuotationStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800 border-amber-200",
  COMPLETED: "bg-green-100 text-green-800 border-green-200",
  CANCELLED: "bg-slate-100 text-slate-600 border-slate-200",
};

const STATUS_LABELS: Record<QuotationStatus, string> = {
  PENDING: "Pending",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const UNASSIGNED = "unassigned";
const MAX_SCREENSHOTS = 5;

const emptyForm = (): FormState => ({
  subject: "",
  clientName: "",
  clientCompany: "",
  clientPhone: "",
  clientEmail: "",
  clientAddress: "",
  items: [{ description: "", quantity: "1", rate: "" }],
  discount: "0",
  gstPercent: "18",
  validUntil: "",
  notes: "",
  terms: "",
});

const toNumber = (value: string) => {
  const n = parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

function computeTotals(form: FormState) {
  const subtotal = form.items.reduce((sum, item) => sum + toNumber(item.quantity) * toNumber(item.rate), 0);
  const discount = Math.min(subtotal, toNumber(form.discount));
  const gstAmount = ((subtotal - discount) * toNumber(form.gstPercent)) / 100;
  return { subtotal, discount, gstAmount, total: subtotal - discount + gstAmount };
}

/** Downscale a screenshot so it stays readable but well under the 5 MB upload limit. */
function compressImage(file: File, maxSide = 2000, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Invalid image"));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas not supported"));
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function StatusBadge({ status }: { status: QuotationStatus }) {
  return (
    <Badge variant="outline" className={STATUS_STYLES[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export default function QuotationsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "ADMIN";
  const isManagerOrAdmin = user?.role === "ADMIN" || user?.role === "MANAGER";

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  const [detailsId, setDetailsId] = useState<string | null>(null);

  const [completeTarget, setCompleteTarget] = useState<any | null>(null);
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [completeNote, setCompleteNote] = useState("");
  const [isReadingImages, setIsReadingImages] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["quotations"] });
    queryClient.invalidateQueries({ queryKey: ["quotation"] });
  };

  const { data: quotations = [], isLoading } = useQuery({
    queryKey: ["quotations", statusFilter, search],
    queryFn: async () => {
      const res = await quotationAPI.getQuotations({
        status: statusFilter === "all" ? undefined : statusFilter,
        search: search.trim() || undefined,
      });
      return Array.isArray(res.data.data) ? res.data.data : [];
    },
  });

  const { data: designers = [] } = useQuery({
    queryKey: ["quotation-designers"],
    queryFn: async () => {
      const res = await quotationAPI.getDesigners();
      return Array.isArray(res.data.data) ? res.data.data : [];
    },
    enabled: isAdmin,
  });

  const { data: nextNumber } = useQuery({
    queryKey: ["quotation-next-number", formOpen],
    queryFn: async () => (await quotationAPI.getNextNumber()).data.data?.quotationNumber as string,
    enabled: formOpen && !editingId,
  });

  const { data: details, isLoading: detailsLoading } = useQuery({
    queryKey: ["quotation", detailsId],
    queryFn: async () => (await quotationAPI.getQuotationById(detailsId!)).data.data,
    enabled: !!detailsId,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: QuotationPayload) =>
      editingId ? quotationAPI.updateQuotation(editingId, payload) : quotationAPI.createQuotation(payload),
    onSuccess: () => {
      toast.success(editingId ? "Quotation updated" : "Quotation created");
      invalidate();
      setFormOpen(false);
    },
    onError: (error: any) => toast.error(error.response?.data?.message || "Failed to save quotation"),
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, designerId }: { id: string; designerId: string | null }) =>
      quotationAPI.assignQuotation(id, designerId),
    onSuccess: (_res, vars) => {
      toast.success(vars.designerId ? "Quotation assigned" : "Quotation unassigned");
      invalidate();
    },
    onError: (error: any) => toast.error(error.response?.data?.message || "Failed to assign quotation"),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; status: QuotationStatus; screenshots?: string[]; note?: string }) =>
      quotationAPI.updateStatus(id, data),
    onSuccess: (_res, vars) => {
      toast.success(`Quotation marked ${STATUS_LABELS[vars.status].toLowerCase()}`);
      invalidate();
      setCompleteTarget(null);
    },
    onError: (error: any) => toast.error(error.response?.data?.message || "Failed to update status"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => quotationAPI.deleteQuotation(id),
    onSuccess: () => {
      toast.success("Quotation deleted");
      invalidate();
      setDetailsId(null);
    },
    onError: (error: any) => toast.error(error.response?.data?.message || "Failed to delete quotation"),
  });

  const totals = useMemo(() => computeTotals(form), [form]);

  const stats = useMemo(() => {
    const list = quotations as any[];
    return {
      total: list.length,
      pending: list.filter((q) => q.status === "PENDING").length,
      completed: list.filter((q) => q.status === "COMPLETED").length,
      value: list.filter((q) => q.status === "COMPLETED").reduce((s, q) => s + (q.totalAmount || 0), 0),
    };
  }, [quotations]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (q: any) => {
    setEditingId(q.id);
    setForm({
      subject: q.subject || "",
      clientName: q.clientName || "",
      clientCompany: q.clientCompany || "",
      clientPhone: q.clientPhone || "",
      clientEmail: q.clientEmail || "",
      clientAddress: q.clientAddress || "",
      items: (q.items?.length ? q.items : [{ description: "", quantity: 1, rate: 0 }]).map((i: any) => ({
        description: i.description || "",
        quantity: String(i.quantity ?? 1),
        rate: String(i.rate ?? 0),
      })),
      discount: String(q.discount ?? 0),
      gstPercent: String(q.gstPercent ?? 0),
      validUntil: q.validUntil ? String(q.validUntil).slice(0, 10) : "",
      notes: q.notes || "",
      terms: q.terms || "",
    });
    setFormOpen(true);
  };

  const updateItem = (index: number, patch: Partial<ItemRow>) =>
    setForm((f) => ({ ...f, items: f.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));

  const handleSave = () => {
    if (form.clientName.trim().length < 2) return toast.error("Client name is required");
    if (form.subject.trim().length < 2) return toast.error("Subject is required");
    const items = form.items
      .filter((i) => i.description.trim())
      .map((i) => ({ description: i.description.trim(), quantity: toNumber(i.quantity), rate: toNumber(i.rate) }));
    if (items.length === 0) return toast.error("Add at least one item with a description");

    saveMutation.mutate({
      subject: form.subject.trim(),
      clientName: form.clientName.trim(),
      clientCompany: form.clientCompany.trim() || undefined,
      clientPhone: form.clientPhone.trim() || undefined,
      clientEmail: form.clientEmail.trim() || undefined,
      clientAddress: form.clientAddress.trim() || undefined,
      items,
      discount: toNumber(form.discount),
      gstPercent: toNumber(form.gstPercent),
      validUntil: form.validUntil || null,
      notes: form.notes.trim() || undefined,
      terms: form.terms.trim() || undefined,
    });
  };

  const openComplete = (q: any) => {
    setCompleteTarget(q);
    setScreenshots([]);
    setCompleteNote("");
  };

  const handleScreenshotFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const existing = completeTarget?.approvalScreenshotCount || 0;
    const room = MAX_SCREENSHOTS - existing - screenshots.length;
    if (room <= 0) return toast.error(`You can attach up to ${MAX_SCREENSHOTS} screenshots`);
    setIsReadingImages(true);
    try {
      const selected = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, room);
      const compressed = await Promise.all(selected.map((f) => compressImage(f)));
      setScreenshots((prev) => [...prev, ...compressed]);
    } catch {
      toast.error("Could not read one of the images");
    } finally {
      setIsReadingImages(false);
    }
  };

  const handleStatusChange = (q: any, status: QuotationStatus) => {
    if (status === q.status) return;
    if (status === "COMPLETED") return openComplete(q);
    statusMutation.mutate({ id: q.id, status });
  };

  const canEdit = (q: any) =>
    (isManagerOrAdmin || String(q.createdBy?._id || q.createdBy?.id) === user?.id) &&
    (q.status !== "COMPLETED" || isAdmin);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <FileText className="w-7 h-7" />
            Quotations
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Create client quotations, assign them to a designer and verify client approval with a chat screenshot.
          </p>
        </div>
        <Button className="gap-2 self-start" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          New Quotation
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total", value: stats.total },
          { label: "Pending", value: stats.pending },
          { label: "Completed", value: stats.completed },
          { label: "Approved Value", value: formatCurrency(stats.value) },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-xl font-bold mt-1">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6 grid gap-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-2">
            <Label>Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Quotation #, client, company or subject"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={(v) => v && setStatusFilter(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Quotations</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : quotations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
              No quotations found.
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="bg-muted/50 border-b">
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Quotation #</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Subject</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Designer</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(quotations as any[]).map((q) => (
                    <tr key={q.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs font-semibold whitespace-nowrap">{q.quotationNumber}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{q.clientName}</p>
                        {q.clientCompany && <p className="text-xs text-muted-foreground">{q.clientCompany}</p>}
                      </td>
                      <td className="px-4 py-3 max-w-[220px] truncate" title={q.subject}>{q.subject}</td>
                      <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{formatCurrency(q.totalAmount || 0)}</td>
                      <td className="px-4 py-3">
                        {isAdmin ? (
                          <Select
                            value={q.assignedTo?._id || q.assignedTo?.id || UNASSIGNED}
                            onValueChange={(v) =>
                              v && assignMutation.mutate({ id: q.id, designerId: v === UNASSIGNED ? null : v })
                            }
                          >
                            <SelectTrigger className="h-8 w-[170px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                              {(designers as any[]).map((d) => (
                                <SelectItem key={d._id || d.id} value={d._id || d.id}>
                                  {d.fullName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={q.assignedTo ? "" : "text-muted-foreground"}>
                            {q.assignedTo?.fullName || "Unassigned"}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Select value={q.status} onValueChange={(v) => v && handleStatusChange(q, v as QuotationStatus)}>
                          <SelectTrigger className="h-8 w-[130px] border-none bg-transparent px-1 focus:ring-0">
                            <SelectValue>
                              <StatusBadge status={q.status} />
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PENDING">Pending</SelectItem>
                            <SelectItem value="COMPLETED">Completed</SelectItem>
                            <SelectItem value="CANCELLED">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                        {q.approvalScreenshotCount > 0 && (
                          <p className="text-[10px] text-green-700 mt-0.5">
                            {q.approvalScreenshotCount} approval screenshot{q.approvalScreenshotCount > 1 ? "s" : ""}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                        {format(new Date(q.createdAt), "dd MMM yyyy")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8" title="Details" onClick={() => setDetailsId(q.id)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          {canEdit(q) && (
                            <Button size="icon" variant="ghost" className="h-8 w-8" title="Edit" onClick={() => openEdit(q)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                          {q.status !== "COMPLETED" && (
                            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => openComplete(q)}>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Complete
                            </Button>
                          )}
                          {isAdmin && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              title="Delete"
                              onClick={() => confirm(`Delete quotation ${q.quotationNumber}?`) && deleteMutation.mutate(q.id)}
                            >
                              <Trash2 className="w-4 h-4" />
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
        </CardContent>
      </Card>

      {/* Create / Edit */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Quotation" : "New Quotation"}</DialogTitle>
          </DialogHeader>

          {!editingId && nextNumber && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <Hash className="w-4 h-4 text-primary" />
              Quotation number: <span className="font-mono font-semibold">{nextNumber}</span>
            </div>
          )}

          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Client Name *</Label>
                <Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Company</Label>
                <Input value={form.clientCompany} onChange={(e) => setForm({ ...form, clientCompany: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Address</Label>
                <Input value={form.clientAddress} onChange={(e) => setForm({ ...form, clientAddress: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Subject *</Label>
                <Input
                  placeholder="e.g. Printing of 5,000 product boxes"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Items *</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1"
                  onClick={() => setForm({ ...form, items: [...form.items, { description: "", quantity: "1", rate: "" }] })}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Item
                </Button>
              </div>
              <div className="rounded-md border divide-y">
                {form.items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 p-2 items-center">
                    <Input
                      className="col-span-12 sm:col-span-6"
                      placeholder="Description (size, paper, finish...)"
                      value={item.description}
                      onChange={(e) => updateItem(idx, { description: e.target.value })}
                    />
                    <Input
                      className="col-span-3 sm:col-span-2"
                      type="number"
                      min={0}
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                    />
                    <Input
                      className="col-span-4 sm:col-span-2"
                      type="number"
                      min={0}
                      step="any"
                      placeholder="Rate"
                      value={item.rate}
                      onChange={(e) => updateItem(idx, { rate: e.target.value })}
                    />
                    <span className="col-span-4 sm:col-span-1 text-right text-xs font-semibold tabular-nums">
                      {formatCurrency(toNumber(item.quantity) * toNumber(item.rate))}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="col-span-1 h-8 w-8 text-destructive"
                      disabled={form.items.length === 1}
                      onClick={() => setForm({ ...form, items: form.items.filter((_, i) => i !== idx) })}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Discount (₹)</Label>
                <Input type="number" min={0} value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>GST %</Label>
                <Input type="number" min={0} max={100} value={form.gstPercent} onChange={(e) => setForm({ ...form, gstPercent: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Valid Until</Label>
                <Input type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
              </div>
            </div>

            <div className="rounded-md bg-muted/40 border p-3 text-sm space-y-1 sm:w-72 sm:ml-auto">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(totals.subtotal)}</span></div>
              <div className="flex justify-between"><span>Discount</span><span>-{formatCurrency(totals.discount)}</span></div>
              <div className="flex justify-between"><span>GST ({toNumber(form.gstPercent)}%)</span><span>{formatCurrency(totals.gstAmount)}</span></div>
              <div className="flex justify-between font-bold border-t pt-1"><span>Total</span><span>{formatCurrency(totals.total)}</span></div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Terms & Conditions</Label>
                <Textarea
                  rows={3}
                  placeholder="e.g. 50% advance, delivery in 7 working days"
                  value={form.terms}
                  onChange={(e) => setForm({ ...form, terms: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-2">
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingId ? "Save Changes" : "Create Quotation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark completed with client approval screenshot */}
      <Dialog open={!!completeTarget} onOpenChange={(open) => !open && setCompleteTarget(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Verify Client Approval — {completeTarget?.quotationNumber}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Upload the screenshot of the chat where the client approved this quotation. It is required to mark the quotation as completed.
          </p>

          <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer hover:bg-muted/40 text-sm text-muted-foreground">
            {isReadingImages ? <Loader2 className="w-6 h-6 animate-spin" /> : <ImagePlus className="w-6 h-6" />}
            <span>Click to choose screenshot(s) — JPG, PNG or WEBP</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                handleScreenshotFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>

          {completeTarget?.approvalScreenshotCount > 0 && (
            <p className="text-xs text-green-700">
              {completeTarget.approvalScreenshotCount} screenshot(s) already attached.
            </p>
          )}

          {screenshots.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {screenshots.map((src, idx) => (
                <div key={idx} className="relative rounded-md border overflow-hidden">
                  <img src={src} alt={`Approval screenshot ${idx + 1}`} className="h-28 w-full object-cover" />
                  <button
                    type="button"
                    className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white"
                    onClick={() => setScreenshots((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Textarea
              rows={2}
              placeholder="e.g. Approved on WhatsApp by Mr. Sharma"
              value={completeNote}
              onChange={(e) => setCompleteNote(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteTarget(null)}>Cancel</Button>
            <Button
              className="gap-2 bg-green-600 hover:bg-green-700"
              disabled={
                statusMutation.isPending ||
                isReadingImages ||
                (screenshots.length === 0 && !(completeTarget?.approvalScreenshotCount > 0))
              }
              onClick={() =>
                completeTarget &&
                statusMutation.mutate({
                  id: completeTarget.id,
                  status: "COMPLETED",
                  screenshots,
                  note: completeNote.trim() || undefined,
                })
              }
            >
              {statusMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Mark Completed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details */}
      <Dialog open={!!detailsId} onOpenChange={(open) => !open && setDetailsId(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Quotation {details?.quotationNumber || ""}</DialogTitle>
          </DialogHeader>
          {detailsLoading || !details ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <div className="space-y-5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={details.status} />
                <span className="text-muted-foreground">
                  Created by {details.createdBy?.fullName || "—"} on {format(new Date(details.createdAt), "dd MMM yyyy")}
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-md border p-3 space-y-1">
                  <p className="text-xs uppercase text-muted-foreground font-semibold">Client</p>
                  <p className="font-semibold">{details.clientName}</p>
                  {details.clientCompany && <p>{details.clientCompany}</p>}
                  {details.clientPhone && <p>{details.clientPhone}</p>}
                  {details.clientEmail && <p>{details.clientEmail}</p>}
                  {details.clientAddress && <p className="text-muted-foreground">{details.clientAddress}</p>}
                </div>
                <div className="rounded-md border p-3 space-y-1">
                  <p className="text-xs uppercase text-muted-foreground font-semibold">Details</p>
                  <p><span className="text-muted-foreground">Subject:</span> {details.subject}</p>
                  <p><span className="text-muted-foreground">Designer:</span> {details.assignedTo?.fullName || "Unassigned"}</p>
                  {details.validUntil && (
                    <p><span className="text-muted-foreground">Valid until:</span> {format(new Date(details.validUntil), "dd MMM yyyy")}</p>
                  )}
                  {details.completedAt && (
                    <p>
                      <span className="text-muted-foreground">Completed:</span> {format(new Date(details.completedAt), "dd MMM yyyy, hh:mm a")}
                      {details.completedBy?.fullName ? ` by ${details.completedBy.fullName}` : ""}
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Rate</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {details.items?.map((item: any, idx: number) => (
                      <tr key={idx}>
                        <td className="px-3 py-2">{idx + 1}</td>
                        <td className="px-3 py-2">{item.description}</td>
                        <td className="px-3 py-2 text-right">{item.quantity}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(item.rate)}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatCurrency(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-md bg-muted/40 border p-3 space-y-1 sm:w-72 sm:ml-auto">
                <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(details.subtotal)}</span></div>
                <div className="flex justify-between"><span>Discount</span><span>-{formatCurrency(details.discount)}</span></div>
                <div className="flex justify-between"><span>GST ({details.gstPercent}%)</span><span>{formatCurrency(details.gstAmount)}</span></div>
                <div className="flex justify-between font-bold border-t pt-1"><span>Total</span><span>{formatCurrency(details.totalAmount)}</span></div>
              </div>

              {(details.notes || details.terms) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {details.notes && (
                    <div>
                      <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">Notes</p>
                      <p className="whitespace-pre-wrap">{details.notes}</p>
                    </div>
                  )}
                  {details.terms && (
                    <div>
                      <p className="text-xs uppercase text-muted-foreground font-semibold mb-1">Terms</p>
                      <p className="whitespace-pre-wrap">{details.terms}</p>
                    </div>
                  )}
                </div>
              )}

              <div>
                <p className="text-xs uppercase text-muted-foreground font-semibold mb-2">Client Approval Screenshots</p>
                {details.approvalNote && <p className="mb-2 italic">&ldquo;{details.approvalNote}&rdquo;</p>}
                {details.approvalScreenshotUrls?.filter(Boolean).length ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {details.approvalScreenshotUrls.filter(Boolean).map((url: string, idx: number) => (
                      <a key={idx} href={url} target="_blank" rel="noreferrer" className="block rounded-md border overflow-hidden hover:opacity-90">
                        <img src={url} alt={`Approval screenshot ${idx + 1}`} className="h-36 w-full object-cover" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No approval screenshot uploaded yet.</p>
                )}
              </div>

              {details.statusHistory?.length > 0 && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground font-semibold mb-2">Status History</p>
                  <div className="space-y-1.5">
                    {details.statusHistory.map((h: any, idx: number) => (
                      <div key={idx} className="flex flex-wrap items-center gap-2 text-xs">
                        <StatusBadge status={h.status} />
                        <span>{h.changedBy?.fullName || "—"}</span>
                        <span className="text-muted-foreground">{format(new Date(h.changedAt), "dd MMM yyyy, hh:mm a")}</span>
                        {h.note && <span className="text-muted-foreground">— {h.note}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {details && details.status !== "COMPLETED" && (
              <Button className="gap-2 bg-green-600 hover:bg-green-700" onClick={() => openComplete({ ...details, approvalScreenshotCount: details.approvalScreenshots?.length || 0 })}>
                <CheckCircle2 className="w-4 h-4" />
                Mark Completed
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetailsId(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
