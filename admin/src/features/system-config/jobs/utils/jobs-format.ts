import { formatDate } from '@/shared/utils/format';

const DATE_TIME = 'DD/MM/YYYY HH:mm:ss';

/** Epoch ms (BullMQ) → giờ địa phương của máy; thiếu ⇒ "—". */
export function formatEpoch(ms: number | null | undefined): string {
  return ms == null ? '—' : formatDate(new Date(ms), DATE_TIME);
}

/** ISO string (Prisma `Date` qua JSON) → giờ địa phương của máy; thiếu ⇒ "—". */
export function formatIso(iso: string | null | undefined): string {
  return iso ? formatDate(iso, DATE_TIME) : '—';
}

/** `65f0c1a2b3c4d5e6f7a8b9c0` → `65f0c1…b9c0`; id ngắn giữ nguyên. */
export function abbreviateId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

/** `payloadPreview` bị BE cắt (> 2 KiB) có dạng `{ truncated: true, preview }`. */
export function isTruncatedPreview(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { truncated?: unknown }).truncated === true
  );
}
