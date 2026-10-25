import type { EditorMessage } from "../../src/bridge-protocol";
import { parseEditorMessage } from "../../src/bridge-validate";
import type { BridgeTransport } from "../../src/transport";

type Payload<T extends EditorMessage["type"]> = Extract<EditorMessage, { type: T }>["payload"];

/** Kênh bridge giả: ghi lại tin editor gửi, cho test "gửi" tin của app. Mọi tin editor gửi đều phải qua `parseEditorMessage` (phía app đọc được). */
export class FakeTransport implements BridgeTransport {
  readonly sent: EditorMessage[] = [];
  private readonly handlers = new Set<(raw: unknown) => void>();

  send(message: EditorMessage): void {
    const check = parseEditorMessage(JSON.stringify(message));
    if (!check.ok) throw new Error(`editor gửi tin không hợp lệ theo parseEditorMessage: ${check.reason} (${message.type})`);
    this.sent.push(message);
  }

  subscribe(handler: (raw: unknown) => void): () => void {
    this.handlers.add(handler);
    return () => void this.handlers.delete(handler);
  }

  /** App gửi một tin (object → JSON như thật). */
  deliver(message: unknown): void {
    const raw = typeof message === "string" ? message : JSON.stringify(message);
    for (const handler of [...this.handlers]) handler(raw);
  }

  of<T extends EditorMessage["type"]>(type: T): Array<Payload<T>> {
    return this.sent.filter((m) => m.type === type).map((m) => m.payload as Payload<T>);
  }

  last<T extends EditorMessage["type"]>(type: T): Payload<T> | undefined {
    return this.of(type).at(-1);
  }

  clear(): void {
    this.sent.length = 0;
  }
}

export const msg = <T extends string, P extends object>(type: T, payload: P): { v: 1; type: T; payload: P } => ({ v: 1, type, payload });
