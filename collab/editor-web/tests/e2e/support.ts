/**
 * Hạ tầng dùng chung cho test đầu–cuối: mượn harness của package `collab` (server thật + BE giả bằng HTTP thật) và dựng "máy khách" là
 * `EditorController` thật (Tiptap + HocuspocusProvider) chạy trong jsdom, nối bằng WebSocket của `ws`.
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import type { Editor } from "@tiptap/core";
import { EditorController } from "../../src/controller";
import { createHocuspocusSession } from "../../src/session";
import type { Harness } from "../../../tests/helpers/harness";
import { FakeTransport, msg } from "../helpers/fake-transport";

export const COLLAB_ROOT = resolve(import.meta.dirname, "../../..");
/** Chỉ chạy khi `collab/node_modules` đã cài (CI chỉ cài editor-web sẽ bỏ qua). */
export const HAS_COLLAB = existsSync(resolve(COLLAB_ROOT, "node_modules/@hocuspocus/server"));

/** `WebSocket` của Node/undici lệch lớp Event với jsdom — dùng `ws` (như harness của collab) làm WebSocketPolyfill. */
export const nodeWebSocket = (): unknown => (createRequire(resolve(COLLAB_ROOT, "package.json"))("ws") as { WebSocket: unknown }).WebSocket;

export const loadHarness = () => import("../../../tests/helpers/harness");
export type HarnessModule = Awaited<ReturnType<typeof loadHarness>>;

export const DOC = "000000000000000000000001";
export const ALICE = "0000000000000000000000a1";
export const BOB = "0000000000000000000000b2";
export const CAROL = "0000000000000000000000c3";
export const DAVE = "0000000000000000000000d4";
export const COLORS = { [ALICE]: "#B42318", [BOB]: "#175CD3", [CAROL]: "#027A48", [DAVE]: "#5925DC" } as const;
export const NAMES = { [ALICE]: "An", [BOB]: "Bình", [CAROL]: "Chi", [DAVE]: "Dũng" } as const;

export interface World {
  lib: HarnessModule;
  h: Harness;
  clients: Client[];
}

export interface ClientOptions {
  userId: keyof typeof COLORS;
  mode?: "edit" | "view";
  tokenTtlSeconds?: number;
  tokenWaitMs?: number;
  /** Token đưa vào `init` thay cho token hợp lệ (thử đường `unauthorized`). */
  initialToken?: string;
  docId?: string;
}

export class Client {
  readonly transport = new FakeTransport();
  readonly root = document.createElement("div");
  readonly controller: EditorController;

  constructor(
    private readonly w: World,
    readonly o: ClientOptions,
  ) {
    document.body.append(this.root);
    this.controller = new EditorController({
      transport: this.transport,
      root: this.root,
      chrome: document.createElement("div"),
      createSession: (options) => createHocuspocusSession({ ...options, WebSocketPolyfill: nodeWebSocket() }),
      random: () => 0,
      ...(o.tokenWaitMs !== undefined ? { tokenWaitMs: o.tokenWaitMs } : {}),
      // Token thử nghiệm sống 2 s: bỏ độ lệch an toàn 5 s để nó còn dùng được lúc kết nối lần đầu.
      ...(o.tokenTtlSeconds !== undefined ? { expirySkewMs: 0 } : {}),
    });
    this.controller.start();
    this.transport.deliver(
      msg("init", {
        url: `ws://127.0.0.1:${w.h.port}/collab`,
        token: o.initialToken ?? this.token(),
        documentName: `doc:${o.docId ?? DOC}`,
        mode: o.mode ?? "edit",
        user: { id: o.userId, name: NAMES[o.userId], color: COLORS[o.userId] },
      }),
    );
    w.clients.push(this);
  }

  token(ttl = this.o.tokenTtlSeconds): string {
    return this.w.lib.signToken({ userId: this.o.userId, docId: this.o.docId ?? DOC, mode: this.o.mode ?? "edit", ...(ttl ? { expiresInSeconds: ttl } : {}) });
  }

  get editor(): Editor {
    return (this.controller as unknown as { editor: Editor }).editor;
  }

  get status() {
    return this.transport.last("status");
  }

  get text(): string {
    return this.editor.getText();
  }

  waitSynced(): Promise<void> {
    return this.w.lib.waitFor(() => this.status?.connection === "synced", { timeoutMs: 8000, label: `${NAMES[this.o.userId]} đồng bộ` });
  }

  destroy(): void {
    this.controller.destroy();
    this.root.remove();
  }
}
