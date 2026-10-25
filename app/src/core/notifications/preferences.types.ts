/**
 * Kiểu DTO của `GET/PUT /me/notification-preferences` ở cấp TÀI KHOẢN (đối chiếu
 * `be/src/modules/notifications/{dtos/account-preference.dto.ts,services/notification-preference.service.ts}`,
 * dạng p1-07 — không còn `lockScreenPreview` boolean của be.md p0-06 §3).
 *
 * BE là nguồn hợp đồng. Chỉ khai phần màn Cài đặt thông báo (p0-06) đọc/ghi; ba chế độ theo loại
 * cuộc trò chuyện (`directMode`/`groupMode`/`channelMode`) thuộc UI của p1-07 nhưng để ở đây vì
 * cùng một endpoint.
 */

/** `ALL` mọi tin · `MENTIONS_AND_THREADS` chỉ nhắc tên & luồng · `MUTED` tắt. */
export type AccountNotifyMode = 'ALL' | 'MENTIONS_AND_THREADS' | 'MUTED';

/** Nội dung push hiện trên màn hình khoá: ẩn hết · chỉ tên người gửi/nhóm/kênh · trích nội dung. */
export type LockScreenLevel = 'FULL' | 'HIDDEN' | 'SENDER';

/** Giá trị HIỆU LỰC (BE đã điền mặc định hệ thống). `isDefault[x] = true` → người dùng chưa chọn. */
export interface AccountNotificationPreference {
  channelMode: AccountNotifyMode;
  directMode: AccountNotifyMode;
  /** ISO 8601 — còn hiệu lực (BE trả `null` khi đã qua). */
  dndUntil: string | null;
  groupMode: AccountNotifyMode;
  isDefault: {
    channelMode: boolean;
    directMode: boolean;
    groupMode: boolean;
    lockScreenPreview: boolean;
    sound: boolean;
  };
  lockScreenPreview: LockScreenLevel;
  sound: boolean;
}

/** Chế độ cấp workspace: thêm `INHERIT` = dùng cài đặt tài khoản. */
export type WorkspaceNotifyMode = AccountNotifyMode | 'INHERIT';

/**
 * `GET/PUT /workspaces/:id/notification-preferences` (p1-07 `be.md` §15.2). `effective` là giá trị SAU khi kế thừa
 * tài khoản → mặc định hệ thống — để `NotifyModeSheet` hiện "Theo mặc định (Mọi tin)" đúng giá trị thực tế.
 */
export interface WorkspaceNotificationPreference {
  channelMode: WorkspaceNotifyMode;
  effective: { channelMode: AccountNotifyMode; groupMode: AccountNotifyMode };
  groupMode: WorkspaceNotifyMode;
  workspaceId: string;
}

/** Body `PUT` của workspace — `.strict()` ở BE, mọi trường tuỳ chọn. */
export interface UpdateWorkspaceNotificationPreferencePayload {
  channelMode?: WorkspaceNotifyMode;
  groupMode?: WorkspaceNotifyMode;
}

/** Body `PUT` — mọi trường tuỳ chọn, trường không gửi thì giữ nguyên. BE `.strict()`: KHÔNG gửi khoá lạ. */
export interface UpdateAccountNotificationPreferencePayload {
  channelMode?: AccountNotifyMode;
  directMode?: AccountNotifyMode;
  /** Phải ở TƯƠNG LAI (`NOTI_004` nếu không); `null` = tắt Không làm phiền. */
  dndUntil?: string | null;
  groupMode?: AccountNotifyMode;
  lockScreenPreview?: LockScreenLevel;
  sound?: boolean;
}
