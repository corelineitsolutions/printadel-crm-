import { Request, Response } from "express";
import { settingService } from "../services/setting.service";

export const settingController = {
    /**
     * Get all settings
     * GET /api/settings
     */
    async getSettings(_req: Request, res: Response) {
        try {
            const settings = await settingService.getSettings();

            return res.json({
                success: true,
                data: settings,
            });
        } catch (error: any) {
            console.error("Get settings error:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to fetch settings",
            });
        }
    },

    /**
     * Update settings
     * PUT /api/settings
     */
    async updateSettings(req: Request, res: Response) {
        try {
            const settings = req.body;

            if (!settings || typeof settings !== "object") {
                return res.status(400).json({
                    success: false,
                    message: "Invalid settings data",
                });
            }

            const updatedSettings = await settingService.updateSettings(settings);

            return res.json({
                success: true,
                message: "Settings updated successfully",
                data: updatedSettings,
            });
        } catch (error: any) {
            console.error("Update settings error:", error);
            return res.status(500).json({
                success: false,
                message: "Failed to update settings",
            });
        }
    }
};
