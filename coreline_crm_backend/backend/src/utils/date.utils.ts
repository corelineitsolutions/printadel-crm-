
/**
 * Timezone Utility for IST (UTC+5:30)
 * Ensures consistency across server and client regardless of hosting timezone.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Returns a new Date object adjusted to IST.
 * This "shifts" the timestamp so that the local hours match IST hours.
 * Useful for display and grouping.
 */
export function getISTDate(date: Date = new Date()): Date {
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  return new Date(utc + IST_OFFSET_MS);
}

/**
 * Returns the exact UTC timestamp corresponding to 00:00:00 IST of the given date.
 * This is the standard "Day ID" stored in the database `date` field.
 */
export function getISTStartOfDay(date: Date = new Date()): Date {
  // 1. Get the IST date components (Year, Month, Day)
  const temp = new Date(date.getTime() + IST_OFFSET_MS);
  const y = temp.getUTCFullYear();
  const m = temp.getUTCMonth();
  const d = temp.getUTCDate();
  
  // 2. Create a UTC date at 00:00:00
  // 3. Subtract 5.5 hours to get the exact UTC moment when it becomes 00:00 in India
  return new Date(Date.UTC(y, m, d, 0, 0, 0, 0) - IST_OFFSET_MS);
}

/**
 * Returns the exact UTC timestamp corresponding to 23:59:59.999 IST of the given date.
 */
export function getISTEndOfDay(date: Date = new Date()): Date {
  const start = getISTStartOfDay(date);
  return new Date(start.getTime() + (24 * 60 * 60 * 1000) - 1);
}

/**
 * Returns a clean Date object for the start of the IST day.
 */
export function getISTDateString(date: Date = new Date()): Date {
    return getISTStartOfDay(date);
}
