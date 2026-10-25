import { LIMITS } from "../../../core/constants/limits";
import type { NotificationPreferenceEntity, NotifyScopeInput, QuietHours } from "../entities/notification.interface";

export interface IPreferenceReader {
  get(userId: string, scope: "ACCOUNT" | "WORKSPACE" | "CHANNEL" | "CONVERSATION", scopeKey: string): Promise<NotificationPreferenceEntity | null>;
}

export interface EffectivePreference {
  mode: "ALL" | "MENTIONS" | "MUTED";
  dndUntil: Date | null;
  quietHours: QuietHours | null;
  lockScreenPreview: boolean;
}

const ACCOUNT_KEY = "account";

/** `HH:mm` tại `tz` — dùng `Intl.DateTimeFormat` (không cần thêm dependency timezone). */
function minutesOfDay(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hh * 60 + mm;
}

/** Cửa sổ có thể vắt qua nửa đêm (vd 22:00 → 07:00). */
export function isWithinQuietHours(q: QuietHours, now: Date): boolean {
  const cur = minutesOfDay(now, q.tz);
  const [sh, sm] = q.start.split(":").map(Number);
  const [eh, em] = q.end.split(":").map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start === end) return false;
  return start < end ? cur >= start && cur < end : cur >= start || cur < end;
}

/**
 * `preference.resolver.ts` (be.md §5.4 bước 4) — thứ tự CONVERSATION|CHANNEL →
 * WORKSPACE → ACCOUNT → mặc định `LIMITS.notification.defaultMode`. `INHERIT`
 * đi tiếp lên scope cao hơn; scope cao hơn CHƯA CÓ liên quan (Phase 0 chưa có
 * resolver workspace/channel/conversation thật) tự nhiên trả `null` từ
 * `IPreferenceReader` và resolver vẫn tiếp tục an toàn lên ACCOUNT/mặc định.
 */
export class PreferenceResolver {
  constructor(private readonly repo: IPreferenceReader) {}

  async resolve(userId: string, scope: NotifyScopeInput | null, workspaceId?: string): Promise<EffectivePreference> {
    const account = await this.repo.get(userId, "ACCOUNT", ACCOUNT_KEY);

    const candidates: { scope: "CHANNEL" | "CONVERSATION" | "WORKSPACE"; scopeKey: string }[] = [];
    if (scope?.type === "CHANNEL") candidates.push({ scope: "CHANNEL", scopeKey: scope.id });
    if (scope?.type === "CONVERSATION") candidates.push({ scope: "CONVERSATION", scopeKey: scope.id });
    if (workspaceId) candidates.push({ scope: "WORKSPACE", scopeKey: workspaceId });

    let mode: EffectivePreference["mode"] | "INHERIT" = "INHERIT";
    let mutedUntil: Date | null = null;

    for (const c of candidates) {
      const pref = await this.repo.get(userId, c.scope, c.scopeKey);
      if (!pref || pref.mode === "INHERIT") continue;
      mode = pref.mode;
      mutedUntil = pref.mutedUntil;
      break;
    }

    if (mode === "INHERIT") {
      if (account && account.mode !== "INHERIT") {
        mode = account.mode;
        mutedUntil = account.mutedUntil;
      } else {
        mode = LIMITS.notification.defaultMode;
      }
    }

    if (mutedUntil && mutedUntil.getTime() > Date.now()) mode = "MUTED";

    return {
      mode,
      dndUntil: account?.dndUntil ?? null,
      quietHours: account?.quietHours ?? null,
      lockScreenPreview: account?.lockScreenPreview ?? false,
    };
  }
}

/** DND hiệu lực = `dndUntil` còn hạn HOẶC đang trong `quietHours` (be.md §5.4 bước 4). */
export function isInDnd(pref: EffectivePreference, now: Date = new Date()): boolean {
  if (pref.dndUntil && pref.dndUntil.getTime() > now.getTime()) return true;
  if (pref.quietHours && isWithinQuietHours(pref.quietHours, now)) return true;
  return false;
}
