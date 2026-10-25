import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import jwt from "jsonwebtoken";
import { WebSocket } from "ws";
import * as Y from "yjs";
import { loadConfig, type CollabConfig } from "../../src/config";
import { silentLogger } from "../../src/logger";
import { createCollabServer, type CollabServer } from "../../src/server";
import { TEST_SECRET } from "../fixtures/secrets";
import { BeMock } from "./be-mock";

/** ObjectId 24 hex từ số nguyên: `oid(1)` → `000000000000000000000001`. */
export const oid = (n: number): string => n.toString(16).padStart(24, "0");

export interface TokenOptions {
  userId: string;
  docId: string;
  kind?: string;
  mode?: "edit" | "view";
  sv?: number;
  secret?: string;
  expiresInSeconds?: number;
  audience?: string;
  issuer?: string;
  algorithm?: "HS256" | "HS512";
}

export function signToken(o: TokenOptions): string {
  return jwt.sign({ kind: o.kind ?? "document", docId: o.docId, mode: o.mode ?? "edit", sv: o.sv ?? 1 }, o.secret ?? TEST_SECRET, {
    algorithm: o.algorithm ?? "HS256",
    subject: o.userId,
    audience: o.audience ?? "collab",
    issuer: o.issuer ?? "superapp-be",
    expiresIn: o.expiresInSeconds ?? 300,
    jwtid: `jti-${Math.random().toString(16).slice(2)}`,
  });
}

export interface Harness {
  be: BeMock;
  server: CollabServer;
  config: CollabConfig;
  port: number;
  clients: TestClient[];
  stop(): Promise<void>;
}

export async function startHarness(env: Record<string, string> = {}, beMock?: BeMock): Promise<Harness> {
  const be = beMock ?? new BeMock();
  if (!beMock) await be.start();
  const config = loadConfig({
    NODE_ENV: "test",
    PORT: "0",
    HOST: "127.0.0.1",
    BE_INTERNAL_URL: be.url(),
    COLLAB_SHARED_SECRET: TEST_SECRET,
    LOG_LEVEL: "error",
    STORE_DEBOUNCE_MS: "60",
    STORE_MAX_DEBOUNCE_MS: "500",
    STORE_RETRY_BASE_MS: "100",
    STORE_RETRY_MAX_MS: "400",
    ACCESS_RECHECK_MS: "0",
    BE_TIMEOUT_MS: "4000",
    BE_RETRIES: "0",
    AUTH_TIMEOUT_MS: "3000",
    ...env,
  });
  const server = createCollabServer(config, { logger: silentLogger, processMetrics: false, retryBaseMs: 0 });
  const port = await server.start();
  const clients: TestClient[] = [];
  const harness: Harness = {
    be,
    server,
    config,
    port,
    clients,
    async stop() {
      for (const c of clients.splice(0)) c.destroy();
      await server.stop();
      if (!beMock) await be.stop();
    },
  };
  return harness;
}

export interface CloseInfo {
  code: number;
  reason: string;
}

export interface TestClient {
  provider: HocuspocusProvider;
  doc: Y.Doc;
  text: Y.Text;
  authFailed: string[];
  authenticated: string[];
  closes: CloseInfo[];
  notices: Array<{ code: string }>;
  destroy(): void;
  /** Ngắt WebSocket (không nối lại) như mất mạng. */
  goOffline(): void;
  goOnline(): void;
}

export interface ConnectOptions {
  docId: string;
  userId: string;
  mode?: "edit" | "view";
  token?: string | (() => string) | (() => Promise<string>);
  name?: string;
  kind?: string;
  awarenessUser?: { id: string; name: string; color: string } | null;
  path?: string;
  doc?: Y.Doc;
}

export function connect(h: Harness, o: ConnectOptions): TestClient {
  const doc = o.doc ?? new Y.Doc();
  const authFailed: string[] = [];
  const authenticated: string[] = [];
  const closes: CloseInfo[] = [];
  const notices: Array<{ code: string }> = [];
  const socket = new HocuspocusProviderWebsocket({ url: `ws://127.0.0.1:${h.port}${o.path ?? "/collab"}?doc=${o.docId}`, WebSocketPolyfill: WebSocket });
  const provider = new HocuspocusProvider({
    name: o.name ?? `doc:${o.docId}`,
    document: doc,
    token: o.token ?? (() => signToken({ userId: o.userId, docId: o.docId, mode: o.mode ?? "edit", ...(o.kind ? { kind: o.kind } : {}) })),
    websocketProvider: socket,
    onAuthenticationFailed: ({ reason }) => void authFailed.push(reason),
    onAuthenticated: ({ scope }) => void authenticated.push(scope),
    onClose: ({ event }) => void closes.push({ code: event.code, reason: event.reason }),
    onStateless: ({ payload }) => {
      try {
        notices.push(JSON.parse(payload) as { code: string });
      } catch {
        /* bỏ qua */
      }
    },
  });
  provider.attach();
  if (o.awarenessUser !== null) {
    provider.setAwarenessField("user", o.awarenessUser ?? { id: o.userId, name: `User ${o.userId.slice(-4)}`, color: "#175CD3" });
  }
  const client: TestClient = {
    provider,
    doc,
    text: doc.getText("t"),
    authFailed,
    authenticated,
    closes,
    notices,
    destroy: () => {
      provider.destroy();
      socket.destroy();
    },
    goOffline: () => socket.disconnect(),
    goOnline: () => void socket.connect(),
  };
  h.clients.push(client);
  return client;
}

export async function waitFor(check: () => boolean, opts: { timeoutMs?: number; intervalMs?: number; label?: string } = {}): Promise<void> {
  const deadline = Date.now() + (opts.timeoutMs ?? 5000);
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, opts.intervalMs ?? 15));
  }
  throw new Error(`waitFor quá hạn${opts.label ? `: ${opts.label}` : ""}`);
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export const synced = (c: TestClient): boolean => c.provider.isSynced && c.provider.isAuthenticated;

/** Gọi API nội bộ của collab (kèm bí mật). */
export async function internal(h: Harness, path: string, body?: unknown, opts: { secret?: string | null; method?: string } = {}): Promise<{ status: number; json: unknown }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.secret !== null) headers["X-Collab-Secret"] = opts.secret ?? TEST_SECRET;
  const res = await fetch(`http://127.0.0.1:${h.port}${path}`, {
    method: opts.method ?? (body === undefined ? "GET" : "POST"),
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* văn bản thường */
  }
  return { status: res.status, json };
}
