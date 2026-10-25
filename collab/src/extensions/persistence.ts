import type {
  Document,
  Extension,
  Hocuspocus,
  afterUnloadDocumentPayload,
  beforeUnloadDocumentPayload,
  onChangePayload,
  onLoadDocumentPayload,
  onStoreDocumentPayload,
} from "@hocuspocus/server";
import * as Y from "yjs";
import type { BeClient } from "../be-client";
import type { CollabConfig } from "../config";
import { AuthDenied, BeRejectedError, CLOSE_CODE, UnloadBlocked } from "../errors";
import { closeLiveConnection, liveConnections } from "../connections";
import type { Logger } from "../logger";
import { errorMeta } from "../logger";
import type { CollabMetrics } from "../metrics";
import { KIND_SPECS, parseDocumentName, type ResourceKind } from "../resource-kinds";
import { contextOf, encodeNotice, type Notice } from "../types";

/** Trạng thái theo document của instance này. `pending` ≠ rỗng = có state CHƯA lưu được về BE (giữ trong RAM, thử lại). */
interface DocState {
  kind: ResourceKind;
  id: string;
  /** Version BE báo ở lần tải/lưu gần nhất — gửi kèm PUT để BE biết có ai ghi xen giữa (khôi phục snapshot, instance khác). */
  baseVersion: number;
  lastEditor?: string;
  saveFailedNotified: boolean;
  pending?: { state: Uint8Array; permanent: boolean; since: number };
  retry?: { timer: NodeJS.Timeout; attempts: number };
}

export interface PersistenceDeps {
  config: CollabConfig;
  be: Pick<BeClient, "getState" | "putState">;
  logger: Logger;
  metrics: CollabMetrics;
  hocuspocus: () => Hocuspocus;
}

const ORIGIN_LOAD = "collab-load";

/**
 * Lưu/khôi phục trạng thái Yjs — BE là NGUỒN DUY NHẤT (collab không đọc/ghi Mongo, không cache đĩa):
 *  - `onLoadDocument`: `GET /internal/.../state` rồi áp vào Y.Doc (hợp nhất, không ghi đè);
 *  - `onStoreDocument` (Hocuspocus debounce `STORE_DEBOUNCE_MS`, tối đa `STORE_MAX_DEBOUNCE_MS`, và khi người cuối rời):
 *    `PUT /internal/.../state`. Hook này KHÔNG BAO GIỜ ném lỗi (lỗi của hook chạy nền sẽ thành unhandled rejection):
 *    BE chậm/sập → giữ state trong RAM, thử lại theo backoff, chặn dỡ document (`beforeUnloadDocument`) tới khi lưu được;
 *  - Yjs là CRDT nên state đang giữ luôn hợp nhất được với state BE (kể cả sau khôi phục snapshot) — không mất update.
 */
export class PersistenceExtension implements Extension {
  readonly extensionName = "collab-persistence";
  private readonly states = new Map<string, DocState>();

  constructor(private readonly deps: PersistenceDeps) {}

  pendingCount(): number {
    let n = 0;
    for (const st of this.states.values()) if (st.pending && !st.pending.permanent) n += 1;
    return n;
  }

  stateOf(documentName: string): DocState | undefined {
    return this.states.get(documentName);
  }

  async onLoadDocument({ document, documentName, context }: onLoadDocumentPayload): Promise<void> {
    const parsed = parseDocumentName(documentName);
    if (!parsed) throw new AuthDenied("not-found");
    let loaded;
    try {
      loaded = await this.deps.be.getState(parsed.kind, parsed.id);
    } catch (err) {
      this.deps.logger.warn("không tải được state từ BE", { documentName, ...errorMeta(err) });
      this.abortConnect(context, "unavailable");
      throw new AuthDenied("unavailable");
    }
    if (loaded === null) {
      this.abortConnect(context, "not-found");
      throw new AuthDenied("not-found");
    }
    if (loaded.state.byteLength > 0) Y.applyUpdate(document, loaded.state, ORIGIN_LOAD);
    const previous = this.states.get(documentName);
    // State chưa lưu của phiên trước (nếu còn) hợp nhất vào — CRDT nên không ghi đè gì cả.
    if (previous?.pending && !previous.pending.permanent) Y.applyUpdate(document, previous.pending.state, ORIGIN_LOAD);
    this.states.set(documentName, { kind: parsed.kind, id: parsed.id, baseVersion: loaded.version, saveFailedNotified: false, ...(previous?.pending ? { pending: previous.pending } : {}) });
  }

