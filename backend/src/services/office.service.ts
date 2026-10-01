import Office from "../models/Office";
import User from "../models/User";

export interface OfficeInput {
  name: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  isActive?: boolean;
}

function isDuplicateKeyError(error: any) {
  return error?.code === 11000;
}

export async function getAllOffices(includeInactive = true) {
  const query = includeInactive ? {} : { isActive: true };
  const offices = await Office.find(query).sort({ name: 1 }).lean();

  const counts = await User.aggregate([
    { $match: { officeId: { $ne: null } } },
    { $group: { _id: "$officeId", count: { $sum: 1 } } },
  ]);
  const countByOffice = new Map(counts.map((c) => [String(c._id), c.count]));

  return offices.map((office: any) => ({
    ...office,
    id: String(office._id),
    employeeCount: countByOffice.get(String(office._id)) || 0,
  }));
}

export async function getOfficeById(id: string) {
  const office = await Office.findById(id);
  if (!office) throw new Error("Office not found");
  return office;
}

export async function createOffice(data: OfficeInput, createdBy: string) {
  try {
    return await Office.create({
      name: data.name.trim(),
      address: data.address?.trim() || undefined,
      latitude: data.latitude,
      longitude: data.longitude,
      radiusMeters: data.radiusMeters ?? 100,
      isActive: data.isActive ?? true,
      createdBy,
    });
  } catch (error: any) {
    if (isDuplicateKeyError(error)) throw new Error("An office with this name already exists");
    throw error;
  }
}

export async function updateOffice(id: string, data: Partial<OfficeInput>) {
  const office = await Office.findById(id);
  if (!office) throw new Error("Office not found");

  if (data.name !== undefined) office.name = data.name.trim();
  if (data.address !== undefined) office.address = data.address?.trim() || null;
  if (data.latitude !== undefined) office.latitude = data.latitude;
  if (data.longitude !== undefined) office.longitude = data.longitude;
  if (data.radiusMeters !== undefined) office.radiusMeters = data.radiusMeters;
  if (data.isActive !== undefined) office.isActive = data.isActive;

  try {
    return await office.save();
  } catch (error: any) {
    if (isDuplicateKeyError(error)) throw new Error("An office with this name already exists");
    throw error;
  }
}

export async function deleteOffice(id: string) {
  const assigned = await User.countDocuments({ officeId: id });
  if (assigned > 0) {
    throw new Error(
      `${assigned} employee(s) are assigned to this office. Move them to another office first.`
    );
  }
  const deleted = await Office.findByIdAndDelete(id);
  if (!deleted) throw new Error("Office not found");
  return true;
}
