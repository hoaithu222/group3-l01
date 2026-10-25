/**
 * Bộ điều phối editor: nối bridge (app) ↔ kết nối collab ↔ Tiptap. Không chứa chính sách kết nối (xem `connection.ts`/`close-policy.ts`)
 * hay logic lệnh (`commands.ts`); ở đây chỉ gom trạng thái thành `status`, quyết định editor có được sửa, và trả lời tin của app.
 */
import type { Editor } from "@tiptap/core";
import { ySyncPluginKey, yUndoPluginKey } from "@tiptap/y-tiptap";
import * as Y from "yjs";
import { AssetUrlResolver } from "./asset-resolver";
import { bytesFromBase64 } from "./base64";
import { ALL_COMMANDS, BRIDGE_VERSION, type CommandPayload, type CommandRejectReason, type EditorErrorCode, type EditorMode, type HostMessage, type InitLivePayload, type InitPayload, type NoticeCode, type StatusPayload } from "./bridge-protocol";
import { parseHostMessage, toEpochMs, type ParseResult } from "./bridge-validate";
import { guardMutation, runCommand, type CommandResult } from "./commands";
import { ConnectionManager, type ConnectionSnapshot } from "./connection";
import { createEditor } from "./editor-factory";
import { Outbox, RateWindow } from "./outbox";
import { presenceFromStates } from "./presence";
import { computeSelectionState } from "./selection-state";
import { createHocuspocusSession, type SessionFactory } from "./session";
import { estimateStateBytes } from "./state-size";
import type { BridgeTransport } from "./transport";
import { version as BUNDLE_VERSION } from "../package.json";

export interface ControllerDeps {
  transport: BridgeTransport;
  root: HTMLElement;
  /** Nơi đặt `lang`/`data-theme` (mặc định `document.documentElement`). */
  chrome?: HTMLElement;
  createSession?: SessionFactory;
  now?: () => number;
  random?: () => number;
  /** Chỉ cho test. */
  WebSocketPolyfill?: unknown;
  tokenWaitMs?: number;
  expirySkewMs?: number;
  initialSyncTimeoutMs?: number;
  tokenReplyTimeoutMs?: number;
}

type SizeLevel = "ok" | "near" | "full";

const SIZE_CHECK_MS = 2_000;
const PRESENCE_DEBOUNCE_MS = 150;
const REMOTE_SELECTION_DEBOUNCE_MS = 100;
const PLACEHOLDER = { vi: "Bắt đầu viết…", en: "Start writing…" } as const;

const SNAPSHOT_STATUS: StatusPayload = {
  connection: "synced",
  unsynced: false,
  saveFailed: false,
  mode: "view",
  readOnly: true,
  archived: false,
  tooLarge: false,
  nearLimit: false,
};

export class EditorController {
  private readonly out: Outbox;
  private readonly invalidReports: RateWindow;
  private readonly unexpectedReports: RateWindow;
  private readonly chrome: HTMLElement;
  private readonly now: () => number;
  private readonly unsubscribe: () => void;

  private source: "live" | "snapshot" | undefined;
  private editor: Editor | undefined;
  private doc: Y.Doc | undefined;
  private conn: ConnectionManager | undefined;
  private resolver: AssetUrlResolver | undefined;
  private connSnap: ConnectionSnapshot | undefined;
  private me: { id: string } | undefined;
  private requestedMode: EditorMode = "view";
  private stateMaxBytes: number | undefined;
  private sizeLevel: SizeLevel = "ok";
  private contentBroken = false;
  private selectionScheduled = false;
  private remoteSelectionTimer: ReturnType<typeof setTimeout> | undefined;
  private sizeTimer: ReturnType<typeof setTimeout> | undefined;
  private presenceTimer: ReturnType<typeof setTimeout> | undefined;
  private imageRequests = 0;

  constructor(private readonly deps: ControllerDeps) {
    this.now = deps.now ?? (() => Date.now());
    this.out = new Outbox(deps.transport);
    // Tối đa 5 báo lỗi mỗi 10 s cho từng nhóm (tin sai từ app; lỗi không bắt được trong trang).
    this.invalidReports = new RateWindow(5, 10_000, this.now);
    this.unexpectedReports = new RateWindow(5, 10_000, this.now);
    this.chrome = deps.chrome ?? document.documentElement;
    this.unsubscribe = deps.transport.subscribe((raw) => this.receive(raw));
  }

  /** Báo app biết bundle đã sẵn sàng nhận `init`. */
  start(): void {
    this.out.send("ready", { protocol: BRIDGE_VERSION, bundle: BUNDLE_VERSION, commands: ALL_COMMANDS });
  }