  async onChange({ context, documentName }: onChangePayload): Promise<void> {
    const user = contextOf(context).user;
    if (!user) return; // update từ Redis/server (khôi phục) — không phải người gõ
    const st = this.states.get(documentName);
    if (st) st.lastEditor = user.id;
  }

  /** Không ném lỗi — xem ghi chú lớp. */
  async onStoreDocument({ document, documentName, context }: onStoreDocumentPayload): Promise<void> {
    const st = this.states.get(documentName);
    if (!st) return;
    const editor = contextOf(context).user?.id ?? st.lastEditor;
    await this.storeNow(st, documentName, document, Y.encodeStateAsUpdate(document), editor);
  }

  async beforeUnloadDocument({ documentName }: beforeUnloadDocumentPayload): Promise<void> {
    const st = this.states.get(documentName);
    if (st?.pending && !st.pending.permanent) throw new UnloadBlocked();
  }

  async afterUnloadDocument({ documentName }: afterUnloadDocumentPayload): Promise<void> {
    const st = this.states.get(documentName);
    if (st?.retry) clearTimeout(st.retry.timer);
    this.states.delete(documentName);
  }

  async onDestroy(): Promise<void> {
    for (const st of this.states.values()) if (st.retry) clearTimeout(st.retry.timer);
  }

  /** Gửi state lên BE và xử lý mọi kết cục; luôn resolve. `document` = `undefined` khi thử lại sau khi document đã dỡ khỏi RAM. */
  async storeNow(st: DocState, documentName: string, document: Document | undefined, state: Uint8Array, editor?: string): Promise<void> {
    const { be, metrics, logger } = this.deps;
    const started = process.hrtime.bigint();
    const done = (result: string): void => {
      metrics.storeTotal.inc({ kind: st.kind, result });
      metrics.storeDuration.observe({ kind: st.kind, result }, Number(process.hrtime.bigint() - started) / 1e9);
    };

    if (state.byteLength > KIND_SPECS[st.kind].stateMaxBytes) {
      st.pending = { state, permanent: true, since: Date.now() };
      done("too_large");
      this.notify(document, "TOO_LARGE");
      logger.error("state vượt trần — không lưu", { documentName, bytes: state.byteLength });
      return;
    }
    try {
      const res = await be.putState(st.kind, st.id, state, { baseVersion: st.baseVersion, ...(editor ? { editorId: editor } : {}) });
      st.baseVersion = Math.max(st.baseVersion, res.yjsVersion);
      delete st.pending;
      if (st.retry) {
        clearTimeout(st.retry.timer);
        delete st.retry;
      }
      done(res.merged ? "merged" : "ok");
      if (st.saveFailedNotified) {
        st.saveFailedNotified = false;
        this.notify(document, "SAVE_RECOVERED");
      }
      if (document && this.deps.hocuspocus().shouldUnloadDocument(document)) void this.deps.hocuspocus().unloadDocument(document);
    } catch (err) {
      if (err instanceof BeRejectedError && err.status === 413) {
        st.pending = { state, permanent: true, since: Date.now() };
        done("too_large");
        this.notify(document, "TOO_LARGE");
      } else if (err instanceof BeRejectedError && (err.status === 409 || err.status === 404)) {
        // Tài nguyên đã lưu trữ/không còn: BE từ chối ghi. Bỏ state chưa lưu, đóng mọi kết nối để nối lại theo trạng thái thật.
        delete st.pending;
        done(err.status === 409 ? "archived" : "not_found");
        this.notify(document, "ARCHIVED");
        this.kickAll(documentName, err.status === 409 ? "archived" : "forbidden");
      } else {
        done("failed");
        this.keepAndRetry(st, documentName, document, state, err);
      }
      logger.warn("lưu state lỗi", { documentName, ...errorMeta(err) });
    }
  }

