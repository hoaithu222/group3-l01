import type { Extension, beforeHandleMessagePayload } from "@hocuspocus/server";
import * as decoding from "lib0/decoding";
import type { CollabConfig } from "../config";
import type { CollabMetrics } from "../metrics";
import { takeToken } from "../rate-limit";
import type { ResourceKind } from "../resource-kinds";
import { contextOf } from "../types";
import { MSG, classifyAwarenessClient } from "./message-guard";

/** Trần tần suất awareness (lần/giây/kết nối) theo loại tài nguyên; `undefined` = không có trần riêng (chỉ còn `MAX_MESSAGES_PER_SECOND` chung). */
export function awarenessMaxHz(config: CollabConfig, kind: ResourceKind): number | undefined {
  return kind === "whiteboard" ? config.wbAwarenessMaxHz : undefined;
}

/**
 * Tìm state awareness đang SỐNG (không phải `null` = rời) và thuộc CHÍNH kết nối gửi trong tin `Awareness`.
 * Trả vị trí (trong `data.update`) của byte đầu tiên của trường "số client" — chỗ ta ghi đè để vô hiệu hoá tin; `undefined` = không phải tin cần tính.
 * Chỉ tin loại này mới tính vào trần, vì:
 *  - provider 3.4.4 phản hồi lại mọi state của NGƯỜI KHÁC (state `foreign`/`stale`): server vốn bỏ qua chúng (clock không mới hơn) nên không phải "tần suất của người gửi";
 *  - tin rời (`null`) hiếm và phải tới nơi để con trỏ ma biến mất ngay.
 * Tin đã qua `message-guard` (đúng cấu trúc, đúng danh tính) — `try/catch` chỉ để phòng thủ.
 */
function locateOwnLiveAwareness(data: beforeHandleMessagePayload): number | undefined {
  try {
    const outer = decoding.createDecoder(data.update);
    decoding.readVarString(outer); // documentName
    if (decoding.readVarUint(outer) !== MSG.Awareness) return undefined;
    const length = decoding.readVarUint(outer); // độ dài mảng con; byte kế tiếp là "số client"
    const countPos = outer.pos;
    const inner = decoding.createDecoder(data.update.subarray(countPos, countPos + length));
    const count = decoding.readVarUint(inner);
    for (let i = 0; i < count; i += 1) {
      const clientID = decoding.readVarUint(inner);
      const clock = decoding.readVarUint(inner);
      const raw = decoding.readVarString(inner);
      if (raw.trim() === "null") continue;
      if (classifyAwarenessClient(data.document, data.connection, clientID, clock) === "own") return countPos;
    }
  } catch {
    /* message hỏng: `message-guard` đã đóng kết nối, không cần làm gì thêm */
  }
  return undefined;
}

/**
 * Giới hạn tần suất awareness theo loại tài nguyên (hiện: bảng trắng, `WB_AWARENESS_MAX_HZ`, mặc định 60/s/kết nối — p6-02 CW-08).
 * Token-bucket riêng cho awareness, độc lập với bộ đếm `MAX_MESSAGES_PER_SECOND` chung (bộ chung vẫn đếm MỌI tin và vẫn đóng kết nối khi flood).
 *
 * Quá trần thì BỎ tin chứ không đóng kết nối: awareness chỉ là trạng thái tạm (con trỏ/bản nháp kéo), tin kế tiếp thay thế tin bị bỏ;
 * đóng kết nối vì một đợt con trỏ dồn dập sẽ làm người vẽ bị văng và tự nối lại (~1 s) một cách vô ích.
 *
 * Cách bỏ: Hocuspocus không cho hook `beforeHandleMessage` "bỏ qua" một tin (ném lỗi = đóng kết nối), nên ta ghi 0 vào trường "số client"
 * của CHÍNH bộ đệm tin đó; `applyAwarenessUpdate` đọc số client = 0 và không áp gì, không phát cho ai. Cách này dựa vào việc Hocuspocus 3.4.4
 * (đã chốt đúng phiên bản) dùng lại nguyên bộ đệm này cho `MessageReceiver` (`new IncomingMessage(data)` không sao chép khi đã là `Uint8Array`).
 * Test `tests/whiteboard.test.ts` (CW-08) khoá hành vi này: nâng phiên bản Hocuspocus mà sao chép bộ đệm thì test đỏ, không lặng lẽ mất giới hạn.
 *
 * Phải khai báo SAU `message-guard` (xem `server.ts`): tin sai định dạng/giả danh bị đóng ở cổng đó trước khi tới đây.
 */
export function createAwarenessRateLimit(config: CollabConfig, metrics: CollabMetrics): Extension {
  return {
    extensionName: "collab-awareness-rate-limit",
    async beforeHandleMessage(data: beforeHandleMessagePayload): Promise<void> {
      const ctx = contextOf(data.context);
      if (!ctx.kind) return;
      const maxHz = awarenessMaxHz(config, ctx.kind);
      if (maxHz === undefined) return;

      const countPos = locateOwnLiveAwareness(data);
      if (countPos === undefined) return;

      const now = Date.now();
      ctx.awarenessBucket ??= { tokens: maxHz, updatedAt: now };
      if (takeToken(ctx.awarenessBucket, maxHz, now)) return;

      data.update[countPos] = 0;
      metrics.awarenessDropped.inc({ kind: ctx.kind });
    },
  };
}
