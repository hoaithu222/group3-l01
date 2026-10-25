import { BRIDGE_VERSION, type EditorMessage } from "./bridge-protocol";
import type { BridgeTransport } from "./transport";

type Payload<T extends EditorMessage["type"]> = Extract<EditorMessage, { type: T }>["payload"];

/** Cửa sổ trượt: tối đa `max` lần trong `windowMs` (chống dội báo lỗi khi app/thư viện lỗi vòng lặp). */
export class RateWindow {
  private times: number[] = [];

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number,
  ) {}

  /** `true` nếu còn hạn mức (và ghi nhận một lần dùng). */
  allow(): boolean {
    const now = this.now();
    this.times = this.times.filter((t) => now - t < this.windowMs);
    if (this.times.length >= this.max) return false;
    this.times.push(now);
    return true;
  }
}

/** Gửi tin cho app; `sendIfChanged` bỏ tin trùng nội dung lần gửi trước CÙNG loại (status/selectionState/awareness). */
export class Outbox {
  private readonly last = new Map<string, string>();

  constructor(private readonly transport: BridgeTransport) {}

  send<T extends EditorMessage["type"]>(type: T, payload: Payload<T>): void {
    this.transport.send({ v: BRIDGE_VERSION, type, payload } as EditorMessage);
  }

  sendIfChanged<T extends EditorMessage["type"]>(type: T, payload: Payload<T>): void {
    const key = JSON.stringify(payload);
    if (this.last.get(type) === key) return;
    this.last.set(type, key);
    this.send(type, payload);
  }

  /** Quên bản đã gửi (sau khi đổi tài liệu) để tin đầu tiên của tài liệu mới luôn được gửi. */
  reset(): void {
    this.last.clear();
  }
}
