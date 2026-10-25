import type { CapabilityLimits } from '@/core/capabilities';

/** Trần mặc định của BE (`LIMITS.guest`, README p3-04 §7) — dùng khi `capabilities.limits.guest` chưa có. */
const FALLBACK = { maxDays: 90, maxPerWorkspace: 20 };

export interface GuestLimits {
  /** Số ngày tối đa một khách được phép (`LIMITS.guest.maxDays`). */
  maxDays: number;
  /** Số khách tối đa một nhóm được phép (`LIMITS.guest.maxPerWorkspace`). */
  maxPerWorkspace: number;
}

/** `capabilities.limits` khai `Record<string, unknown>` cố ý (xem `capabilities.types.ts`) — ép kiểu tại chỗ dùng. */
export function readGuestLimits(limits: CapabilityLimits | undefined): GuestLimits {
  const raw = limits?.guest as Partial<GuestLimits> | undefined;
  return {
    maxDays: raw?.maxDays ?? FALLBACK.maxDays,
    maxPerWorkspace: raw?.maxPerWorkspace ?? FALLBACK.maxPerWorkspace,
  };
}
