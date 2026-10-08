import { Request } from "express";
import net from "net";

/** Strips the IPv4-mapped IPv6 prefix and zone id so "::ffff:1.2.3.4" compares equal to "1.2.3.4". */
export function normalizeIp(ip?: string | null): string {
  if (!ip) return "";
  let value = ip.trim().toLowerCase();
  if (value.startsWith("::ffff:") && net.isIPv4(value.slice(7))) value = value.slice(7);
  const zoneIndex = value.indexOf("%");
  if (zoneIndex !== -1) value = value.slice(0, zoneIndex);
  return value;
}

export function isValidIp(ip: string): boolean {
  return net.isIP(normalizeIp(ip)) !== 0;
}

/** Requires `trust proxy` so req.ip is the visitor's address rather than Nginx's. */
export function getClientIp(req: Request): string {
  return normalizeIp(req.ip || req.socket?.remoteAddress);
}

export function ipInList(ip: string, list: string[] | undefined | null): boolean {
  const target = normalizeIp(ip);
  if (!target || !list?.length) return false;
  return list.some((entry) => normalizeIp(entry) === target);
}
