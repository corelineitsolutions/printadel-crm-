import Setting from "../models/Setting";
import { getISTDate } from "./date.utils";

/**
 * Default holidays for 2026 (company-specific calendar).
 * Used as fallback if no COMPANY_HOLIDAYS setting exists in the DB.
 */
export const DEFAULT_HOLIDAYS_WITH_NAMES: string[] = [
  "2026-01-01|New Year's Day",
  "2026-01-26|Republic Day",
  "2026-02-19|Chhatrapati Shivaji Maharaj Jayanti",
  "2026-03-03|Holika Dahan",
  "2026-03-04|Holi",
  "2026-03-19|Gudi Padwa",
  "2026-05-01|Maharashtra Din / Labour Day",
  "2026-08-15|Independence Day",
  "2026-09-14|Ganesh Chaturthi",
  "2026-10-02|Mahatma Gandhi Jayanti",
  "2026-10-20|Dussehra (Vijayadashami)",
  "2026-11-08|Diwali (Lakshmi Pujan)",
  "2026-11-10|Diwali (Balipratipada / New Year)",
  "2026-11-11|Bhai Dooj (Bhaubeej)",
  "2026-12-25|Christmas Day",
];

export const DEFAULT_HOLIDAYS: string[] = DEFAULT_HOLIDAYS_WITH_NAMES.map(
  (entry) => entry.split("|")[0].trim()
);

/**
 * Load holidays from Setting model.
 * Stored in Setting as key="COMPANY_HOLIDAYS", value=JSON array of strings.
 * Each entry is either "YYYY-MM-DD" or "YYYY-MM-DD|Holiday Name".
 */
export async function loadCompanyHolidays(): Promise<Set<string>> {
  try {
    const setting = await Setting.findOne({ key: "COMPANY_HOLIDAYS" });
    if (setting?.value) {
      const parsed: string[] = JSON.parse(setting.value);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const dates = parsed.map((entry) => entry.split("|")[0].trim());
        return new Set(dates);
      }
    }
  } catch (err) {
    console.warn("Could not load COMPANY_HOLIDAYS from DB, using defaults:", err);
  }
  return new Set(DEFAULT_HOLIDAYS);
}

/**
 * Check if a given date is a company holiday.
 */
export function isCompanyHoliday(date: Date, holidaySet: Set<string>): boolean {
  const ist = getISTDate(date);
  const y = ist.getFullYear();
  const m = String(ist.getMonth() + 1).padStart(2, "0");
  const d = String(ist.getDate()).padStart(2, "0");
  return holidaySet.has(`${y}-${m}-${d}`);
}
