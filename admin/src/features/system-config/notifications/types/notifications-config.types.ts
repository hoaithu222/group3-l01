/**
 * Kiểu dữ liệu tab "Thông báo" — khớp `be/src/modules/admin-push`
 * (`admin-push-stats.service.ts`, `admin-push.service.ts`).
 *
 * Viết tay vì `openapi.json` chưa được sinh (p0-09); thay bằng kiểu sinh khi
 * p0-09 xong.
 */

/** Khớp enum `type` của `adminPushTestSchema` phía BE. */
export const PUSH_TEST_TYPES = ['message.new', 'call.incoming', 'meeting.reminder'] as const;
export type PushTestType = (typeof PUSH_TEST_TYPES)[number];

export interface PushTestPayload {
  userId: string;
  type: PushTestType;
  reason: string;
}

export interface PushChannelResult {
  sent: number;
  failed: number;
}

/** `POST /admin/push/test` → `data`. */
export interface PushTestResult {
  fcm: PushChannelResult;
  voip: PushChannelResult;
}

export type ApnsEnvironment = 'SANDBOX' | 'PRODUCTION';

/**
 * `GET /admin/push/status` → `data`. CHỈ cờ/enum — BE không trả khoá, project
 * id hay định danh nào của nhà cung cấp, và UI cũng không được suy ra/hiện thêm.
 */
export interface PushProviderStatus {
  /** Cờ tính năng `push` — tắt thì `POST /admin/push/test` trả `PUSH_001`. */
  pushEnabled: boolean;
  fcm: { configured: boolean };
  voip: {
    configured: boolean;
    /** Môi trường mặc định theo env; token thật chọn endpoint theo môi trường ghi lúc đăng ký. */
    environment: ApnsEnvironment | null;
  };
}

/** Bản đồ `lý do → số lượng` — thưa (chỉ lý do có phát sinh); mã lạ vẫn phải hiển thị được. */
export type ReasonCounts = Record<string, number>;

/** `GET /admin/push/stats` → `data`. */
export interface PushStats {
  generatedAt: string;
  push24h: {
    sent: number;
    failed: number;
    skipped: { total: number; byReason: ReasonCounts };
  };
  tokensRevoked7d: { total: number; byReason: ReasonCounts };
}

/** Một dòng gợi ý trong ô chọn người nhận. */
export interface UserOption {
  value: string;
  label: string;
}

/** Phần tối thiểu của `GET /users` mà ô chọn người nhận cần. */
export interface UserLookupRow {
  id: string;
  name: string;
  email: string;
}
