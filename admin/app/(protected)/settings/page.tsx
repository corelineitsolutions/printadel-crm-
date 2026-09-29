"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Building2, MapPin, Clock, Mail, Bell, Loader2, CalendarDays, Trash2, Plus } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function SettingsPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "ADMIN";
  const queryClient = useQueryClient();

  const { register, handleSubmit, reset, setValue } = useForm();

  // ── Holiday state ────────────────────────────────────────────────────────
  // Each holiday: { name: string; date: string } e.g. { name: "Holi", date: "2026-03-04" }
  const [holidays, setHolidays] = useState<{ name: string; date: string }[]>([]);
  const [newHolidayName, setNewHolidayName] = useState("");
  const [newHolidayDate, setNewHolidayDate] = useState("");

  // Fetch settings
  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await api.get("/settings");
      return res.data.data;
    },
    enabled: isAdmin,
  });

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: (data: any) => api.put("/settings", data),
    onSuccess: () => {
      toast.success("Settings updated successfully");
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to update settings");
    },
  });

  // Populate form + holidays from fetched settings
  useEffect(() => {
    if (settings) {
      Object.entries(settings).forEach(([key, value]) => {
        setValue(key, value);
      });
      // Parse COMPANY_HOLIDAYS into our local state
      if (settings.COMPANY_HOLIDAYS) {
        try {
          const parsed: string[] = JSON.parse(settings.COMPANY_HOLIDAYS);
          // parsed is array of "YYYY-MM-DD" strings; convert to {name, date} objects.
          // Names are stored as "DATE|NAME" pairs in newer format, or just dates in old format.
          const loaded = parsed.map((entry) => {
            if (entry.includes("|")) {
              const [date, ...nameParts] = entry.split("|");
              return { date, name: nameParts.join("|") };
            }
            return { date: entry, name: "" };
          });
          setHolidays(loaded);
        } catch {
          setHolidays([]);
        }
      }
    }
  }, [settings, setValue]);

  const onSave = (data: any) => {
    updateSettingsMutation.mutate(data);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error("File size should be less than 2MB");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setValue(field, reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Settings className="w-16 h-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-bold mb-2">Access Restricted</h2>
        <p className="text-muted-foreground">Only administrators can access settings.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Settings className="w-8 h-8" />
          System Settings
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure company-wide settings and preferences
        </p>
      </div>

      <Tabs defaultValue="company" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="leave">Leave Policy</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="holidays">Holidays</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        {/* Company Settings */}
        <TabsContent value="company">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Company Information
              </CardTitle>
              <CardDescription>
                Update your company details and branding
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSave)} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input id="companyName" {...register("companyName")} placeholder="Company CRM" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyEmail">Company Email</Label>
                    <Input id="companyEmail" type="email" {...register("companyEmail")} placeholder="info@company.com" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyAddress">Address</Label>
                  <Input id="companyAddress" {...register("companyAddress")} placeholder="123 Business Street, Tech City" />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="companyPhone">Phone</Label>
                    <Input id="companyPhone" {...register("companyPhone")} placeholder="+1 234 567 8900" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyWebsite">Website</Label>
                    <Input id="companyWebsite" {...register("companyWebsite")} placeholder="https://company.com" />
                  </div>
                </div>
                <Button type="submit" disabled={updateSettingsMutation.isPending}>
                  {updateSettingsMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Company Settings
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Attendance Settings */}
        <TabsContent value="attendance">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Office Location (Geofence)
                </CardTitle>
                <CardDescription>
                  Set office coordinates for location-based attendance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit(onSave)} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="OFFICE_LAT">Latitude</Label>
                      <Input id="OFFICE_LAT" type="number" step="any" {...register("OFFICE_LAT")} placeholder="40.7128" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="OFFICE_LNG">Longitude</Label>
                      <Input id="OFFICE_LNG" type="number" step="any" {...register("OFFICE_LNG")} placeholder="-74.0060" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="GEOFENCE_RADIUS">Geofence Radius (meters)</Label>
                    <Input id="GEOFENCE_RADIUS" type="number" {...register("GEOFENCE_RADIUS")} placeholder="100" />
                    <p className="text-sm text-muted-foreground">
                      Employees must be within this radius to punch in/out
                    </p>
                  </div>
                  <Button type="submit" disabled={updateSettingsMutation.isPending}>
                    {updateSettingsMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Save Location Settings
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Work Shift Configuration
                </CardTitle>
                <CardDescription>
                  Configure standard working hours and late markings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit(onSave)} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="SHIFT_START_TIME">Shift Start Time (24h format)</Label>
                      <Input id="SHIFT_START_TIME" {...register("SHIFT_START_TIME")} placeholder="09:30" />
                      <p className="text-xs text-muted-foreground">e.g. 09:30 for 9:30 AM</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gracePeriod">Late Grace Period (minutes)</Label>
                      <Input id="gracePeriod" type="number" {...register("gracePeriod")} placeholder="15" />
                      <p className="text-xs text-muted-foreground">Time allowed after shift start.</p>
                    </div>
                  </div>
                  <Button type="submit" disabled={updateSettingsMutation.isPending}>
                    {updateSettingsMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Save Shift Settings
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Leave Policy */}
        <TabsContent value="leave">
          <Card>
            <CardHeader>
              <CardTitle>Annual Leave Allocation</CardTitle>
              <CardDescription>
                Set annual leave quotas for different leave types
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSave)} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="sickLeave">Sick Leave (days/year)</Label>
                    <Input id="sickLeave" type="number" {...register("sickLeave")} placeholder="12" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="casualLeave">Casual Leave (days/year)</Label>
                    <Input id="casualLeave" type="number" {...register("casualLeave")} placeholder="12" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vacationLeave">Vacation Leave (days/year)</Label>
                    <Input id="vacationLeave" type="number" {...register("vacationLeave")} placeholder="15" />
                  </div>
                </div>
                <Button type="submit" disabled={updateSettingsMutation.isPending}>
                  {updateSettingsMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Leave Policy
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Holidays ─────────────────────────────────────────────────────── */}
        <TabsContent value="holidays">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="w-5 h-5" />
                Company Holiday Calendar
              </CardTitle>
              <CardDescription>
                Manage your company&apos;s custom and festival holidays. These dates are automatically treated as paid days off in Payroll (employees receive extra pay if they work on these days), excluded from absent deductions, and marked as HOLIDAY in attendance reports.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* Add new holiday */}
              <div className="border rounded-xl p-4 space-y-3 bg-muted/30">
                <p className="font-medium text-sm">Add New Holiday</p>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="new-holiday-name">Holiday Name</Label>
                    <Input
                      id="new-holiday-name"
                      placeholder="e.g. Diwali, Republic Day"
                      value={newHolidayName}
                      onChange={(e) => setNewHolidayName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-holiday-date">Date</Label>
                    <Input
                      id="new-holiday-date"
                      type="date"
                      value={newHolidayDate}
                      onChange={(e) => setNewHolidayDate(e.target.value)}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      onClick={() => {
                        if (!newHolidayDate) {
                          toast.error("Please select a date");
                          return;
                        }
                        const alreadyExists = holidays.some((h) => h.date === newHolidayDate);
                        if (alreadyExists) {
                          toast.error("This date is already in the holiday list");
                          return;
                        }
                        const updated = [
                          ...holidays,
                          { date: newHolidayDate, name: newHolidayName.trim() || newHolidayDate },
                        ].sort((a, b) => a.date.localeCompare(b.date));
                        setHolidays(updated);
                        setNewHolidayName("");
                        setNewHolidayDate("");
                      }}
                      className="w-full md:w-auto gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add Holiday
                    </Button>
                  </div>
                </div>
              </div>

              {/* Current holiday list */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">
                    Current Holidays
                    <Badge variant="secondary" className="ml-2">{holidays.length}</Badge>
                  </p>
                </div>

                {holidays.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border rounded-xl">
                    <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No holidays configured.</p>
                  </div>
                ) : (
                  <div className="border rounded-xl divide-y overflow-hidden">
                    {holidays.map((h) => (
                      <div
                        key={h.date}
                        className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
                      >
                        <div>
                          <p className="font-medium text-sm">{h.name || h.date}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(h.date + "T00:00:00").toLocaleDateString("en-IN", {
                              weekday: "long",
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            })}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setHolidays(holidays.filter((x) => x.date !== h.date))}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button
                type="button"
                className="w-full sm:w-auto"
                disabled={updateSettingsMutation.isPending}
                onClick={() => {
                  const serialized = holidays.map((h) => `${h.date}|${h.name}`);
                  updateSettingsMutation.mutate({
                    COMPANY_HOLIDAYS: JSON.stringify(serialized),
                  });
                }}
              >
                {updateSettingsMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Holiday Calendar
              </Button>

            </CardContent>
          </Card>
        </TabsContent>

        {/* Payroll Settings */}
        <TabsContent value="payroll">
          <Card>
            <CardHeader>
              <CardTitle>Payroll Configuration</CardTitle>
              <CardDescription>
                Set global defaults for salary, tax, and visual branding on payslips
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSave)} className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="defaultHourlyRate">Default Hourly Rate (₹)</Label>
                    <Input id="defaultHourlyRate" type="number" {...register("defaultHourlyRate")} placeholder="500" />
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Fallback if employee rate is not set</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payrollDay">Payroll Processing Day</Label>
                    <Input id="payrollDay" type="number" min="1" max="28" {...register("payrollDay")} placeholder="1" />
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Day of the month for automated generation</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="taxRate">Default Tax Rate (%)</Label>
                  <Input id="taxRate" type="number" step="0.1" {...register("taxRate")} placeholder="10" />
                  <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Standard deduction for TDS/Professional Tax</p>
                </div>

                <div className="h-px bg-border my-6" />
                <h3 className="text-sm font-bold uppercase tracking-widest text-primary/80">Payslip Visual Assets</h3>
                <p className="text-xs text-muted-foreground -mt-4 mb-4 font-medium italic">Paste image URLs or Base64 strings below to customize your payslips</p>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="payrollBanner">Custom Payroll Header Banner</Label>
                    <div className="flex gap-4 items-center">
                      <Input 
                        id="payrollBannerFile" 
                        type="file" 
                        accept="image/*"
                        onChange={(e) => handleFileUpload(e, "payrollBanner")}
                        className="max-w-xs"
                      />
                      <Input id="payrollBanner" {...register("payrollBanner")} placeholder="Or paste image URL" className="flex-1" />
                    </div>
                    <p className="text-[10px] text-muted-foreground italic">Recommended size: 1200x400px. Upload an image or provide a direct link. Default is /payroll.png</p>
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="digitalSign">Official Digital Signature</Label>
                      <Input 
                        id="digitalSignFile" 
                        type="file" 
                        accept="image/*"
                        onChange={(e) => handleFileUpload(e, "digitalSign")}
                        className="mb-2"
                      />
                      <Input id="digitalSign" {...register("digitalSign")} placeholder="Or paste image URL" />
                      <p className="text-[10px] text-muted-foreground italic">Transparent PNG recommended. Height: ~100px.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="officialStamp">Company Official Stamp</Label>
                      <Input 
                        id="officialStampFile" 
                        type="file" 
                        accept="image/*"
                        onChange={(e) => handleFileUpload(e, "officialStamp")}
                        className="mb-2"
                      />
                      <Input id="officialStamp" {...register("officialStamp")} placeholder="Or paste image URL" />
                      <p className="text-[10px] text-muted-foreground italic">Round stamp recommended. Size: ~150x150px.</p>
                    </div>
                  </div>
                </div>

                <Button type="submit" disabled={updateSettingsMutation.isPending}>
                  {updateSettingsMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Payroll & Branding
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notification Settings */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="w-5 h-5" />
                In-App Notification Preferences
              </CardTitle>
              <CardDescription>
                Choose which events trigger real-time alerts
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/20 border">
                  <div>
                    <p className="font-semibold text-sm">System Alerts</p>
                    <p className="text-xs text-muted-foreground">
                      Critical system status and maintenance updates
                    </p>
                  </div>
                  <Badge variant="default">Always Enabled</Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="font-semibold text-sm">Payroll & Salary</p>
                    <p className="text-xs text-muted-foreground">
                      Notify employees when payslips are generated
                    </p>
                  </div>
                  <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Active</Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="font-semibold text-sm">Leave Management</p>
                    <p className="text-xs text-muted-foreground">
                      Updates on leave request approval or rejection
                    </p>
                  </div>
                  <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Active</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
