"use client";

import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { jobCardAPI, productivityAPI } from "@/lib/api";
import { toast } from "sonner";
import { Loader2, LogOut, Printer, CheckCircle2, Clock } from "lucide-react";

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
  const [selectedJobCard, setSelectedJobCard] = useState<string>("general");
  const [selectedActivity, setSelectedActivity] = useState<string>("Printing");
  const [durationMinutes, setDurationMinutes] = useState<number>(60);
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Fetch active Job Cards
  const { data: jobCardsData, isLoading: loadingJobCards } = useQuery({
    queryKey: ["activeJobCardsForLogout"],
    queryFn: async () => {
      const response = await jobCardAPI.getAllJobCards({ status: "ACTIVE_ALL" });
      return response.data?.data?.jobCards || [];
    },
    enabled: isOpen,
  });

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);

      await productivityAPI.logActivity({
        jobCardId: selectedJobCard && selectedJobCard !== "general" ? selectedJobCard : undefined,
        activityType: selectedActivity,
        durationMinutes: Number(durationMinutes) || 60,
        notes: notes.trim(),
        isLogoutSession: true,
      });

      toast.success("Work activity recorded successfully!");
      onConfirmLogout();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to record activity, logging out anyway.");
      onConfirmLogout();
    } finally {
      setIsSubmitting(false);
    }
  };

  const jobCards = Array.isArray(jobCardsData) ? jobCardsData : [];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-[500px] rounded-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">Logout Activity & Productivity</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Record what Job Card / Order you worked on before signing out.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Job Card Selection */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Job Card / Order Worked On
            </Label>
            <Select value={selectedJobCard} onValueChange={setSelectedJobCard}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder={loadingJobCards ? "Loading job cards..." : "Select Job Card"} />
              </SelectTrigger>
              <SelectContent className="max-h-60 rounded-xl">
                <SelectItem value="general" className="font-semibold text-primary">
                  ⭐ General Operations / Non-Job Work
                </SelectItem>
                {jobCards.map((jc: any) => (
                  <SelectItem key={jc._id} value={jc._id}>
                    <span className="font-medium text-foreground">{jc.jobCardNumber}</span> — {jc.title} ({jc.clientName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Activity Type Selection */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Activity Performed
            </Label>
            <Select value={selectedActivity} onValueChange={setSelectedActivity}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Select activity" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {DEFAULT_ACTIVITIES.map((act) => (
                  <SelectItem key={act} value={act}>
                    {act}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Time Spent */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Time Spent on This Activity
              </Label>
              <span className="text-xs font-bold text-primary flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {(durationMinutes / 60).toFixed(1)} hrs ({durationMinutes} mins)
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2 pt-1">
              {[30, 60, 120, 180].map((mins) => (
                <Button
                  key={mins}
                  type="button"
                  size="sm"
                  variant={durationMinutes === mins ? "default" : "outline"}
                  className="rounded-xl text-xs h-8"
                  onClick={() => setDurationMinutes(mins)}
                >
                  {mins < 60 ? `${mins}m` : `${mins / 60}h`}
                </Button>
              ))}
            </div>
          </div>

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
              disabled={isSubmitting}
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
