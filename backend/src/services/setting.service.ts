import Setting from "../models/Setting";
import reportsService from "./reports.service";
import { DEFAULT_HOLIDAYS_WITH_NAMES } from "../utils/holiday.utils";
import { leaveService } from "./leave.service";
import { getISTDate } from "../utils/date.utils";

const LEAVE_ALLOCATION_KEYS = ["sickLeave", "casualLeave", "vacationLeave"];

export const settingService = {
    /**
     * Get all settings
     */
    async getSettings() {
        const settings = await Setting.find({});

        // Convert array to key-value object
        const settingsMap: Record<string, string> = {};
        settings.forEach((setting) => {
            settingsMap[setting.key] = setting.value;
        });

        // Default to company holiday calendar if none configured yet
        if (!settingsMap.COMPANY_HOLIDAYS) {
            settingsMap.COMPANY_HOLIDAYS = JSON.stringify(DEFAULT_HOLIDAYS_WITH_NAMES);
        }

        return settingsMap;
    },

    /**
     * Update settings (bulk)
     */
    async updateSettings(settings: Record<string, string>) {
        const holidaysChanged = "COMPANY_HOLIDAYS" in settings;
        const previousHolidays = holidaysChanged
            ? (await Setting.findOne({ key: "COMPANY_HOLIDAYS" }))?.value || JSON.stringify(DEFAULT_HOLIDAYS_WITH_NAMES)
            : null;

        const operations = Object.entries(settings).map(([key, value]) => ({
            updateOne: {
                filter: { key },
                update: { $set: { key, value } },
                upsert: true,
            },
        }));

        if (operations.length > 0) {
            await Setting.bulkWrite(operations);
        }

        // If holidays were updated, reset the in-memory cache in reports service
        if (holidaysChanged) {
            reportsService.resetHolidayCache();
            await leaveService.recalculateLeavesForHolidayChange(previousHolidays, settings.COMPANY_HOLIDAYS);
        }

        if (LEAVE_ALLOCATION_KEYS.some((key) => key in settings)) {
            await leaveService.applyLeaveAllocationToYear(getISTDate(new Date()).getFullYear());
        }

        return this.getSettings();
    },

    /**
     * Get setting by key
     */
    async getSetting(key: string) {
        const setting = await Setting.findOne({ key });
        return setting?.value;
    }
};
