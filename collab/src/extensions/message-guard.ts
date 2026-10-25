import type { Connection, Document, Extension, beforeHandleMessagePayload } from "@hocuspocus/server";
import * as decoding from "lib0/decoding";
import type { CollabConfig } from "../config";
import { CLOSE_CODE, MessageRejected } from "../errors";
import type { CollabMetrics } from "../metrics";
import { takeToken } from "../rate-limit";
import { KIND_SPECS, parseDocumentName } from "../resource-kinds";
import { contextOf, type SocketState } from "../types";

/** Loại message Hocuspocus (giá trị số trên dây). Xuất ra để `awareness-rate-limit.ts` dùng chung bảng này. */
export const MSG = { Sync: 0, Awareness: 1, Auth: 2, QueryAwareness: 3, SyncReply: 4, Stateless: 5, BroadcastStateless: 6, Close: 7, SyncStatus: 8 } as const;

/** Client chỉ được gửi các loại này. `Stateless`/`BroadcastStateless` bị chặn: một client (kể cả viewer) không được phát chuỗi tuỳ ý tới mọi người. */
const ALLOWED: ReadonlySet<number> = new Set([MSG.Sync, MSG.Awareness, MSG.Auth, MSG.QueryAwareness, MSG.SyncReply, MSG.Close]);

/** Provider Hocuspocus 3.x phản hồi lại cả state của NGƯỜI KHÁC vừa nhận (không lọc origin) → một message có thể chứa cả phòng. */
const MAX_AWARENESS_CLIENTS = 256;
const MAX_AWARENESS_STATE_CHARS = 2048;
const MAX_NAME_CHARS = 80;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
/** y-protocols/sync: SyncStep1 = 0, SyncStep2 = 1, Update = 2. */
const SYNC_UPDATE = 2;

type RejectReason = "awareness-invalid" | "unsupported-message" | "rate-limited";
type Reject = (reason: RejectReason) => never;

/** Ném để Hocuspocus đóng kết nối document; nếu socket chỉ chở document này thì đóng luôn socket thô (`Connection.close()` không tự làm). */
const makeReject =
  (sock: SocketState | undefined): Reject =>
  (reason) => {
    if (sock && sock.docCount <= 1) {
      setImmediate(() => {
        if (sock.ws.readyState === sock.ws.OPEN) sock.ws.close(CLOSE_CODE[reason], reason);
      });
    }
    throw new MessageRejected(CLOSE_CODE[reason], reason);
  };

/**
 * Cổng kiểm mọi message client gửi tới trước khi Hocuspocus xử lý (`beforeHandleMessage`; ném lỗi → đóng kết nối):
 *  - token-bucket `MAX_MESSAGES_PER_SECOND`/kết nối (chống flood);
 *  - chỉ cho các loại message ở `ALLOWED`;
 *  - awareness: khoá nằm trong `awarenessKeys` của loại tài nguyên, mỗi state ≤ 2 KiB, `user.name` ≤ 80 ký tự, `user.color` `#RRGGBB`;
 *    state của CHÍNH kết nối này (clientID của mình hoặc clientID mới) phải mang `user.id` = id người đã xác thực (chống giả danh).
 *    State của người khác (bản phản hồi lại của provider) chỉ kiểm cấu trúc.
 * Quyền GHI không kiểm ở đây: Hocuspocus tự bỏ update của kết nối `readOnly` (đặt ở `onAuthenticate`).
 * Trần tần suất awareness theo loại (bảng trắng) do `awareness-rate-limit.ts` xử lý, khai báo SAU cổng này trong `server.ts`
 * để tin sai định dạng/giả danh luôn bị đóng kết nối trước, không bị "bỏ êm" như tin chỉ gửi quá nhanh.
 */