  /** Điểm vào duy nhất cho tin từ app; không bao giờ ném lỗi ra ngoài. */
  receive(raw: unknown): void {
    try {
      const parsed = parseHostMessage(raw);
      if (!parsed.ok) return this.reportInvalid(parsed);
      this.dispatch(parsed.message);
    } catch (err) {
      this.error("LOAD_FAILED", false, "Lỗi nội bộ của trình soạn thảo", (err instanceof Error ? err.message : "internal").slice(0, 200));
    }
  }

  /** Lỗi không bắt được trong trang (`window.onerror`/`unhandledrejection`) → báo app, có giới hạn tần suất. */
  reportUnexpected(detail: string): void {
    if (this.unexpectedReports.allow()) this.error("LOAD_FAILED", false, "Lỗi không mong đợi trong trình soạn thảo", detail.slice(0, 200));
  }

  destroy(): void {
    this.teardown();
    this.unsubscribe();
  }

  // ── tin từ app ─────────────────────────────────────────────────────────

  private dispatch(message: HostMessage): void {
    switch (message.type) {
      case "init":
        return this.init(message.payload);
      case "setToken":
        return this.conn?.setToken(message.payload.token, toEpochMs(message.payload.expiresAt));
      case "command":
        return this.command(message.payload);
      case "insertImage":
        return this.insertImage(message.payload);
      case "assetUrl":
        return this.resolver?.receive({ ...message.payload, expiresAt: toEpochMs(message.payload.expiresAt) });
      case "setMode":
        if (this.source === "live") {
          this.requestedMode = message.payload.mode;
          this.refresh();
        }
        return;
      case "setTheme":
        return void (this.chrome.dataset["theme"] = message.payload.theme);
      case "retry":
        return this.conn?.retry();
      case "dispose":
        return this.teardown();
    }
  }

  private reportInvalid(failure: Extract<ParseResult<never>, { ok: false }>): void {
    if (failure.type === "command" && failure.requestId) {
      this.out.send("commandResult", { requestId: failure.requestId, ok: false, reason: failure.reason as CommandRejectReason });
    }
    if (this.invalidReports.allow()) {
      this.error("INVALID_MESSAGE", false, "Tin nhắn bridge không hợp lệ", `${(failure.type ?? "?").slice(0, 32)}:${failure.reason}`);
    }
  }

  private init(payload: InitPayload): void {
    this.teardown();
    this.chrome.lang = payload.locale ?? "vi";
    if (payload.theme) this.chrome.dataset["theme"] = payload.theme;
    this.doc = new Y.Doc();
    this.resolver = new AssetUrlResolver({ request: (assetId) => this.out.send("resolveAssetUrl", { assetId }), now: this.now });
    if (payload.source === "snapshot") this.openSnapshot(payload.yjsState, PLACEHOLDER[payload.locale ?? "vi"]);
    else this.openLive(payload);
  }

  private openSnapshot(yjsState: string, placeholder: string): void {
    const doc = this.doc as Y.Doc;
    try {
      const bytes = bytesFromBase64(yjsState);
      if (bytes.byteLength > 0) Y.applyUpdate(doc, bytes);
    } catch {
      this.teardown();
      this.error("LOAD_FAILED", true, "Không đọc được phiên bản này", "snapshot-corrupt");
      return;
    }
    this.source = "snapshot";
    this.requestedMode = "view";
    this.mountEditor({ awarenessProvider: null, user: null, placeholder });
    this.refresh();
  }

