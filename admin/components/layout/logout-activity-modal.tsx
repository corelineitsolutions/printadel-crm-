"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { jobCardAPI, productivityAPI } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Printer, CheckCircle2, Search, X } from "lucide-react";

const DEFAULT_ACTIVITIES = [
  "Printing",
  "Design / Pre-press",
  "Cutting & Finishing",
  "Binding",
  "Packaging",
  "Delivery / Dispatch",
  "Machine Maintenance",
  "Help / Support",
  "Other",
];

const HELP_SUPPORT = "Help / Support";
const MAX_HELP_SUPPORT = 2;
const GENERAL_KEY = "general";
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480];

interface WorkEntry {
  key: string;
  activityType: string;
  durationMinutes: number;
}

interface LogoutActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmLogout: () => void;
}

const formatDuration = (mins: number) =>
  mins < 60 ? `${mins} min` : `${(mins / 60).toFixed(mins % 60 === 0 ? 0 : 1)} hr`;

export function LogoutActivityModal({
  isOpen,
  onClose,
  onConfirmLogout,
}: LogoutActivityModalProps) {
  const [entries, setEntries] = useState<WorkEntry[]>([]);
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setEntries([]);
      setSearch("");
      setNotes("");
    }
  }, [isOpen]);

  const { data: jobCardsData, isLoading: loadingJobCards } = useQuery({
    queryKey: ["activeJobCardsForLogout"],
    queryFn: async () => {
      const response = await jobCardAPI.getAllJobCards({ status: "ACTIVE_ALL" });
      return response.data?.data?.jobCards || [];
    },
    enabled: isOpen,
  });

  const jobCards: any[] = Array.isArray(jobCardsData) ? jobCardsData : [];
  const jobCardById = useMemo(() => {
    const map = new Map<string, any>();
    jobCards.forEach((jc) => map.set(String(jc._id || jc.id), jc));
    return map;
  }, [jobCards]);

  const filteredJobCards = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return jobCards;
    return jobCards.filter((jc) =>
      [jc.jobCardNumber, jc.title, jc.clientName]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(term))
    );
  }, [jobCards, search]);

  const helpSupportCount = entries.filter((e) => e.activityType === HELP_SUPPORT).length;
  const totalMinutes = entries.reduce((sum, e) => sum + e.durationMinutes, 0);

  const isSelected = (key: string) => entries.some((e) => e.key === key);

  const toggleEntry = (key: string, checked: boolean) => {
    setEntries((prev) =>
      checked
        ? prev.some((e) => e.key === key)
          ? prev
          : [...prev, { key, activityType: "Printing", durationMinutes: 60 }]
        : prev.filter((e) => e.key !== key)
    );
  };

  const updateEntry = (key: string, patch: Partial<WorkEntry>) => {
    setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  };

  const changeActivity = (key: string, activityType: string) => {
    const current = entries.find((e) => e.key === key);
    if (
      activityType === HELP_SUPPORT &&
      current?.activityType !== HELP_SUPPORT &&
      helpSupportCount >= MAX_HELP_SUPPORT
    ) {
      toast.error(`"${HELP_SUPPORT}" can be selected for only ${MAX_HELP_SUPPORT} job cards`);
      return;
    }
    updateEntry(key, { activityType });
  };

  const entryLabel = (key: string) => {
    if (key === GENERAL_KEY) return { title: "General Operations / Non-Job Work", sub: "" };
    const jc = jobCardById.get(key);
    return jc
      ? { title: `${jc.jobCardNumber} — ${jc.title}`, sub: jc.clientName || "" }
      : { title: "Job card", sub: "" };
  };

  const handleSubmit = async () => {
    if (entries.length === 0) {
      toast.error("Select at least one job card, or use Skip & Sign Out");
      return;
    }
    if (helpSupportCount > MAX_HELP_SUPPORT) {
      toast.error(`"${HELP_SUPPORT}" can be selected for only ${MAX_HELP_SUPPORT} job cards`);
      return;
    }

    try {
      setIsSubmitting(true);
      await productivityAPI.logActivities({
        entries: entries.map((e) => ({
          jobCardId: e.key === GENERAL_KEY ? undefined : e.key,
          activityType: e.activityType,
          durationMinutes: e.durationMinutes,
        })),
        notes: notes.trim(),
        isLogoutSession: true,
      });

      toast.success(
        entries.length > 1
          ? `${entries.length} work activities recorded successfully!`
          : "Work activity recorded successfully!"
      );
      onConfirmLogout();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to record activity, logging out anyway.");
      onConfirmLogout();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-[640px] w-[95vw] max-h-[90dvh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">Logout Activity & Productivity</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Select every Job Card you worked on, then choose the activity and time for each.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Job Card multi-select */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Job Cards / Orders Worked On
              </Label>
              <span className="text-xs text-muted-foreground">{entries.length} selected</span>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search job card #, title or client..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 rounded-xl"
              />
            </div>

            <div className="border rounded-xl max-h-48 overflow-y-auto divide-y">
              <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50">
                <Checkbox
                  checked={isSelected(GENERAL_KEY)}
                  onCheckedChange={(checked) => toggleEntry(GENERAL_KEY, !!checked)}
                />
                <span className="text-sm font-semibold text-primary">
                  ⭐ General Operations / Non-Job Work
                </span>
              </label>

              {loadingJobCards ? (
                <div className="flex items-center justify-center py-4 text-sm text-muted-foreground gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading job cards...
                </div>
              ) : filteredJobCards.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {search ? "No job cards match your search" : "No active job cards"}
                </p>
              ) : (
                filteredJobCards.map((jc) => {
                  const id = String(jc._id || jc.id);
                  return (
                    <label
                      key={id}
                      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={isSelected(id)}
                        onCheckedChange={(checked) => toggleEntry(id, !!checked)}
                      />
                      <span className="text-sm min-w-0">
                        <span className="font-medium text-foreground">{jc.jobCardNumber}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          — {jc.title}
                          {jc.clientName ? ` (${jc.clientName})` : ""}
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Per job card activity + time */}
          {entries.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Activity & Time per Job Card
                </Label>
                <span
                  className={`text-xs font-medium ${
                    helpSupportCount >= MAX_HELP_SUPPORT ? "text-amber-600" : "text-muted-foreground"
                  }`}
                >
                  {HELP_SUPPORT}: {helpSupportCount}/{MAX_HELP_SUPPORT}
                </span>
              </div>

              <div className="space-y-2">
                {entries.map((entry) => {
                  const label = entryLabel(entry.key);
                  const helpSupportLocked =
                    helpSupportCount >= MAX_HELP_SUPPORT && entry.activityType !== HELP_SUPPORT;
                  return (
                    <div
                      key={entry.key}
                      className="rounded-xl border bg-muted/30 p-3 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{label.title}</p>
                          {label.sub && (
                            <p className="text-xs text-muted-foreground truncate">{label.sub}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleEntry(entry.key, false)}
                          className="text-muted-foreground hover:text-foreground shrink-0"
                          aria-label="Remove"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2">
                        <Select
                          value={entry.activityType}
                          onValueChange={(val) => changeActivity(entry.key, val)}
                        >
                          <SelectTrigger className="rounded-xl h-9 bg-background">
                            <SelectValue placeholder="Select activity" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            {DEFAULT_ACTIVITIES.map((act) => (
                              <SelectItem
                                key={act}
                                value={act}
                                disabled={act === HELP_SUPPORT && helpSupportLocked}
                              >
                                {act}
                                {act === HELP_SUPPORT && helpSupportLocked
                                  ? ` (limit ${MAX_HELP_SUPPORT} reached)`
                                  : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={String(entry.durationMinutes)}
                          onValueChange={(val) =>
                            updateEntry(entry.key, { durationMinutes: Number(val) })
                          }
                        >
                          <SelectTrigger className="rounded-xl h-9 bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            {DURATION_OPTIONS.map((mins) => (
                              <SelectItem key={mins} value={String(mins)}>
                                {formatDuration(mins)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="text-xs text-muted-foreground text-right">
                Total: <span className="font-semibold text-primary">{formatDuration(totalMinutes)}</span>
                {" "}({totalMinutes} mins)
              </p>
            </div>
          )}

          {/* Work Summary / Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Brief Work Summary (Optional)
            </Label>
            <Textarea
              placeholder="e.g. Printed 2500 sheets on 4-color press, adjusted front margins..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-xl resize-none text-sm"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
          <Button
            type="button"
            variant="ghost"
            onClick={onConfirmLogout}
            disabled={isSubmitting}
            className="rounded-xl text-muted-foreground hover:text-foreground text-xs"
          >
            Skip & Sign Out
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || entries.length === 0}
              className="rounded-xl gap-2 font-medium"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Record & Log Out
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
