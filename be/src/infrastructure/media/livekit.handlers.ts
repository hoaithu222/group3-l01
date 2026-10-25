import type { LiveKitEventType, NormalizedLiveKitEvent } from "./livekit.webhook";
import { roomNames, type RoomKind } from "./room-names";

export type LiveKitHandlerResult = "PROCESSED" | "IGNORED";
export type LiveKitHandlerFn = (event: NormalizedLiveKitEvent) => Promise<LiveKitHandlerResult>;

export interface LiveKitHandlerRegistration {
  /** Tiền tố phòng: `call` (p2-01/p2-03) · `meeting` (p2-05) · `spike` (P0) · `*` = mọi phòng (vd `egress_*` của p2-06). */
  roomKind: Exclude<RoomKind, "unknown"> | "*";
  types: readonly LiveKitEventType[];
  handle: LiveKitHandlerFn;
  /** Tuỳ chọn: đăng ký lại cùng `name` thì THAY THẾ bản cũ (import lặp trong test/hot-reload không nhân đôi handler). */
  name?: string;
}

/**
 * Registry handler webhook LiveKit (p0-08 README §2 "Dispatch"): module nghiệp vụ đăng ký lúc import file job
 * của mình (side-effect, giống `registerJob`/`registerScopeResolver`); `infrastructure` KHÔNG import module.
 * Handler PHẢI idempotent (job retry tối đa 5 lần, sự kiện LiveKit có thể lệch thứ tự) — nguồn sự thật người
 * tham gia là `IMediaServer.listParticipants`, không phải thứ tự sự kiện.
 */
const handlers: LiveKitHandlerRegistration[] = [];

export function registerLiveKitHandler(registration: LiveKitHandlerRegistration): void {
  if (registration.name) {
    const i = handlers.findIndex((h) => h.name === registration.name);
    if (i >= 0) {
      handlers[i] = registration;
      return;
    }
  }
  handlers.push(registration);
}

/** Test: gỡ toàn bộ handler đã đăng ký. */
export function clearLiveKitHandlers(): void {
  handlers.length = 0;
}

/**
 * Chạy TUẦN TỰ mọi handler khớp (`roomKind` theo tiền tố phòng, `types` chứa loại sự kiện). Không handler nào khớp
 * (tiền tố lạ, loại sự kiện không ai quan tâm) hoặc mọi handler trả `IGNORED` → `IGNORED`. Handler ném lỗi → lỗi
 * được ném tiếp để job retry (kết quả `FAILED` do `LiveKitEventProcessor` ghi).
 */
export async function dispatchLiveKitEvent(event: NormalizedLiveKitEvent): Promise<LiveKitHandlerResult> {
  const { kind } = roomNames.parse(event.roomName ?? "");
  const matched = handlers.filter(
    (h) => (h.roomKind === "*" || h.roomKind === kind) && (h.types as readonly string[]).includes(event.type)
  );
  let result: LiveKitHandlerResult = "IGNORED";
  for (const handler of matched) {
    if ((await handler.handle(event)) === "PROCESSED") result = "PROCESSED";
  }
  return result;
}
