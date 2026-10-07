/**
 * Full-time salary sheet — mirrors the company Excel salary sheet formulas.
 *
 *   Monthly Salary (K) = ROUND(Rate / MonthDays * DaysWorked, 0)
 *   Basic + D.A.  (L)  = K * 50%
 *   H.R.A.        (M)  = K * 40%
 *   Conveyance    (N)  = K * 10%
 *   Gross         (O)  = L + M + N
 *   EPF           (P)  = ROUND(L * 12%, 0)
 *   ESIC          (Q)  = CEILING(O * 0.75%, 1)
 *   PT            (R)  = O < 7500 ? 0 : O < 10000 ? 175 : 200
 *   Total Ded.    (U)  = P + Q + R + Advance + Other
 *   Net           (V)  = O - U
 */

export const FULL_TIME_SHEET_RULE = "FULL_TIME_SHEET";

export interface SalarySheetInput {
  salaryRate: number;
  monthDays: number;
  daysWorked: number;
  advanceDeduction?: number;
  otherDeduction?: number;
}

export interface SalarySheetResult {
  salaryRate: number;
  monthDays: number;
  daysWorked: number;
  earnedSalary: number;
  basicDa: number;
  hra: number;
  conveyance: number;
  grossPay: number;
  epf: number;
  esic: number;
  professionalTax: number;
  advanceDeduction: number;
  otherDeduction: number;
  totalDeductions: number;
  netPay: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function professionalTaxFor(gross: number): number {
  if (gross < 7500) return 0;
  if (gross < 10000) return 175;
  return 200;
}

export function computeSalarySheet(input: SalarySheetInput): SalarySheetResult {
  const salaryRate = Math.max(0, Number(input.salaryRate) || 0);
  const monthDays = Math.max(1, Number(input.monthDays) || 1);
  const daysWorked = Math.min(monthDays, Math.max(0, Number(input.daysWorked) || 0));
  const advanceDeduction = Math.max(0, Number(input.advanceDeduction) || 0);
  const otherDeduction = Math.max(0, Number(input.otherDeduction) || 0);

  const earnedSalary = Math.round((salaryRate / monthDays) * daysWorked);
  const basicDa = round2(earnedSalary * 0.5);
  const hra = round2(earnedSalary * 0.4);
  const conveyance = round2(earnedSalary * 0.1);
  const grossPay = round2(basicDa + hra + conveyance);

  const epf = Math.round(basicDa * 0.12);
  const esic = Math.ceil(round2((grossPay * 0.75) / 100));
  const professionalTax = professionalTaxFor(grossPay);

  const totalDeductions = round2(epf + esic + professionalTax + advanceDeduction + otherDeduction);
  const netPay = round2(grossPay - totalDeductions);

  return {
    salaryRate,
    monthDays,
    daysWorked,
    earnedSalary,
    basicDa,
    hra,
    conveyance,
    grossPay,
    epf,
    esic,
    professionalTax,
    advanceDeduction,
    otherDeduction,
    totalDeductions,
    netPay,
  };
}