export function createMessageGuard(config: CollabConfig, metrics: CollabMetrics): Extension {
  return {
    extensionName: "collab-message-guard",
    async beforeHandleMessage(data: beforeHandleMessagePayload): Promise<void> {
      const ctx = contextOf(data.context);
      const reject = makeReject(ctx.sock);
      if (ctx.bucket && !takeToken(ctx.bucket, config.maxMessagesPerSecond, Date.now())) reject("rate-limited");

      let type: number;
      let decoder: decoding.Decoder;
      try {
        decoder = decoding.createDecoder(data.update);
        decoding.readVarString(decoder); // documentName
        type = decoding.readVarUint(decoder);
      } catch {
        return reject("unsupported-message");
      }
      if (!ALLOWED.has(type)) reject("unsupported-message");

      if (type === MSG.Sync) {
        try {
          if (decoding.readVarUint(decoder) === SYNC_UPDATE) metrics.updatesTotal.inc({ kind: ctx.kind ?? "document" });
        } catch {
          /* message hỏng — Hocuspocus tự xử lý/đóng */
        }
      } else if (type === MSG.Awareness) {
        const spec = parseDocumentName(data.documentName)?.spec ?? KIND_SPECS.document;
        validateAwareness(decoder, spec.awarenessKeys, ctx.user?.id, data.document, data.connection, reject);
      }
    },
  };
}

/** Kết nối đang sở hữu `clientID` awareness (theo bản ghi của Hocuspocus khi áp state đầu tiên của client đó). */
function ownerOf(document: Document, clientID: number): Connection | undefined {
  for (const { clients, connection } of document.connections.values()) if (clients.has(clientID)) return connection;
  return undefined;
}

/**
 * Một state awareness trong tin của `connection` thuộc về ai:
 *  - `own`: của CHÍNH kết nối này (clientID đã ghi nhận cho nó, hoặc clientID mới chưa ai sở hữu) → phải kiểm danh tính và tính vào trần tần suất;
 *  - `foreign`: của kết nối KHÁC (provider 3.4.4 phản hồi lại state người khác) → chỉ kiểm cấu trúc, server bỏ qua vì clock không mới hơn;
 *  - `stale`: state cũ của client đã rời (server đã gỡ, clock hiện tại ≥ clock trong tin) → y-protocols bỏ qua, không phải giả danh.
 */
export type AwarenessOwnership = "own" | "foreign" | "stale";

export function classifyAwarenessClient(document: Document, connection: Connection, clientID: number, clock: number): AwarenessOwnership {
  const owner = ownerOf(document, clientID);
  if (owner !== undefined && owner !== connection) return "foreign";
  if (owner === undefined && (document.awareness.meta.get(clientID)?.clock ?? -1) >= clock) return "stale";
  return "own";
}

function validateAwareness(
  decoder: decoding.Decoder,
  allowedKeys: readonly string[],
  userId: string | undefined,
  document: Document,
  connection: Connection,
  reject: Reject,
): void {
  let count: number;
  let inner: decoding.Decoder;
  try {
    inner = decoding.createDecoder(decoding.readVarUint8Array(decoder));
    count = decoding.readVarUint(inner);
  } catch {
    return reject("awareness-invalid");
  }
  if (count > MAX_AWARENESS_CLIENTS) reject("awareness-invalid");
  for (let i = 0; i < count; i += 1) {
    let clientID: number;
    let clock: number;
    let raw: string;
    try {
      clientID = decoding.readVarUint(inner);
      clock = decoding.readVarUint(inner);
      raw = decoding.readVarString(inner);
    } catch {
      return reject("awareness-invalid");
    }
    if (raw.length > MAX_AWARENESS_STATE_CHARS) reject("awareness-invalid");
    let state: unknown;
    try {
      state = JSON.parse(raw);
    } catch {
      return reject("awareness-invalid");
    }
    if (state === null) continue; // client rời
    if (typeof state !== "object" || Array.isArray(state)) reject("awareness-invalid");
    const obj = state as Record<string, unknown>;
    for (const key of Object.keys(obj)) if (!allowedKeys.includes(key)) reject("awareness-invalid");
    if (obj["user"] === undefined) continue;

    const u = obj["user"] as Record<string, unknown> | null;
    const shapeOk =
      u !== null &&
      typeof u === "object" &&
      typeof u["id"] === "string" &&
      typeof u["name"] === "string" &&
      u["name"].length <= MAX_NAME_CHARS &&
      typeof u["color"] === "string" &&
      COLOR_RE.test(u["color"]);
    if (!shapeOk) reject("awareness-invalid");

    // Chỉ state thuộc CHÍNH kết nối gửi mới bị đối chiếu danh tính (xem `classifyAwarenessClient`).
    if (classifyAwarenessClient(document, connection, clientID, clock) === "own" && (u as Record<string, unknown>)["id"] !== userId) reject("awareness-invalid");
  }
}