  private keepAndRetry(st: DocState, documentName: string, document: Document | undefined, state: Uint8Array, err: unknown): void {
    const { config, logger } = this.deps;
    st.pending = { state, permanent: false, since: st.pending?.since ?? Date.now() };
    if (!st.saveFailedNotified) {
      st.saveFailedNotified = true;
      this.notify(document, "SAVE_FAILED");
    }
    this.evictOverflow(documentName);
    if (st.retry) clearTimeout(st.retry.timer);
    const attempts = (st.retry?.attempts ?? 0) + 1;
    const base = Math.min(config.storeRetryMaxMs, config.storeRetryBaseMs * 2 ** (attempts - 1));
    const delay = Math.round(base * (0.8 + Math.random() * 0.4));
    const timer = setTimeout(() => void this.retry(documentName), delay);
    timer.unref();
    st.retry = { timer, attempts };
    logger.warn("sẽ thử lưu lại", { documentName, attempts, delayMs: delay, ...errorMeta(err) });
  }

  private async retry(documentName: string): Promise<void> {
    const st = this.states.get(documentName);
    if (!st?.pending || st.pending.permanent) return;
    const document = this.deps.hocuspocus().documents.get(documentName);
    const state = document ? Y.encodeStateAsUpdate(document) : st.pending.state;
    await this.storeNow(st, documentName, document, state, st.lastEditor);
    if (!document && !st.pending) this.states.delete(documentName);
  }

  /** Quá `PENDING_MAX_DOCS` document đang giữ state chưa lưu → bỏ cái cũ nhất (log lỗi + metric) để không tràn RAM. */
  private evictOverflow(current: string): void {
    const { config, logger, metrics } = this.deps;
    while (this.pendingCount() > config.pendingMaxDocs) {
      let oldest: [string, DocState] | undefined;
      for (const entry of this.states) {
        if (entry[0] === current || !entry[1].pending || entry[1].pending.permanent) continue;
        if (!oldest || entry[1].pending.since < (oldest[1].pending?.since ?? Infinity)) oldest = entry;
      }
      if (!oldest) return;
      logger.error("bỏ state chưa lưu do vượt PENDING_MAX_DOCS (mất dữ liệu)", { documentName: oldest[0] });
      metrics.pendingLost.inc();
      if (oldest[1].retry) clearTimeout(oldest[1].retry.timer);
      delete oldest[1].pending;
      delete oldest[1].retry;
    }
  }

  private notify(document: Document | undefined, code: Notice["code"]): void {
    try {
      document?.broadcastStateless(encodeNotice(code));
    } catch (err) {
      this.deps.logger.debug("không phát được thông báo stateless", errorMeta(err));
    }
  }

  private kickAll(documentName: string, reason: "archived" | "forbidden"): void {
    const hp = this.deps.hocuspocus();
    for (const live of liveConnections(hp, { documentName })) closeLiveConnection(live, reason);
    this.deps.metrics.kicksTotal.inc({ reason });
  }

  /** Nối lỗi tải document: đóng socket đang chờ (đã nhận `authenticationFailed`) và nhả chỗ giữ. */
  private abortConnect(context: unknown, reason: "unavailable" | "not-found"): void {
    const ctx = contextOf(context);
    ctx.releaseReservation?.();
    const sock = ctx.sock;
    if (!sock) return;
    setImmediate(() => {
      if (sock.docCount === 0 && sock.ws.readyState === sock.ws.OPEN) sock.ws.close(CLOSE_CODE[reason], reason);
    });
  }
}
