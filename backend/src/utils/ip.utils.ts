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

function expandIpv6(ip: string): number[] | null {
  let value = ip;
  const tail: number[] = [];
  const lastColon = value.lastIndexOf(":");
  const maybeIpv4 = value.slice(lastColon + 1);
  if (net.isIPv4(maybeIpv4)) {
    const [a, b, c, d] = maybeIpv4.split(".").map(Number);
    tail.push((a << 8) | b, (c << 8) | d);
    value = value.slice(0, lastColon + 1) + "0";
  }
  const [head, rest] = value.split("::");
  const headParts = head ? head.split(":") : [];
  const restParts = rest !== undefined && rest !== "" ? rest.split(":") : [];
  const groupsNeeded = 8 - (tail.length ? 1 : 0);
  const missing = groupsNeeded - headParts.length - restParts.length;
  if (value.includes("::") ? missing < 0 : missing !== 0) return null;
  const groups = [...headParts, ...Array(Math.max(0, missing)).fill("0"), ...restParts].map((g) => parseInt(g, 16));
  if (tail.length) groups.pop();
  const result = [...groups, ...tail];
  return result.length === 8 && result.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? result : null;
}

/** Devices on one Wi-Fi share the IPv6 /64 prefix but each has its own address. */
function sameIpv6Network(a: string, b: string): boolean {
  const ga = expandIpv6(a);
  const gb = expandIpv6(b);
  return !!ga && !!gb && ga.slice(0, 4).every((g, i) => g === gb[i]);
}

/** Local/LAN addresses (e.g. 192.168.x.x from ipconfig) are never what the server sees from the internet. */
export function isPrivateIp(ip: string): boolean {
  const value = normalizeIp(ip);
  if (net.isIPv4(value)) {
    const [a, b] = value.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a === 0
    );
  }
  if (net.isIPv6(value)) {
    const groups = expandIpv6(value);
    if (!groups) return false;
    const first = groups[0];
    const isLoopback = groups.slice(0, 7).every((g) => g === 0) && groups[7] <= 1;
    return isLoopback || (first & 0xffc0) === 0xfe80 || (first & 0xfe00) === 0xfc00;
  }
  return false;
}

export function ipInList(ip: string, list: string[] | undefined | null): boolean {
  const target = normalizeIp(ip);
  if (!target || !list?.length) return false;
  return list.some((entry) => {
    const candidate = normalizeIp(entry);
    if (candidate === target) return true;
    return net.isIPv6(candidate) && net.isIPv6(target) && sameIpv6Network(candidate, target);
  });
}
