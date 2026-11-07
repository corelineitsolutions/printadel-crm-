import { UserRole } from "../models/User";

/**
 * Who may view / manage ALL employee salaries & payroll.
 * - ADMIN always
 * - Custom role names: HR, Accounts Manager (and close variants)
 * Everyone else (incl. regular managers) may only see their own payslip.
 */
const SALARY_ROLE_NAME_PATTERNS = [
  /^hr$/i,
  /^h\.?r\.?$/i,
  /^human\s*resources?$/i,
  /^accounts?\s*managers?$/i,
  /^account\s*managers?$/i,
  /^accounts?$/i,
  /^accountants?$/i,
  /^accounts?\s*heads?$/i,
  /^finance\s*managers?$/i,
];

export function canManageAllSalaries(user: {
  role?: string | null;
  roleName?: string | null;
}): boolean {
  if (!user) return false;
  if (user.role === UserRole.ADMIN || user.role === "ADMIN") return true;

  const name = (user.roleName || "").trim();
  if (!name) return false;
  return SALARY_ROLE_NAME_PATTERNS.some((re) => re.test(name));
}

/** Fields that must not leak to users without salary access */
export const SALARY_SENSITIVE_FIELDS = [
  "monthlySalary",
  "hourlyRate",
  "overtimeMultiplier",
  "salary",
] as const;

export function stripSalaryFields<T extends Record<string, any>>(doc: T): T {
  if (!doc || typeof doc !== "object") return doc;
  const out: any = { ...doc };
  for (const key of SALARY_SENSITIVE_FIELDS) {
    if (key in out) delete out[key];
  }
  return out;
}
