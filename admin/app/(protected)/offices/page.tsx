"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Building2,
  Crosshair,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { officeAPI } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

interface OfficeForm {
  name: string;
  address: string;
  latitude: string;
  longitude: string;
  radiusMeters: string;
  isActive: boolean;
}

const emptyForm: OfficeForm = {
  name: "",
  address: "",
  latitude: "",
  longitude: "",
  radiusMeters: "100",
  isActive: true,
};

export default function OfficesPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "ADMIN";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<OfficeForm>(emptyForm);
  const [locating, setLocating] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["offices"],
    queryFn: async () => {
      const res = await officeAPI.getOffices();
      return res.data;
    },
    enabled: isAdmin,
  });
  const offices: any[] = Array.isArray(data?.data) ? data.data : [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["offices"] });
    queryClient.invalidateQueries({ queryKey: ["officesActive"] });
  };

  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      editingId ? officeAPI.updateOffice(editingId, payload) : officeAPI.createOffice(payload),
    onSuccess: () => {
      toast.success(editingId ? "Office updated" : "Office added");
      invalidate();
      closeDialog();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Failed to save office");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => officeAPI.deleteOffice(id),
    onSuccess: () => {
      toast.success("Office deleted");
      invalidate();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || "Failed to delete office");
    },
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (office: any) => {
    setEditingId(office._id || office.id);
    setForm({
      name: office.name || "",
      address: office.address || "",
      latitude: String(office.latitude ?? ""),
      longitude: String(office.longitude ?? ""),
      radiusMeters: String(office.radiusMeters ?? 100),
      isActive: office.isActive !== false,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const captureCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by this browser");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        setLocating(false);
        toast.success(`Location captured (accuracy ~${Math.round(pos.coords.accuracy)} m)`);
      },
      (err) => {
        setLocating(false);
        toast.error(err.message || "Unable to get current location");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const latitude = parseFloat(form.latitude);
    const longitude = parseFloat(form.longitude);
    const radiusMeters = parseInt(form.radiusMeters, 10);

    if (form.name.trim().length < 2) {
      toast.error("Office name must be at least 2 characters");
      return;
    }
    if (Number.isNaN(latitude) || latitude < -90 || latitude > 90) {
      toast.error("Latitude must be a number between -90 and 90");
      return;
    }
    if (Number.isNaN(longitude) || longitude < -180 || longitude > 180) {
      toast.error("Longitude must be a number between -180 and 180");
      return;
    }
    if (Number.isNaN(radiusMeters) || radiusMeters < 10 || radiusMeters > 5000) {
      toast.error("Allowed radius must be between 10 and 5000 meters");
      return;
    }

    saveMutation.mutate({
      name: form.name.trim(),
      address: form.address.trim() || null,
      latitude,
      longitude,
      radiusMeters,
      isActive: form.isActive,
    });
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          Only administrators can manage offices.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2.5 text-slate-900">
            <span className="p-2 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white shadow-md">
              <Building2 className="w-6 h-6" />
            </span>
            Offices
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Employees can punch in and out only within the allowed radius of their assigned office.
          </p>
        </div>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Add Office
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      ) : offices.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <MapPin className="w-12 h-12 text-slate-300 mb-3" />
            <h3 className="text-lg font-semibold text-slate-700">No offices yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Add an office with its location, then assign employees to it from the employee form.
            </p>
            <Button className="mt-4 gap-2" onClick={openCreate}>
              <Plus className="w-4 h-4" />
              Add Office
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Office</th>
                  <th className="px-4 py-3 font-semibold">Location</th>
                  <th className="px-4 py-3 font-semibold">Radius</th>
                  <th className="px-4 py-3 font-semibold">Employees</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {offices.map((office) => {
                  const id = office._id || office.id;
                  return (
                    <tr key={id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{office.name}</div>
                        {office.address && (
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {office.address}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <a
                          href={`https://www.google.com/maps?q=${office.latitude},${office.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-xs text-indigo-600 hover:underline inline-flex items-center gap-1"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          {Number(office.latitude).toFixed(6)}, {Number(office.longitude).toFixed(6)}
                        </a>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{office.radiusMeters ?? 100} m</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-slate-700">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          {office.employeeCount ?? 0}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {office.isActive !== false ? (
                          <Badge className="bg-emerald-100 text-emerald-800" variant="secondary">
                            Active
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-600" variant="secondary">
                            Inactive
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => openEdit(office)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (confirm(`Delete office "${office.name}"?`)) {
                                deleteMutation.mutate(id);
                              }
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}>
        <DialogContent className="max-w-lg w-[95vw]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Office" : "Add Office"}</DialogTitle>
            <DialogDescription>
              Stand at the office and use &quot;Use my current location&quot;, or paste the
              coordinates from Google Maps.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="office-name">Office Name *</Label>
              <Input
                id="office-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Pune Head Office"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="office-address">Address</Label>
              <Input
                id="office-address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Street, area, city"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="office-lat">Latitude *</Label>
                <Input
                  id="office-lat"
                  inputMode="decimal"
                  value={form.latitude}
                  onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                  placeholder="18.520430"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="office-lng">Longitude *</Label>
                <Input
                  id="office-lng"
                  inputMode="decimal"
                  value={form.longitude}
                  onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                  placeholder="73.856743"
                />
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={captureCurrentLocation}
              disabled={locating}
            >
              {locating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Crosshair className="w-4 h-4" />
              )}
              Use my current location
            </Button>

            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="space-y-1.5">
                <Label htmlFor="office-radius">Allowed Radius (meters)</Label>
                <Input
                  id="office-radius"
                  type="number"
                  min={10}
                  max={5000}
                  value={form.radiusMeters}
                  onChange={(e) => setForm({ ...form, radiusMeters: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 h-10">
                <Label htmlFor="office-active" className="cursor-pointer">Active</Label>
                <Switch
                  id="office-active"
                  checked={form.isActive}
                  onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingId ? "Save Changes" : "Add Office"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
