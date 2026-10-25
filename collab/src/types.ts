import type { WebSocket } from "ws";
import type { ResourceKind } from "./resource-kinds";

export interface ConnectionUser {
  id: string;
  name: string;
  color: string;
}

/** Trạng thái theo từng socket thô (một socket có thể chở nhiều document, nhưng app dùng 1 socket/1 document). */
export interface SocketState {
  ws: WebSocket;
  ip: string;
  /** Đã có ít nhất một document xác thực thành công. */
  authenticated: boolean;
  /** Số kết nối document đang gắn trên socket này. */
  docCount: number;
  /** Hàm nhả "chỗ giữ" giới hạn kết nối chưa hoàn tất — chạy hết khi socket đóng (chống rò đếm). */
  releasers: Set<() => void>;
}

/**
 * `context` của Hocuspocus cho mỗi kết nối document: phần đầu do `handleConnection(defaultContext)` (server.ts) đặt,
 * phần sau do `onAuthenticate` trả về. Hocuspocus gõ `any` nên mọi nơi đọc phải qua `contextOf()`.
 */
export interface CollabContext {
  sock: SocketState;
  user: ConnectionUser;
  kind: ResourceKind;
  resourceId: string;
  workspaceId: string;
  mode: "edit" | "view";
  sv: number;
  /** Bộ đếm token-bucket message/giây của kết nối. */
  bucket: { tokens: number; updatedAt: number };
  /** Bộ đếm token-bucket awareness/giây của kết nối (chỉ loại có trần riêng — bảng trắng; tạo lười ở tin awareness đầu tiên). */
  awarenessBucket: { tokens: number; updatedAt: number };
  /** Nhả "chỗ giữ" giới hạn kết nối (idempotent). */
  releaseReservation: () => void;
}

export function contextOf(ctx: unknown): Partial<CollabContext> {
  return (ctx && typeof ctx === "object" ? ctx : {}) as Partial<CollabContext>;
}

/** Tin gửi server → client qua kênh "stateless" của Hocuspocus (`provider.on("stateless")`), JSON có `v: 1`. */
export type Notice =
  | { v: 1; type: "notice"; code: "TOO_LARGE" | "SAVE_FAILED" | "SAVE_RECOVERED" | "RESTORED" | "READ_ONLY" }
  | { v: 1; type: "notice"; code: "ARCHIVED" };

export function encodeNotice(code: Notice["code"]): string {
  return JSON.stringify({ v: 1, type: "notice", code } satisfies Notice);
}
