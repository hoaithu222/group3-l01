/**
 * Trạng thái phiên collab của MỘT bảng trắng — thứ `ConnectionController` gom từ provider và màn hình vẽ thành chấm trạng thái/banner.
 * Nguồn hợp đồng: `collab/README.md` §3.4–3.6.
 */

/** `connecting` chưa đồng bộ lần nào · `synced` đang nối và đã đồng bộ · `offline` từng đồng bộ, đang nối lại · `closed` dừng hẳn (mất quyền…). */
export type ConnectionState = 'closed' | 'connecting' | 'offline' | 'synced';

/** Thông báo `notice` của server (`provider.on("stateless")`, README §3.5). */
export type NoticeCode =
  | 'ARCHIVED'
  | 'READ_ONLY'
  | 'RESTORED'
  | 'SAVE_FAILED'
  | 'SAVE_RECOVERED'
  | 'TOO_LARGE';

export interface SessionSnapshot {
  /** Bảng đã lưu trữ (server đóng để nối lại ở chế độ xem). */
  archived: boolean;
  connection: ConnectionState;
  /** Đã đồng bộ ít nhất một lần (có nội dung để hiển thị/sửa). */
  everSynced: boolean;
  /** BE tạm lỗi lúc lưu — các máy vẫn đồng bộ với nhau, collab thử lại (`SAVE_FAILED`). */
  saveFailed: boolean;
  /** Server chỉ cho đọc (scope `readonly`, thông báo `READ_ONLY`, bảng lưu trữ). */
  serverReadOnly: boolean;
  /** Server báo state quá lớn (`TOO_LARGE`) — không lưu thêm được. */
  tooLarge: boolean;
  /** Còn thay đổi chưa được server xác nhận. */
  unsynced: boolean;
}

export const INITIAL_SNAPSHOT: SessionSnapshot = {
  archived: false,
  connection: 'connecting',
  everSynced: false,
  saveFailed: false,
  serverReadOnly: false,
  tooLarge: false,
  unsynced: false,
};

/** Lỗi khiến phiên không dùng được — màn hình thay canvas bằng khối trạng thái ("Thử lại"/thoát). */
export type FailureCode =
  | 'AUTH_EXPIRED'
  | 'FORBIDDEN'
  | 'LOAD_FAILED'
  | 'NOT_FOUND'
  | 'TOKEN_FAILED'
  | 'TOO_LARGE';

export interface SessionFailure {
  code: FailureCode;
  /** Nghiêm trọng = đã dừng nối lại (mất quyền/không tồn tại/quá lớn); không nghiêm trọng = vẫn đang thử tiếp. */
  fatal: boolean;
}

const NOTICE_CODES: readonly string[] = [
  'ARCHIVED',
  'READ_ONLY',
  'RESTORED',
  'SAVE_FAILED',
  'SAVE_RECOVERED',
  'TOO_LARGE',
];

/** Đọc payload `stateless` (`{ v: 1, type: 'notice', code }`); sai định dạng/mã lạ → `null` (bỏ qua, không ném). */
export function parseNotice(payload: string): NoticeCode | null {
  try {
    const value: unknown = JSON.parse(payload);
    if (typeof value !== 'object' || value === null) return null;
    const { code, type } = value as { code?: unknown; type?: unknown };
    if (type !== 'notice' || typeof code !== 'string') return null;
    return NOTICE_CODES.includes(code) ? (code as NoticeCode) : null;
  } catch {
    return null;
  }
}

export type StatusTone = 'error' | 'neutral' | 'success' | 'warning';

/**
 * Chấm trạng thái ở thanh tiêu đề (app.md §3): "Đã lưu" · "Đang đồng bộ…" · "Mất kết nối" · "Chưa lưu được — sẽ thử lại". Luôn kèm CHỮ
 * (không chỉ màu — trợ năng). `readOnly` = người xem hoặc bảng lưu trữ: không có gì để lưu nên hiện "Chỉ xem".
 */
export function statusLabel(
  snapshot: SessionSnapshot,
  readOnly: boolean,
): { text: string; tone: StatusTone } {
  if (snapshot.connection === 'closed') return { text: 'Đã ngắt kết nối', tone: 'error' };
  if (snapshot.connection === 'offline') return { text: 'Mất kết nối', tone: 'warning' };
  if (snapshot.connection === 'connecting') return { text: 'Đang kết nối…', tone: 'neutral' };
  if (readOnly) return { text: 'Chỉ xem', tone: 'neutral' };
  if (snapshot.saveFailed) return { text: 'Chưa lưu được — sẽ thử lại', tone: 'warning' };
  if (snapshot.unsynced) return { text: 'Đang đồng bộ…', tone: 'neutral' };
  return { text: 'Đã lưu', tone: 'success' };
}

export type BannerTone = 'error' | 'info' | 'warning';

/**
 * MỘT banner ưu tiên cao nhất (không chồng nhiều khối cảnh báo): bảng đầy > lưu trữ > chỉ xem > ngoại tuyến > sắp đầy > phiên không làm mới được.
 * `full` = đã chạm trần phần tử (engine trả `'limit'`) hoặc server báo `TOO_LARGE`; `nearLimit` = còn ≤ 5% chỗ.
 */
export function statusBanner(input: {
  archived: boolean;
  full: boolean;
  nearLimit: boolean;
  readOnly: boolean;
  snapshot: SessionSnapshot;
  tokenProblem: boolean;
}): { text: string; tone: BannerTone } | null {
  const { archived, full, nearLimit, readOnly, snapshot, tokenProblem } = input;
  if (full || snapshot.tooLarge) {
    return { text: 'Bảng đã đầy — không thêm được nữa. Hãy xoá bớt hoặc tạo bảng mới.', tone: 'error' };
  }
  if (archived || snapshot.archived) {
    return { text: 'Bảng đã lưu trữ — chỉ xem được.', tone: 'info' };
  }
  if (readOnly) return { text: 'Chỉ xem — bạn không có quyền vẽ trên bảng này.', tone: 'info' };
  if (snapshot.connection === 'offline') {
    return { text: 'Đang ngoại tuyến — thay đổi sẽ đồng bộ khi có mạng.', tone: 'warning' };
  }
  if (nearLimit) return { text: 'Bảng sắp đạt số phần tử tối đa.', tone: 'warning' };
  if (tokenProblem) {
    return { text: 'Chưa làm mới được phiên vẽ. Ứng dụng đang thử lại.', tone: 'warning' };
  }
  return null;
}
