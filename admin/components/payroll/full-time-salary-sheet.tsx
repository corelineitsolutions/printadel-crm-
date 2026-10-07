"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { CheckCircle2, Download, FileSpreadsheet, Loader2, Plus, RotateCcw, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { payrollAPI } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { ageOn, exportSalarySheet, SalarySheetRow } from "@/lib/salary-sheet-export";

interface Props {
  payrolls: any[];
  employees: any[];
  month: number | "all";
  year: number;
  monthLabel: string;
  onGenerate: (userId: string) => void;
  generatingUserId: string | null;
  onBulkGenerate: () => void;
  isBulkGenerating: boolean;
  onProcess: (payrollId: string) => void;
  onMarkPaid: (payrollId: string) => void;
  isActionPending: boolean;
}

const rupees = (n: number | undefined) => formatCurrency(n || 0).replace(/\.00$/, "");

function toSheetRow(p: any): SalarySheetRow {
  return {
    name: p.user?.fullName || "Unknown",
    gender: p.user?.gender,
    dateOfBirth: p.user?.dateOfBirth,
    joinDate: p.user?.joinDate,
    monthDays: p.monthDays || 0,
    daysWorked: p.daysWorked || 0,
    salaryRate: p.salaryRate || 0,
    earnedSalary: p.earnedSalary || 0,
    basicDa: p.basicDa || 0,
    hra: p.hra || 0,
    conveyance: p.conveyance || 0,
    grossPay: p.grossPay || 0,
    epf: p.epf || 0,
    esic: p.esic || 0,
    professionalTax: p.professionalTax || 0,
    advanceDeduction: p.advanceDeduction || 0,
    otherDeduction: p.otherDeduction || 0,
    totalDeductions: p.deductions || 0,
    netPay: p.netPay || 0,
  };
}

function EditableNumber({
  value,
  disabled,
  max,
  onSave,
  highlight,
}: {
  value: number;
  disabled?: boolean;
  max?: number;
  onSave: (value: number) => void;
  highlight?: boolean;
}) {
  const [draft, setDraft] = useState(String(value ?? 0));

  const commit = () => {
    const parsed = Number(draft);
    if (draft.trim() === "" || Number.isNaN(parsed) || parsed < 0 || (max !== undefined && parsed > max)) {
      toast.error(max !== undefined ? `Enter a value between 0 and ${max}` : "Enter a valid amount");
      setDraft(String(value ?? 0));
      return;
    }
    if (parsed !== value) onSave(parsed);
  };

  return (
    <input
      type="number"
      min={0}
      max={max}
      step="any"
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={`w-20 rounded border px-1.5 py-1 text-right text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-muted/50 disabled:cursor-not-allowed ${
        highlight ? "border-amber-400 bg-amber-50" : "border-input bg-background"
      }`}
    />
  );
}

