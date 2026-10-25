import { AppError } from "../../../core/exceptions";
import { ErrorCode, ErrorMessages } from "../../../core/utils/error.codes";
import type { INotificationRepository } from "../repositories/notification.repository.interface";
import type {
  AccountNotifyMode,
  LockScreenLevelValue,
  NotificationPreferenceEntity,
} from "../entities/notification.interface";
import type { AccountPreferenceDto, WorkspacePreferenceDto } from "../dtos/account-preference.dto";
import { FALLBACK_DEFAULTS, normalizeMode, type AnyNotifyMode, type NotificationDefaults } from "./preference-matrix";

const ACCOUNT_KEY = "account";

/** `GET/PUT /me/notification-preferences` — giá trị HIỆU LỰC (đã điền mặc định `SystemConfig notification.defaults`). */
export interface AccountPreferenceView {
  directMode: AccountNotifyMode;
  groupMode: AccountNotifyMode;
  channelMode: AccountNotifyMode;
  lockScreenPreview: LockScreenLevelValue;
  sound: boolean;
  dndUntil: string | null;
  /** `true` = trường đang dùng mặc định hệ thống (người dùng chưa chọn) — app hiện "Theo mặc định". */
  isDefault: { directMode: boolean; groupMode: boolean; channelMode: boolean; lockScreenPreview: boolean; sound: boolean };
}

/** `GET/PUT /workspaces/:id/notification-preferences`. */
export interface WorkspacePreferenceView {
  workspaceId: string;
  groupMode: "INHERIT" | AccountNotifyMode;
  channelMode: "INHERIT" | AccountNotifyMode;
  /** Giá trị hiệu lực sau khi kế thừa tài khoản → mặc định — để `NotifyModeSheet` hiện "Theo mặc định (…)". */
  effective: { groupMode: AccountNotifyMode; channelMode: AccountNotifyMode };
}

/** `ALL | MENTIONS | MUTED` (tên nội bộ) hoặc tên account/kênh/hội thoại → `AccountNotifyMode`. */
export function toAccountMode(mode: AnyNotifyMode): AccountNotifyMode {
  const n = normalizeMode(mode);
  return n === "ALL" ? "ALL" : n === "MUTED" ? "MUTED" : "MENTIONS_AND_THREADS";
}

/**
 * Cài đặt thông báo cấp TÀI KHOẢN và WORKSPACE (p1-07 be.md §4) — kênh/hội thoại đặt qua
 * `PATCH /channels/:id/me` / `PATCH /conversations/:id/me` (p1-03/p1-05), không ở đây.
 */
export class NotificationPreferenceService {
  constructor(
    private readonly repo: INotificationRepository,
    private readonly getDefaults: () => Promise<NotificationDefaults> = () => Promise.resolve(FALLBACK_DEFAULTS)
  ) {}

  async getAccount(userId: string): Promise<AccountPreferenceView> {
    const [pref, defaults] = await Promise.all([this.repo.getPreference(userId, "ACCOUNT", ACCOUNT_KEY), this.getDefaults()]);
    return this.toAccountView(pref, defaults);
  }

  async putAccount(userId: string, dto: AccountPreferenceDto): Promise<AccountPreferenceView> {
    const dndUntil = dto.dndUntil === undefined ? undefined : dto.dndUntil === null ? null : new Date(dto.dndUntil);
    if (dndUntil && dndUntil.getTime() <= Date.now()) {
      throw new AppError(ErrorMessages[ErrorCode.NOTI_004], 400, ErrorCode.NOTI_004);
    }
    const pref = await this.repo.upsertPreference({
      userId,
      scope: "ACCOUNT",
      scopeKey: ACCOUNT_KEY,
      directMode: dto.directMode,
      groupMode: dto.groupMode,
      channelMode: dto.channelMode,
      lockScreenLevel: dto.lockScreenPreview,
      // Giữ boolean cũ (p0-06 `push.jobs.ts`/`DeliveryPolicy`) đồng bộ: chỉ `FULL` ≙ hiện nội dung.
      lockScreenPreview: dto.lockScreenPreview === undefined ? undefined : dto.lockScreenPreview === "FULL",
      sound: dto.sound,
      dndUntil,
    });
    return this.toAccountView(pref, await this.getDefaults());
  }

  async getWorkspace(userId: string, workspaceId: string): Promise<WorkspacePreferenceView> {
    const [ws, account, defaults] = await Promise.all([
      this.repo.getPreference(userId, "WORKSPACE", workspaceId),
      this.repo.getPreference(userId, "ACCOUNT", ACCOUNT_KEY),
      this.getDefaults(),
    ]);
    return this.toWorkspaceView(workspaceId, ws, account, defaults);
  }

  async putWorkspace(userId: string, workspaceId: string, dto: WorkspacePreferenceDto): Promise<WorkspacePreferenceView> {
    // `INHERIT` → null (kế thừa tài khoản); trường không gửi → giữ nguyên.
    const toStored = (v: WorkspacePreferenceDto["groupMode"]): AccountNotifyMode | null | undefined =>
      v === undefined ? undefined : v === "INHERIT" ? null : v;
    const ws = await this.repo.upsertPreference({
      userId,
      scope: "WORKSPACE",
      scopeKey: workspaceId,
      groupMode: toStored(dto.groupMode),
      channelMode: toStored(dto.channelMode),
    });
    const [account, defaults] = await Promise.all([this.repo.getPreference(userId, "ACCOUNT", ACCOUNT_KEY), this.getDefaults()]);
    return this.toWorkspaceView(workspaceId, ws, account, defaults);
  }

  private toAccountView(pref: NotificationPreferenceEntity | null, d: NotificationDefaults): AccountPreferenceView {
    const level = pref?.lockScreenLevel ?? (pref?.lockScreenPreview === true ? "FULL" : null);
    return {
      directMode: pref?.directMode ?? toAccountMode(d.directMode),
      groupMode: pref?.groupMode ?? toAccountMode(d.groupMode),
      channelMode: pref?.channelMode ?? toAccountMode(d.channelMode),
      lockScreenPreview: level ?? d.lockScreenPreview,
      sound: pref?.sound ?? d.sound,
      dndUntil: pref?.dndUntil && pref.dndUntil.getTime() > Date.now() ? pref.dndUntil.toISOString() : null,
      isDefault: {
        directMode: !pref?.directMode,
        groupMode: !pref?.groupMode,
        channelMode: !pref?.channelMode,
        lockScreenPreview: !level,
        sound: pref?.sound === null || pref?.sound === undefined,
      },
    };
  }

  private toWorkspaceView(
    workspaceId: string,
    ws: NotificationPreferenceEntity | null,
    account: NotificationPreferenceEntity | null,
    d: NotificationDefaults
  ): WorkspacePreferenceView {
    return {
      workspaceId,
      groupMode: ws?.groupMode ?? "INHERIT",
      channelMode: ws?.channelMode ?? "INHERIT",
      effective: {
        groupMode: ws?.groupMode ?? account?.groupMode ?? toAccountMode(d.groupMode),
        channelMode: ws?.channelMode ?? account?.channelMode ?? toAccountMode(d.channelMode),
      },
    };
  }
}
