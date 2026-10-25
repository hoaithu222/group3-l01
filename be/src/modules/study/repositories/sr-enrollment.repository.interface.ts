import type { SrEnrollment } from "../entities/sr.interface";

export interface ISrEnrollmentRepository {
  /** Đăng ký ôn bộ (bật `active`); `newPerDay` vắng = giữ nguyên số cũ (hàng mới dùng `defaultNewPerDay`). Idempotent, chịu đua tạo. */
  upsert(userId: string, setId: string, opts: { newPerDay?: number; defaultNewPerDay: number }): Promise<SrEnrollment>;
  find(userId: string, setId: string): Promise<SrEnrollment | null>;
  listActive(userId: string, setIds?: readonly string[]): Promise<SrEnrollment[]>;
  /** Tắt đăng ký (tiến độ giữ nguyên) — `false` nếu chưa từng đăng ký. */
  deactivate(userId: string, setId: string): Promise<boolean>;
  markSynced(id: string, setVersion: number): Promise<void>;
  deleteByUser(userId: string): Promise<number>;
}
