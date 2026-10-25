import { LIMITS } from "../../../core/constants/limits";
import type { QuietHours } from "../entities/notification.interface";
import type { EffectiveMode, FanoutScopeContext, LockScreenLevel } from "../entities/message-notification.types";
import { isWithinQuietHours } from "./preference.resolver";

/**
 * Ma trận cài đặt thông báo tin nhắn (p1-07 be.md §5.3) — HÀM THUẦN (không I/O) để test đủ tổ hợp
 * DIRECT/GROUP/CHANNEL × ACCOUNT/WORKSPACE/member × mutedUntil × DND.
 *
 * Thứ tự ưu tiên của `mode` (cụ thể thắng):
 *   member (`ConversationMember`/`ChannelMembership`.notifyMode ≠ INHERIT) > `mutedUntil` còn hạn >
 *   WORKSPACE (`NotificationPreference` groupMode/channelMode, rồi `WorkspaceMembership.notifyMode`) >
 *   ACCOUNT > mặc định (`SystemConfig notification.defaults`, mã: `LIMITS.notification.defaults`).
 * DIRECT chỉ đọc `account.directMode` (hội thoại 1-1 không thuộc workspace).
 */

/** Mọi tên chế độ đang tồn tại: account (`NotifyModeAccount`), kênh (`NotifyMode`), hội thoại (`ConversationNotifyMode`). */
export type AnyNotifyMode =
  | "INHERIT"
  | "ALL"
  | "ALL_MESSAGES"
  | "MENTIONS"
  | "MENTIONS_AND_THREADS"
  | "MUTED";

/** `INHERIT`/`null`/`undefined` → `null` (không ghi đè); còn lại gộp về `ALL | MENTIONS | MUTED`. */
export function normalizeMode(mode: AnyNotifyMode | null | undefined): EffectiveMode | null {
  switch (mode) {
    case "ALL":
    case "ALL_MESSAGES":
      return "ALL";
    case "MENTIONS":
    case "MENTIONS_AND_THREADS":
      return "MENTIONS";
    case "MUTED":
      return "MUTED";
    default:
      return null;
  }
}

export interface NotificationDefaults {
  directMode: AnyNotifyMode;
  groupMode: AnyNotifyMode;
  channelMode: AnyNotifyMode;
  lockScreenPreview: LockScreenLevel;
  sound: boolean;
}

export const FALLBACK_DEFAULTS: NotificationDefaults = { ...LIMITS.notification.defaults };

export interface AccountPreferenceInput {
  directMode?: AnyNotifyMode | null;
  groupMode?: AnyNotifyMode | null;
  channelMode?: AnyNotifyMode | null;
  lockScreenLevel?: LockScreenLevel | null;
  /** Boolean cũ của p0-06: `true` ≙ `FULL`; `false` coi như CHƯA chọn (mặc định DB, không phải lựa chọn). */
  lockScreenPreviewLegacy?: boolean | null;
  sound?: boolean | null;
  dndUntil?: Date | null;
  quietHours?: QuietHours | null;
}

export interface WorkspacePreferenceInput {
  groupMode?: AnyNotifyMode | null;
  channelMode?: AnyNotifyMode | null;
  /** `WorkspaceMembership.notifyMode` (p1-01, `PATCH /workspaces/:id/me`) — dùng khi `NotificationPreference(WORKSPACE)` chưa đặt trường tương ứng. */
  membershipMode?: AnyNotifyMode | null;
}

export interface MemberOverrideInput {
  /** `ConversationMember.notifyMode` | `ChannelMembership.notifyMode`. */
  notifyMode?: AnyNotifyMode | null;
  /** `ConversationMember.mutedUntil`. */
  mutedUntil?: Date | null;
}

export interface ResolveEffectiveInput {
  scope: Pick<FanoutScopeContext, "scopeType" | "conversationKind">;
  defaults?: NotificationDefaults;
  account?: AccountPreferenceInput | null;
  workspace?: WorkspacePreferenceInput | null;
  member?: MemberOverrideInput | null;
  now: Date;
}

export interface EffectiveMessagePreference {
  mode: EffectiveMode;
  dnd: boolean;
  lockScreenPreview: LockScreenLevel;
  sound: boolean;
}

export function isDndActive(account: AccountPreferenceInput | null | undefined, now: Date): boolean {
  if (!account) return false;
  if (account.dndUntil && account.dndUntil.getTime() > now.getTime()) return true;
  return !!account.quietHours && isWithinQuietHours(account.quietHours, now);
}

function baseMode(input: ResolveEffectiveInput, defaults: NotificationDefaults): EffectiveMode {
  const { scope, account, workspace } = input;
  const fallback = (m: AnyNotifyMode): EffectiveMode => normalizeMode(m) ?? "MENTIONS";

  if (scope.scopeType === "CONVERSATION" && scope.conversationKind === "DIRECT") {
    return normalizeMode(account?.directMode) ?? fallback(defaults.directMode);
  }
  if (scope.scopeType === "CONVERSATION") {
    return (
      normalizeMode(workspace?.groupMode) ??
      normalizeMode(workspace?.membershipMode) ??
      normalizeMode(account?.groupMode) ??
      fallback(defaults.groupMode)
    );
  }
  return (
    normalizeMode(workspace?.channelMode) ??
    normalizeMode(workspace?.membershipMode) ??
    normalizeMode(account?.channelMode) ??
    fallback(defaults.channelMode)
  );
}

function lockScreenLevel(account: AccountPreferenceInput | null | undefined, defaults: NotificationDefaults): LockScreenLevel {
  if (account?.lockScreenLevel) return account.lockScreenLevel;
  if (account?.lockScreenPreviewLegacy === true) return "FULL";
  return defaults.lockScreenPreview;
}

export function resolveEffectiveMessagePreference(input: ResolveEffectiveInput): EffectiveMessagePreference {
  const defaults = input.defaults ?? FALLBACK_DEFAULTS;
  let mode = baseMode(input, defaults);

  const memberMode = normalizeMode(input.member?.notifyMode);
  if (memberMode) mode = memberMode;
  if (input.member?.mutedUntil && input.member.mutedUntil.getTime() > input.now.getTime()) mode = "MUTED";

  return {
    mode,
    dnd: isDndActive(input.account, input.now),
    lockScreenPreview: lockScreenLevel(input.account, defaults),
    sound: input.account?.sound ?? defaults.sound,
  };
}
