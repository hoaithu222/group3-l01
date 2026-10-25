import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import * as Y from "yjs";
import { TEST_SECRET } from "../fixtures/secrets";

/** Đoạn path BE theo loại tài nguyên: `/api/internal/<documents|whiteboards>/:id/...` (khớp `KIND_SPECS[kind].bePath`). */
export type MockBePath = "documents" | "whiteboards";

export interface MockDoc {
  /** Loại tài nguyên; BE thật chỉ trả lời đúng path của loại đó (path khác → 404), nên collab gọi nhầm loại sẽ lộ ngay. */
  bePath: MockBePath;
  state: Uint8Array;
  version: number;
  status: "ACTIVE" | "ARCHIVED";
  workspaceId: string;
  /** userId → quyền; vắng mặt = không được vào. */
  acl: Map<string, "edit" | "view">;
  /** `sv` hợp lệ của từng user (mặc định 1) — test đổi để mô phỏng thu hồi phiên. */
  sessionVersion: Map<string, number>;
}

export interface MockCall {
  op: "access" | "get-state" | "put-state";
  id: string;
  path: MockBePath;
  userId?: string;
  baseVersion?: number;
  bytes?: number;
  at: number;
}

const COLORS = ["#B42318", "#B54708", "#3B7A0A", "#027A48", "#0E7090", "#175CD3", "#5925DC", "#C11574"];

/**
 * BE giả (HTTP thật) cho test: cùng hợp đồng `/api/internal/<documents|whiteboards>/:id/(access|state)` như BE thật, gồm ngữ nghĩa
 * "PUT với base version cũ → HỢP NHẤT (Yjs) thay vì ghi đè". Có chèn độ trễ/sự cố để thử lỗi mạng.
 */
export class BeMock {
  docs = new Map<string, MockDoc>();
  calls: MockCall[] = [];
  /** Trễ (ms) áp cho mọi lời gọi `PUT state`. */
  putDelayMs = 0;
  /** Số lần `PUT` kế tiếp trả 503. */
  failPuts = 0;
  /** BE "sập": mọi lời gọi trả 503. */
  down = false;
  maxStateBytes = 5 * 1024 * 1024;
  secret = TEST_SECRET;
  private server: Server | undefined;

  url(): string {
    return `http://127.0.0.1:${(this.server?.address() as AddressInfo).port}`;
  }

  addDoc(id: string, opts: Partial<MockDoc> & { users?: Record<string, "edit" | "view"> } = {}): MockDoc {
    const doc: MockDoc = {
      bePath: opts.bePath ?? "documents",
      state: opts.state ?? new Uint8Array(),
      version: opts.version ?? 0,
      status: opts.status ?? "ACTIVE",
      workspaceId: opts.workspaceId ?? "aaaaaaaaaaaaaaaaaaaaaaaa",
      acl: new Map(Object.entries(opts.users ?? {})),
      sessionVersion: new Map(),
    };
    this.docs.set(id, doc);
    return doc;
  }

  /** Nội dung văn bản hiện lưu ở BE (`Y.Text` tên `t`). */
  textOf(id: string): string {
    const d = new Y.Doc();
    const doc = this.docs.get(id);
    if (doc && doc.state.byteLength > 0) Y.applyUpdate(d, doc.state);
    return d.getText("t").toString();
  }

  /** Toàn bộ state hiện lưu ở BE dựng lại thành Y.Doc (để kiểm cấu trúc của bảng trắng, không chỉ `Y.Text`). */
  ydocOf(id: string): Y.Doc {
    const d = new Y.Doc();
    const doc = this.docs.get(id);
    if (doc && doc.state.byteLength > 0) Y.applyUpdate(d, doc.state);
    return d;
  }

  putsOf(id: string): MockCall[] {
    return this.calls.filter((c) => c.op === "put-state" && c.id === id);
  }

  async start(): Promise<void> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) => this.server?.listen(0, "127.0.0.1", resolve));
  }

  async stop(): Promise<void> {
    this.server?.closeAllConnections();
    await new Promise<void>((resolve) => this.server?.close(() => resolve()));
  }

  private json(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://mock");
    const match = /^\/api\/internal\/(documents|whiteboards)\/([0-9a-f]{24})\/(access|state)$/.exec(url.pathname);
    if (!match) return this.json(res, 404, { success: false, error: { code: "RES_001" } });
    const [, path, id, what] = match as unknown as [string, MockBePath, string, string];
    if (this.down) return this.json(res, 503, { success: false, error: { code: "SYS_503" } });
    if (req.headers["x-collab-secret"] !== this.secret) return this.json(res, 401, { success: false, error: { code: "AUTH_002" } });
    const doc = this.docs.get(id);
    if (!doc || doc.bePath !== path) return this.json(res, 404, { success: false, error: { code: "RES_001" } });

    if (what === "access" && req.method === "GET") {
      const userId = url.searchParams.get("userId") ?? "";
      const sv = Number(url.searchParams.get("sv") ?? "0");
      this.calls.push({ op: "access", id, path, userId, at: Date.now() });
      const role = doc.acl.get(userId);
      const svOk = sv === (doc.sessionVersion.get(userId) ?? 1);
      if (!role || !svOk) return this.json(res, 200, { success: true, data: { allowed: false, reason: svOk ? "FORBIDDEN" : "SESSION_REVOKED" } });
      const mode = doc.status === "ARCHIVED" ? "view" : role;
      const color = COLORS[parseInt(userId.slice(-2), 16) % COLORS.length];
      return this.json(res, 200, { success: true, data: { allowed: true, mode, user: { id: userId, name: `User ${userId.slice(-4)}`, color }, workspaceId: doc.workspaceId } });
    }

    if (what === "state" && req.method === "GET") {
      this.calls.push({ op: "get-state", id, path, at: Date.now() });
      res.writeHead(200, { "Content-Type": "application/octet-stream", "X-Yjs-Version": String(doc.version) });
      return void res.end(Buffer.from(doc.state));
    }

    if (what === "state" && req.method === "PUT") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const body = new Uint8Array(Buffer.concat(chunks));
      const baseVersion = Number(req.headers["x-yjs-version"] ?? "0");
      this.calls.push({ op: "put-state", id, path, baseVersion, bytes: body.byteLength, at: Date.now() });
      if (this.putDelayMs > 0) await new Promise((r) => setTimeout(r, this.putDelayMs));
      if (this.failPuts > 0) {
        this.failPuts -= 1;
        return this.json(res, 503, { success: false, error: { code: "SYS_503" } });
      }
      if (doc.status === "ARCHIVED") return this.json(res, 409, { success: false, error: { code: "DOC_008" } });
      if (body.byteLength > this.maxStateBytes) return this.json(res, 413, { success: false, error: { code: "DOC_006" } });
      let merged = false;
      if (baseVersion < doc.version && doc.state.byteLength > 0) {
        const d = new Y.Doc();
        Y.applyUpdate(d, doc.state);
        Y.applyUpdate(d, body);
        doc.state = Y.encodeStateAsUpdate(d);
        merged = true;
      } else {
        doc.state = body;
      }
      doc.version = Math.max(doc.version, baseVersion) + 1;
      return this.json(res, 200, { success: true, data: { yjsVersion: doc.version, merged } });
    }
    return this.json(res, 405, { success: false });
  }
}