  private openLive(init: InitLivePayload): void {
    const doc = this.doc as Y.Doc;
    this.source = "live";
    this.me = { id: init.user.id };
    this.requestedMode = init.mode;
    this.stateMaxBytes = init.stateMaxBytes;
    this.conn = new ConnectionManager({
      createSession: this.deps.createSession ?? createHocuspocusSession,
      url: init.url,
      documentName: init.documentName,
      doc,
      user: init.user,
      token: init.token,
      tokenExpiresAt: toEpochMs(init.expiresAt),
      now: this.now,
      ...(this.deps.random ? { random: this.deps.random } : {}),
      ...(this.deps.WebSocketPolyfill ? { WebSocketPolyfill: this.deps.WebSocketPolyfill } : {}),
      ...(this.deps.tokenWaitMs !== undefined ? { tokenWaitMs: this.deps.tokenWaitMs } : {}),
      ...(this.deps.expirySkewMs !== undefined ? { expirySkewMs: this.deps.expirySkewMs } : {}),
      ...(this.deps.initialSyncTimeoutMs !== undefined ? { initialSyncTimeoutMs: this.deps.initialSyncTimeoutMs } : {}),
      ...(this.deps.tokenReplyTimeoutMs !== undefined ? { tokenReplyTimeoutMs: this.deps.tokenReplyTimeoutMs } : {}),
      host: {
        requestToken: (reason, attempt) => this.out.send("requestToken", { reason, attempt }),
        error: (code, fatal, message, detail) => this.error(code, fatal, message, detail),
        notice: (code) => this.onNotice(code),
        onChange: (snap) => {
          this.connSnap = snap;
          this.refresh();
        },
        onPresence: () => this.schedulePresence(),
      },
    });
    this.mountEditor({ awarenessProvider: this.conn.awarenessProvider, user: init.user, placeholder: init.placeholder ?? PLACEHOLDER[init.locale ?? "vi"] });
    doc.on("update", () => this.scheduleSizeCheck());
    this.conn.connect();
    this.presence();
  }

  private mountEditor(o: { awarenessProvider: ConnectionManager["awarenessProvider"] | null; user: InitLivePayload["user"] | null; placeholder: string }): void {
    const editor = createEditor({
      element: this.deps.root,
      doc: this.doc as Y.Doc,
      awarenessProvider: o.awarenessProvider,
      user: o.user,
      placeholder: o.placeholder,
      editable: false,
      resolver: this.resolver as AssetUrlResolver,
      onOpenLink: (url) => this.out.send("openLink", { url }),
      onImageFile: (source) => this.out.send("requestImage", { requestId: `img-${(this.imageRequests += 1)}`, source }),
      onContentError: () => this.onContentError(),
    });
    // Giao dịch do MÁY KHÁC gây ra dồn dập khi nhiều người gõ: gom lại 100 ms; thao tác của mình cập nhật toolbar ngay.
    editor.on("transaction", ({ transaction }) => this.scheduleSelection(transaction.getMeta(ySyncPluginKey)?.isChangeOrigin === true));
    editor.on("selectionUpdate", () => this.scheduleSelection());
    this.editor = editor;
  }

  // ── lệnh ───────────────────────────────────────────────────────────────

  private command(payload: CommandPayload): void {
    const result: CommandResult = this.editor
      ? runCommand({ editor: this.editor, loaded: this.loaded, editable: this.editor.isEditable, tooLarge: this.tooLarge }, payload)
      : { ok: false, reason: "not-initialized" };
    this.commandResult(payload.requestId, result);
  }

  private insertImage(p: { assetId: string; alt?: string; requestId?: string }): void {
    const editor = this.editor;
    const rejected = !editor ? "not-initialized" : guardMutation({ loaded: this.loaded, editable: editor.isEditable, tooLarge: this.tooLarge }, true);
    if (rejected || !editor) return this.commandResult(p.requestId, { ok: false, reason: rejected ?? "not-initialized" });
    const ok = editor.commands.insertDocImage({ assetId: p.assetId, ...(p.alt ? { alt: p.alt } : {}) });
    // Ảnh nằm cuối tài liệu: thêm đoạn văn sau nó để tiếp tục gõ được (không có `trailingNode` — xem editor-factory).
    const last = editor.state.doc.lastChild;
    if (ok && last?.type.name === "image") editor.commands.insertContentAt(editor.state.doc.content.size, { type: "paragraph" });
    this.commandResult(p.requestId, ok ? { ok: true } : { ok: false, reason: "not-applicable" });
  }

  private commandResult(requestId: string | undefined, result: CommandResult): void {
    if (!requestId) return;
    this.out.send("commandResult", { requestId, ok: result.ok, ...(result.ok ? {} : { reason: result.reason }) });
  }

  // ── trạng thái ─────────────────────────────────────────────────────────

  private get loaded(): boolean {
    // Snapshot: nội dung có sẵn ngay (chỉ đọc). Live: chỉ khi đã đồng bộ lần đầu.
    return this.source === "snapshot" || (this.connSnap?.everSynced ?? false);
  }

  private get tooLarge(): boolean {
    return (this.connSnap?.serverTooLarge ?? false) || this.sizeLevel === "full";
  }

