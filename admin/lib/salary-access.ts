/**
 * Who may view / manage ALL employee salaries & payroll in the admin UI.
 * Mirrors backend/src/utils/salaryAccess.ts
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
} | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;

  const name = (user.roleName || "").trim();
  if (!name) return false;
  return SALARY_ROLE_NAME_PATTERNS.some((re) => re.test(name));
}