export function FullTimeSalarySheet({
  payrolls,
  employees,
  month,
  year,
  monthLabel,
  onGenerate,
  generatingUserId,
  onBulkGenerate,
  isBulkGenerating,
  onProcess,
  onMarkPaid,
  isActionPending,
}: Props) {
  const queryClient = useQueryClient();
  const [isExporting, setIsExporting] = useState(false);

  const updateSheetMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof payrollAPI.updateSalarySheet>[1] }) =>
      payrollAPI.updateSalarySheet(id, data),
    onSuccess: () => {
      toast.success("Salary updated");
      queryClient.invalidateQueries({ queryKey: ["payrolls"] });
      queryClient.invalidateQueries({ queryKey: ["payroll-stats"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to update salary");
      queryClient.invalidateQueries({ queryKey: ["payrolls"] });
    },
  });

  if (month === "all") {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 opacity-50" />
          Select a month to view the full-time salary sheet.
        </CardContent>
      </Card>
    );
  }

  const monthEnd = new Date(year, month, 0);
  const generatedUserIds = new Set(payrolls.map((p) => String(p.userId?._id || p.userId)));
  const missingEmployees = employees.filter((e) => !generatedUserIds.has(String(e.id || e._id)));
  const sheetPayrolls = payrolls.filter((p) => p.payrollRule === "FULL_TIME_SHEET");
  const outdatedPayrolls = payrolls.filter((p) => p.payrollRule !== "FULL_TIME_SHEET");

  const total = (key: string) => sheetPayrolls.reduce((s, p) => s + (Number(p[key]) || 0), 0);

  const handleExport = async () => {
    if (sheetPayrolls.length === 0) {
      toast.error("No salary sheet rows to export. Generate payroll first.");
      return;
    }
    setIsExporting(true);
    try {
      await exportSalarySheet(sheetPayrolls.map(toSheetRow), month, year);
      toast.success("Salary sheet exported");
    } catch (err) {
      console.error(err);
      toast.error("Failed to export salary sheet");
    } finally {
      setIsExporting(false);
    }
  };

  const th = "px-2 py-2 text-center font-semibold text-[11px] uppercase tracking-wide text-muted-foreground border-r last:border-r-0 whitespace-nowrap";
  const td = "px-2 py-2 text-center text-xs tabular-nums border-r last:border-r-0 whitespace-nowrap";

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            Full-time Salary Sheet — {monthLabel} {year}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Monthly Salary = Rate ÷ Month Days × Days Worked · Basic+DA 50% · HRA 40% · Conveyance 10% · EPF 12% of Basic · ESIC 0.75% · PT ₹0/175/200.
            Edit Days Worked, ADV and OTHER directly in the table.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="outline" className="gap-2" onClick={onBulkGenerate} disabled={isBulkGenerating}>
            {isBulkGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
            Generate / Refresh All
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={handleExport} disabled={isExporting}>
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export Excel
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {outdatedPayrolls.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {outdatedPayrolls.length} payroll(s) were generated with the old calculation. Click &quot;Generate / Refresh All&quot; to convert them to the salary sheet format.
          </div>
        )}

        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm min-w-[1400px]">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className={th} rowSpan={2}>Sr.</th>
                <th className={`${th} text-left`} rowSpan={2}>Name of the Employee</th>
                <th className={th} rowSpan={2}>Sex</th>
                <th className={th} rowSpan={2}>Age</th>
                <th className={th} rowSpan={2}>Date of Entry</th>
                <th className={th} rowSpan={2}>Month Days</th>
                <th className={th} rowSpan={2}>Days Worked</th>
                <th className={th} rowSpan={2}>Salary Rate</th>
                <th className={th} rowSpan={2}>Monthly Salary</th>
                <th className={th} rowSpan={2}>Basic + D.A.</th>
                <th className={th} rowSpan={2}>H.R.A.</th>
                <th className={th} rowSpan={2}>Conveyance</th>
                <th className={`${th} bg-blue-50 text-blue-800`} rowSpan={2}>Gross Wages</th>
                <th className={`${th} border-b`} colSpan={6}>Deductions</th>
                <th className={`${th} bg-emerald-50 text-emerald-800`} rowSpan={2}>Net Wages</th>
                <th className={th} rowSpan={2}>Status</th>
                <th className={th} rowSpan={2}>Actions</th>
              </tr>
              <tr>
                <th className={th}>EPF</th>
                <th className={th}>ESIC</th>
                <th className={th}>PT</th>
                <th className={th}>ADV</th>
                <th className={th}>Other</th>
                <th className={th}>Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sheetPayrolls.map((p, idx) => {
                const locked = p.status === "PAID";
                const pending = updateSheetMutation.isPending && updateSheetMutation.variables?.id === p.id;
                const age = ageOn(p.user?.dateOfBirth, monthEnd);
                return (
                  <tr key={p.id} className="hover:bg-muted/30">
                    <td className={td}>{idx + 1}</td>
                    <td className={`${td} text-left font-semibold`}>
                      {p.user?.fullName || "Unknown"}
                      {pending && <Loader2 className="inline w-3 h-3 ml-1 animate-spin" />}
                    </td>
                    <td className={td}>{p.user?.gender === "M" || p.user?.gender === "F" ? p.user.gender : "—"}</td>
                    <td className={td}>{age ?? "—"}</td>
                    <td className={td}>{p.user?.joinDate ? format(new Date(p.user.joinDate), "dd-MM-yyyy") : "—"}</td>
                    <td className={td}>{p.monthDays}</td>
                    <td className={td}>
                      <div className="flex items-center justify-center gap-1">
                        <EditableNumber
                          key={`days-${p.id}-${p.daysWorked}`}
                          value={p.daysWorked}
                          max={p.monthDays}
                          disabled={locked}
                          highlight={p.daysWorkedManual}
                          onSave={(v) => updateSheetMutation.mutate({ id: p.id, data: { daysWorked: v } })}
                        />
                        {p.daysWorkedManual && !locked && (
                          <button
                            type="button"
                            title="Reset to attendance-based days"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => updateSheetMutation.mutate({ id: p.id, data: { daysWorked: null } })}
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className={td}>{rupees(p.salaryRate)}</td>
                    <td className={td}>{rupees(p.earnedSalary)}</td>
                    <td className={td}>{rupees(p.basicDa)}</td>
                    <td className={td}>{rupees(p.hra)}</td>
                    <td className={td}>{rupees(p.conveyance)}</td>
                    <td className={`${td} font-semibold bg-blue-50/50`}>{rupees(p.grossPay)}</td>
                    <td className={td}>{rupees(p.epf)}</td>
                    <td className={td}>{rupees(p.esic)}</td>
                    <td className={td}>{rupees(p.professionalTax)}</td>
                    <td className={td}>
                      <EditableNumber
                        key={`adv-${p.id}-${p.advanceDeduction}`}
                        value={p.advanceDeduction || 0}
                        disabled={locked}
                        onSave={(v) => updateSheetMutation.mutate({ id: p.id, data: { advanceDeduction: v } })}
                      />
                    </td>
                    <td className={td}>
                      <EditableNumber
                        key={`other-${p.id}-${p.otherDeduction}`}
                        value={p.otherDeduction || 0}
                        disabled={locked}
                        onSave={(v) => updateSheetMutation.mutate({ id: p.id, data: { otherDeduction: v } })}
                      />
                    </td>
                    <td className={`${td} text-rose-600 font-medium`}>{rupees(p.deductions)}</td>
                    <td className={`${td} font-bold text-emerald-700 bg-emerald-50/50`}>{rupees(p.netPay)}</td>
                    <td className={td}>
                      <Badge
                        className={
                          p.status === "PAID" ? "bg-green-500" : p.status === "PROCESSED" ? "bg-blue-500" : "bg-yellow-500"
                        }
                      >
                        {p.status}
                      </Badge>
                    </td>
                    <td className={td}>
                      <div className="flex items-center justify-center gap-1">
                        {p.status === "DRAFT" && (
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={isActionPending} onClick={() => onProcess(p.id)}>
                            Process
                          </Button>
                        )}
                        {p.status === "PROCESSED" && (
                          <Button size="sm" className="h-7 px-2 text-xs gap-1" disabled={isActionPending} onClick={() => onMarkPaid(p.id)}>
                            <CheckCircle2 className="w-3 h-3" />
                            Paid
                          </Button>
                        )}
                        <Button
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          title="Download salary slip (PDF)"
                          onClick={() => window.open(`/payroll/${p.id}?download=true`, "_blank")}
                        >
                          <Download className="w-3 h-3" />
                          Slip
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {missingEmployees.map((emp) => {
                const id = emp.id || emp._id;
                return (
                  <tr key={`missing-${id}`} className="bg-muted/20">
                    <td className={td}>—</td>
                    <td className={`${td} text-left font-medium text-muted-foreground`}>{emp.fullName}</td>
                    <td className={td} colSpan={6}>
                      <span className="text-muted-foreground">
                        Rate {emp.monthlySalary ? rupees(emp.monthlySalary) : "not set"}
                      </span>
                    </td>
                    <td className={`${td} text-muted-foreground italic`} colSpan={12}>
                      Payroll not generated for {monthLabel} {year}
                    </td>
                    <td className={td}>—</td>
                    <td className={td}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs gap-1"
                        disabled={!emp.monthlySalary || generatingUserId === id}
                        title={emp.monthlySalary ? "Generate payroll" : "Set monthly salary on the employee first"}
                        onClick={() => onGenerate(id)}
                      >
                        {generatingUserId === id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                        Generate
                      </Button>
                    </td>
                  </tr>
                );
              })}

              {sheetPayrolls.length === 0 && missingEmployees.length === 0 && (
                <tr>
                  <td colSpan={22} className="py-10 text-center text-muted-foreground">
                    No full-time employees found.
                  </td>
                </tr>
              )}
            </tbody>
            {sheetPayrolls.length > 0 && (
              <tfoot className="bg-muted/40 border-t font-bold">
                <tr>
                  <td className={td} colSpan={7}>TOTAL ({sheetPayrolls.length})</td>
                  <td className={td}>{rupees(total("salaryRate"))}</td>
                  <td className={td}>{rupees(total("earnedSalary"))}</td>
                  <td className={td}>{rupees(total("basicDa"))}</td>
                  <td className={td}>{rupees(total("hra"))}</td>
                  <td className={td}>{rupees(total("conveyance"))}</td>
                  <td className={td}>{rupees(total("grossPay"))}</td>
                  <td className={td}>{rupees(total("epf"))}</td>
                  <td className={td}>{rupees(total("esic"))}</td>
                  <td className={td}>{rupees(total("professionalTax"))}</td>
                  <td className={td}>{rupees(total("advanceDeduction"))}</td>
                  <td className={td}>{rupees(total("otherDeduction"))}</td>
                  <td className={td}>{rupees(total("deductions"))}</td>
                  <td className={`${td} text-emerald-700`}>{rupees(total("netPay"))}</td>
                  <td className={td} colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
