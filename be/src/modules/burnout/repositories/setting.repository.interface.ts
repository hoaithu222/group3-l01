import type { SettingPatch, WellbeingSettingEntity } from "../entities/burnout.interface";
import type { TxHandle } from "./tx";

export interface IWellbeingSettingRepository {
  findByUserId(userId: string): Promise<WellbeingSettingEntity | null>;

  /**
   * Bật theo dõi: `optedInAt = now`, `optedOutAt = null`, xoá trạng thái cảnh báo cũ (`lastAlertAt`/`snoozedUntil`) — dữ liệu lần trước đã bị xoá khi tắt. Tạo dòng nếu chưa có. Dữ liệu TRƯỚC thời điểm
   * này không bao giờ được thu hồi ngược (bucket chỉ ghi từ giờ).
   */
  enable(userId: string, now: Date, patch: SettingPatch): Promise<WellbeingSettingEntity>;

  /** Sửa cài đặt (không đổi trạng thái bật/tắt); `null` = chưa có dòng. */
  patch(userId: string, patch: SettingPatch): Promise<WellbeingSettingEntity | null>;

  /** Tắt: `optedInAt = null`, `optedOutAt = now`, xoá trạng thái cảnh báo + giờ nghỉ mong muốn. `false` = chưa có dòng nào. */
  disable(userId: string, now: Date, tx?: TxHandle): Promise<boolean>;

  /**
   * CHIẾM quyền cảnh báo NGUYÊN TỬ (một lệnh có điều kiện): chỉ khi vẫn đang bật và `lastAlertAt` là null hoặc ≤ `notAfter` mới đặt `lastAlertAt = now`. `true` = thắng — hai job chạy trùng/đua nhau thì đúng
   * MỘT bên nhận `true`.
   */
  claimAlert(userId: string, notAfter: Date, now: Date, tx?: TxHandle): Promise<boolean>;

  setSnooze(userId: string, until: Date, tx?: TxHandle): Promise<void>;

  /** Xoá dữ liệu nhưng GIỮ bật: quên mốc cảnh báo/tạm hoãn (chúng là dữ liệu dẫn xuất từ lịch sử đã xoá). */
  resetAlertState(userId: string): Promise<void>;

  /** Ẩn danh hoá tài khoản: xoá hẳn dòng. */
  deleteByUser(userId: string): Promise<number>;

  /** Người ĐANG BẬT theo trang (con trỏ `id` tăng dần) cho job hằng giờ. */
  listEnabledPage(afterId: string | null, limit: number): Promise<WellbeingSettingEntity[]>;
}