  private computeStatus(): StatusPayload | undefined {
    if (this.source === "snapshot") return SNAPSHOT_STATUS;
    const c = this.connSnap;
    if (!c) return undefined;
    const readOnly = this.requestedMode !== "edit" || c.serverReadOnly || c.archived || this.contentBroken;
    return {
      connection: this.contentBroken ? "closed" : c.connection,
      unsynced: !readOnly && c.unsynced,
      saveFailed: c.saveFailed,
      mode: this.requestedMode === "edit" && readOnly ? "view" : this.requestedMode,
      readOnly,
      archived: c.archived,
      tooLarge: this.tooLarge,
      nearLimit: this.sizeLevel !== "ok",
    };
  }

  private refresh(): void {
    const status = this.computeStatus();
    if (!status) return;
    const editable = !status.readOnly && this.loaded;
    if (this.editor && this.editor.isEditable !== editable) this.editor.setEditable(editable);
    this.out.sendIfChanged("status", status);
    this.scheduleSelection();
  }

  private scheduleSelection(remote = false): void {
    if (remote) {
      if (this.remoteSelectionTimer) return;
      this.remoteSelectionTimer = setTimeout(() => {
        this.remoteSelectionTimer = undefined;
        this.sendSelectionState();
      }, REMOTE_SELECTION_DEBOUNCE_MS);
      return;
    }
    if (this.selectionScheduled) return;
    this.selectionScheduled = true;
    queueMicrotask(() => {
      this.selectionScheduled = false;
      this.sendSelectionState();
    });
  }

  private sendSelectionState(): void {
    if (this.editor && !this.editor.isDestroyed) this.out.sendIfChanged("selectionState", computeSelectionState(this.editor, this.editor.isEditable));
  }

  private schedulePresence(): void {
    if (this.presenceTimer) return;
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = undefined;
      this.presence();
    }, PRESENCE_DEBOUNCE_MS);
  }

  private presence(): void {
    const awareness = this.conn?.awarenessProvider.awareness;
    if (!awareness || !this.me) return;
    const users = presenceFromStates(awareness.getStates(), this.me.id);
    this.out.sendIfChanged("awareness", { users, count: users.length });
  }

  private scheduleSizeCheck(): void {
    if (this.sizeTimer || !this.stateMaxBytes) return;
    this.sizeTimer = setTimeout(() => {
      this.sizeTimer = undefined;
      this.checkSize();
    }, SIZE_CHECK_MS);
  }

  private checkSize(): void {
    if (!this.doc || !this.stateMaxBytes) return;
    const ratio = estimateStateBytes(this.doc, this.stateMaxBytes * 0.9) / this.stateMaxBytes;
    const level: SizeLevel = ratio >= 1 ? "full" : ratio >= 0.9 ? "near" : "ok";
    if (level === this.sizeLevel) return;
    const previous = this.sizeLevel;
    this.sizeLevel = level;
    if (level === "full" && previous !== "full") this.error("TOO_LARGE", false, "Tài liệu đã đạt giới hạn dung lượng", "local-estimate");
    this.refresh();
  }

  private onNotice(code: NoticeCode): void {
    this.out.send("notice", { code });
    // Nội dung vừa bị thay bằng bản khôi phục: lịch sử hoàn tác cũ trỏ vào nội dung đã bị xoá — bỏ để "Hoàn tác" không hồi sinh mảnh cũ.
    if (code === "RESTORED" && this.editor) {
      yUndoPluginKey.getState(this.editor.state)?.undoManager?.clear();
      this.scheduleSelection();
    }
  }

  private onContentError(): void {
    if (this.contentBroken) return;
    this.contentBroken = true;
    this.conn?.halt();
    this.error("LOAD_FAILED", true, "Nội dung tài liệu không hợp lệ với phiên bản trình soạn thảo này", "content-invalid");
    this.refresh();
  }

  private error(code: EditorErrorCode, fatal: boolean, message: string, detail?: string): void {
    this.out.send("error", { code, fatal, message, ...(detail ? { detail } : {}) });
  }

  private teardown(): void {
    clearTimeout(this.sizeTimer);
    clearTimeout(this.presenceTimer);
    clearTimeout(this.remoteSelectionTimer);
    this.remoteSelectionTimer = undefined;
    this.sizeTimer = undefined;
    this.presenceTimer = undefined;
    this.editor?.destroy();
    this.conn?.destroy();
    this.doc?.destroy();
    this.resolver?.dispose();
    this.editor = undefined;
    this.conn = undefined;
    this.doc = undefined;
    this.resolver = undefined;
    this.connSnap = undefined;
    this.source = undefined;
    this.me = undefined;
    this.sizeLevel = "ok";
    this.stateMaxBytes = undefined;
    this.contentBroken = false;
    this.out.reset();
  }
}
