/**
 * Kiểu dùng chung của lớp cấp mã kết nối cộng tác (`POST /documents/:id/collab-token`, sau này cả bảng trắng p6-02) — hợp đồng ở
 * `collab/README.md` §3.1: token là JWT HS256 sống 5 phút, `url` KHÔNG kèm `?doc=` (editor tự nối), `documentName` lấy nguyên văn.
 *
 * ⛔ Token là BÍ MẬT ngắn hạn: không ghi log, không đặt vào URL, không lưu vào `AsyncStorage`/store persist — chỉ nằm trong bộ nhớ của
 * `CollabTokenProvider` và trong tin `init`/`setToken` gửi thẳng cho WebView.
 */

/** `edit` chỉ có hiệu lực khi server cũng cho ghi (chế độ thấp hơn thắng); tài liệu đã lưu trữ luôn `view`. */
export type CollabMode = 'edit' | 'view';

/** Người dùng hiện diện — `id` PHẢI bằng `sub` của token (server coi id khác là giả danh). */
export interface CollabUser {
  color: string;
  id: string;
  name: string;
}

/** Loại tài nguyên cộng tác = tiền tố của `documentName`: `doc` tài liệu, `wb` bảng trắng. */
export type CollabKind = 'doc' | 'wb';

export interface CollabGrant {
  /** `documentName` server dùng làm khoá phòng (`doc:<id>` / `wb:<id>`) — KHÔNG tự ghép từ id. */
  documentName: string;
  /** Trần số phần tử (chỉ bảng trắng — `limits.elementsMax` của `collab-token`); thiếu thì dùng trần cứng của engine. */
  elementsMax?: number;
  /** Hạn token, epoch ms. */
  expiresAt: number;
  mode: CollabMode;
  /** Trần dung lượng Yjs (byte) để editor cảnh báo sớm khi tài liệu gần đầy. */
  stateMaxBytes?: number;
  token: string;
  /** ws/wss — `COLLAB_URL` do BE trả, ⛔ không lấy từ biến môi trường của app. */
  url: string;
  user: CollabUser;
}

/** Hàm xin mã MỚI từ BE — mỗi lần gọi là một lượt `POST …/collab-token` (BE giới hạn 30 lần/phút/người). */
export type CollabGrantFetcher = () => Promise<CollabGrant>;

/** Xin token mới khi còn chừng này ms nữa hết hạn (README §3.6: `expiresAt − 60 s`). */
export const COLLAB_REFRESH_SKEW_MS = 60_000;
