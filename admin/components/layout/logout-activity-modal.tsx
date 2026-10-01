"use client";

import { useEffect, useState } from "react";
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
import { productivityAPI } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, Printer, CheckCircle2 } from "lucide-react";
import {
  WorkActivitySelector,
  WorkEntry,
  HELP_SUPPORT,
  MAX_HELP_SUPPORT,
  countHelpSupport,
  toActivityPayload,
} from "@/components/productivity/work-activity-selector";

interface LogoutActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmLogout: () => void;
}

export function LogoutActivityModal({
  isOpen,
  onClose,
  onConfirmLogout,
}: LogoutActivityModalProps) {
  const [entries, setEntries] = useState<WorkEntry[]>([]);
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setEntries([]);
      setNotes("");
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (entries.length === 0) {
      toast.error("Select at least one job card, or use Skip & Sign Out");
      return;
    }
    if (countHelpSupport(entries) > MAX_HELP_SUPPORT) {
      toast.error(`"${HELP_SUPPORT}" can be selected for only ${MAX_HELP_SUPPORT} job cards`);
      return;
    }

    try {
      setIsSubmitting(true);
      await productivityAPI.logActivities({
        entries: toActivityPayload(entries),
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
          <WorkActivitySelector entries={entries} onChange={setEntries} enabled={isOpen} />

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
