import type { Connection, Hocuspocus } from "@hocuspocus/server";
import { CLOSE_CODE } from "./errors";
import { parseDocumentName } from "./resource-kinds";
import { contextOf, type CollabContext } from "./types";

export interface LiveConnection {
  documentName: string;
  connection: Connection;
  ctx: Partial<CollabContext>;
}

/** Mọi kết nối document đang mở của instance này (không tính direct connection của server). */
export function liveConnections(hp: Hocuspocus, filter?: { documentName?: string }): LiveConnection[] {
  const out: LiveConnection[] = [];
  for (const [documentName, document] of hp.documents) {
    if (filter?.documentName && filter.documentName !== documentName) continue;
    for (const connection of document.getConnections()) out.push({ documentName, connection, ctx: contextOf(connection.context) });
  }
  return out;
}

export function countByKind(hp: Hocuspocus): { connections: Record<string, number>; documents: Record<string, number> } {
  const connections: Record<string, number> = {};
  const documents: Record<string, number> = {};
  for (const [name, document] of hp.documents) {
    const kind = parseDocumentName(name)?.kind ?? "document";
    documents[kind] = (documents[kind] ?? 0) + 1;
    connections[kind] = (connections[kind] ?? 0) + document.getConnectionsCount();
  }
  return { connections, documents };
}

export type CloseReason = "revoked" | "archived" | "forbidden" | "unauthorized" | "rate-limited";

/**
 * Đóng MỘT kết nối document: gửi tin CLOSE trong luồng (client thấy sự kiện `close` với `event.reason` = lý do) rồi, nếu socket
 * không còn chở document nào khác, đóng luôn socket thô với mã đóng tương ứng (client tự nối lại sau ~1 s → xác thực lại,
 * nên người hết quyền nhận `forbidden`). Đóng thô là cần thiết: `Connection.close()` của Hocuspocus 3.x KHÔNG đóng socket.
 */
export function closeLiveConnection(live: LiveConnection, reason: CloseReason): void {
  const code = CLOSE_CODE[reason];
  live.connection.close({ code, reason });
  const sock = live.ctx.sock;
  if (!sock) return;
  // `onDisconnect` (giảm `docCount`) chạy sau vài microtask → kiểm ở macrotask kế tiếp.
  setImmediate(() => {
    if (sock.docCount <= 0 && sock.ws.readyState === sock.ws.OPEN) sock.ws.close(code, reason);
  });
}
