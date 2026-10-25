/**
 * Kiểm tra tin bridge lúc chạy — KHÔNG BAO GIỜ ném lỗi: mọi thứ lạ (JSON cắt cụt, `v` khác 1, `type` lạ, payload sai kiểu, quá cỡ) trả `{ ok: false }`.
 * `parseHostMessage` chạy trong WebView (tin từ app); `parseEditorMessage` cho phía app đọc tin từ WebView (app sao chép cùng file này nếu cần).
 */
import { isBase64, utf8FromBase64Url } from "./base64";
import {
  ALL_COMMANDS,
  BRIDGE_LIMITS,
  BRIDGE_VERSION,
  SIMPLE_COMMANDS,
  type CollabUser,
  type CommandName,
  type CommandPayload,
  type CommandRejectReason,
  type EditorMessage,
  type EditorMode,
  type HostMessage,
  type InitPayload,
} from "./bridge-protocol";

export type ParseResult<T> = { ok: true; message: T } | { ok: false; reason: string; type?: string; requestId?: string };

const MODES: readonly EditorMode[] = ["edit", "view", "comment"];
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const USER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DOC_NAME_RE = /^doc:([0-9a-fA-F]{24})$/;
const ASSET_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const REQUEST_ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const fail = (reason: string, extra: { type?: string; requestId?: string } = {}): { ok: false; reason: string; type?: string; requestId?: string } => ({
  ok: false,
  reason,
  ...extra,
});
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** Epoch ms từ ISO string hoặc số (giây/ms đều là ms nếu ≥ 1e11); không hợp lệ → `undefined`. */
export function toEpochMs(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
  if (typeof value === "string" && value.length <= 40) {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? undefined : ms;
  }
  return undefined;
}

/** Claim của JWT (KHÔNG xác minh chữ ký — chỉ để đọc `exp`/`sub`/`docId` giúp phát hiện init sai sớm). */
export function decodeJwtClaims(token: string): Obj | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  const json = utf8FromBase64Url(parts[1]);
  if (!json) return null;
  try {
    const claims: unknown = JSON.parse(json);
    return isObj(claims) ? claims : null;
  } catch {
    return null;
  }
}

/** Liên kết an toàn để mở/lưu: chỉ http(s)/mailto/tel, ≤ 2048 ký tự, không `javascript:`/`data:`. */
export function isSafeLinkUrl(url: string): boolean {
  if (url.length === 0 || url.length > BRIDGE_LIMITS.maxLinkChars) return false;
  try {
    return SAFE_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

/** Chuẩn hoá chuỗi người dùng nhập (`example.com` → `https://example.com`, `a@b.vn` → `mailto:`); không an toàn → `null`. */
export function normalizeLinkHref(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(text);
  const candidate = hasScheme ? text : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? `mailto:${text}` : `https://${text}`;
  return isSafeLinkUrl(candidate) ? candidate : null;
}

/** Cắt theo ký tự (không chẻ đôi cặp surrogate) sao cho `length` (UTF-16) ≤ `max` — server kiểm `name.length ≤ 80`. */
export function clampText(value: string, max: number): string {
  if (value.length <= max) return value;
  let end = max;
  const last = value.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return value.slice(0, end);
}

function parseUser(v: unknown): CollabUser | string {
  if (!isObj(v)) return "user-missing";
  const { id, name, color } = v;
  if (typeof id !== "string" || !USER_ID_RE.test(id)) return "user-id-invalid";
  if (typeof color !== "string" || !COLOR_RE.test(color)) return "user-color-invalid";
  if (typeof name !== "string") return "user-name-invalid";
  const clean = clampText(name.trim(), BRIDGE_LIMITS.maxNameChars);
  return { id, name: clean || "Người dùng", color };
}

function parseSubset(p: Obj): { locale?: "vi" | "en"; theme?: "light" | "dark" } {
  return {
    ...(p["locale"] === "vi" || p["locale"] === "en" ? { locale: p["locale"] } : {}),
    ...(p["theme"] === "light" || p["theme"] === "dark" ? { theme: p["theme"] } : {}),
  };
}

function parseInit(p: Obj): ParseResult<InitPayload> {
  const common = parseSubset(p);
  if (p["source"] === "snapshot") {
    const state = p["yjsState"];
    if (typeof state !== "string" || !isBase64(state) || state.length > BRIDGE_LIMITS.maxSnapshotInitChars) return fail("snapshot-invalid", { type: "init" });
    return { ok: true, message: { source: "snapshot", yjsState: state, ...common } as InitPayload };
  }
  if (p["source"] !== undefined && p["source"] !== "live") return fail("source-invalid", { type: "init" });

  const { url, token, documentName, mode } = p;
  if (typeof url !== "string" || url.length > BRIDGE_LIMITS.maxLinkChars) return fail("url-invalid", { type: "init" });
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return fail("url-invalid", { type: "init" });
  }
  if ((parsedUrl.protocol !== "ws:" && parsedUrl.protocol !== "wss:") || parsedUrl.username || parsedUrl.password) return fail("url-must-be-ws", { type: "init" });
  if (typeof token !== "string" || token.length === 0 || token.length > 4096) return fail("token-invalid", { type: "init" });
  const nameMatch = typeof documentName === "string" ? DOC_NAME_RE.exec(documentName) : null;
  if (!nameMatch?.[1]) return fail("documentName-invalid", { type: "init" });
  if (!oneOf(MODES, mode)) return fail("mode-invalid", { type: "init" });
  const user = parseUser(p["user"]);
  if (typeof user === "string") return fail(user, { type: "init" });

  // Phát hiện sớm cấu hình sai mà server sẽ từ chối (unauthorized / awareness-invalid) — dễ debug hơn "kết nối rớt".
  const claims = decodeJwtClaims(token);
  if (claims) {
    if (typeof claims["sub"] === "string" && claims["sub"] !== user.id) return fail("user-id-mismatch", { type: "init" });
    if (typeof claims["docId"] === "string" && claims["docId"].toLowerCase() !== nameMatch[1].toLowerCase()) return fail("document-mismatch", { type: "init" });
    if (claims["kind"] !== undefined && claims["kind"] !== "document") return fail("kind-mismatch", { type: "init" });
  }

  const placeholder = typeof p["placeholder"] === "string" ? clampText(p["placeholder"].trim(), BRIDGE_LIMITS.maxPlaceholderChars) : "";
  const max = p["stateMaxBytes"];
  const expiresAt = toEpochMs(p["expiresAt"]);
  return {
    ok: true,
    message: {
      source: "live",
      url,
      token,
      documentName: documentName as string,
      mode,
      user,
      ...common,
      ...(expiresAt !== undefined ? { expiresAt } : {}),
      ...(placeholder ? { placeholder } : {}),
      ...(typeof max === "number" && Number.isInteger(max) && max > 0 && max <= 64 * 1024 * 1024 ? { stateMaxBytes: max } : {}),
    },
  };
}

function parseCommand(p: Obj): ParseResult<CommandPayload> {
  const rid = p["requestId"];
  const requestId = typeof rid === "string" && REQUEST_ID_RE.test(rid) ? rid : undefined;
  const meta = { type: "command", ...(requestId ? { requestId } : {}) };
  const rejected = (reason: CommandRejectReason) => fail(reason, meta);
  const name = p["name"];
  if (!oneOf<CommandName>(ALL_COMMANDS, name)) return rejected("unknown-command");
  const attrs = p["attrs"];
  if (attrs !== undefined && !isObj(attrs)) return rejected("invalid-attrs");
  const base = requestId ? { requestId } : {};

  if (oneOf(SIMPLE_COMMANDS, name)) return { ok: true, message: { name, ...base } };
  if (name === "heading") {
    const level = attrs?.["level"];
    return level === 1 || level === 2 || level === 3 ? { ok: true, message: { name, attrs: { level }, ...base } } : rejected("invalid-attrs");
  }
  if (name === "link") {
    const href = attrs?.["href"];
    if (href === null || href === undefined || href === "") return { ok: true, message: { name, attrs: { href: null }, ...base } };
    const normalized = typeof href === "string" ? normalizeLinkHref(href) : null;
    return normalized ? { ok: true, message: { name, attrs: { href: normalized }, ...base } } : rejected("invalid-attrs");
  }
  if (name === "insertTable") {
    const rows = attrs?.["rows"] ?? 3;
    const cols = attrs?.["cols"] ?? 3;
    const okDim = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 10;
    return okDim(rows) && okDim(cols) ? { ok: true, message: { name, attrs: { rows, cols }, ...base } } : rejected("invalid-attrs");
  }
  const position = attrs?.["position"] ?? "end";
  return position === "start" || position === "end" ? { ok: true, message: { name: "focus", attrs: { position }, ...base } } : rejected("invalid-attrs");
}

const asToken = (v: unknown): string | undefined => (typeof v === "string" && v.length > 0 && v.length <= 4096 ? v : undefined);

function parseByType(type: string, p: Obj): ParseResult<HostMessage["payload"]> {
  switch (type) {
    case "init":
      return parseInit(p);
    case "setToken": {
      const token = asToken(p["token"]);
      if (!token) return fail("token-invalid", { type });
      const expiresAt = toEpochMs(p["expiresAt"]);
      return { ok: true, message: { token, ...(expiresAt !== undefined ? { expiresAt } : {}) } };
    }
    case "command":
      return parseCommand(p);
    case "insertImage": {
      const rid = p["requestId"];
      if (typeof p["assetId"] !== "string" || !ASSET_ID_RE.test(p["assetId"])) return fail("assetId-invalid", { type });
      const alt = typeof p["alt"] === "string" ? clampText(p["alt"].trim(), 200) : "";
      return {
        ok: true,
        message: { assetId: p["assetId"], ...(alt ? { alt } : {}), ...(typeof rid === "string" && REQUEST_ID_RE.test(rid) ? { requestId: rid } : {}) },
      };
    }
    case "assetUrl": {
      const assetId = p["assetId"];
      if (typeof assetId !== "string" || !ASSET_ID_RE.test(assetId)) return fail("assetId-invalid", { type });
      const err = p["error"];
      if (err !== undefined) return oneOf(["not-found", "forbidden", "failed"] as const, err) ? { ok: true, message: { assetId, error: err } } : fail("error-invalid", { type });
      const url = p["url"];
      if (typeof url !== "string" || url.length > 4096) return fail("url-invalid", { type });
      try {
        const proto = new URL(url).protocol;
        if (proto !== "https:" && proto !== "http:") return fail("url-invalid", { type });
      } catch {
        return fail("url-invalid", { type });
      }
      const expiresAt = toEpochMs(p["expiresAt"]);
      return { ok: true, message: { assetId, url, ...(expiresAt !== undefined ? { expiresAt } : {}) } };
    }
    case "setMode":
      return oneOf(MODES, p["mode"]) ? { ok: true, message: { mode: p["mode"] } } : fail("mode-invalid", { type });
    case "setTheme":
      return p["theme"] === "light" || p["theme"] === "dark" ? { ok: true, message: { theme: p["theme"] } } : fail("theme-invalid", { type });
    case "retry":
    case "dispose":
      return { ok: true, message: {} };
    default:
      return fail("unknown-type", { type });
  }
}

/** Tách phong bì `{ v, type, payload }` từ chuỗi/đối tượng. Giới hạn cỡ tính theo số ký tự chuỗi JSON. */
function parseEnvelope(raw: unknown, maxChars: (type: string, payload: Obj) => number): { ok: true; type: string; payload: Obj } | { ok: false; reason: string } {
  let value: unknown = raw;
  let chars = 0;
  if (typeof raw === "string") {
    if (raw.length > BRIDGE_LIMITS.maxSnapshotInitChars) return { ok: false, reason: "too-large" };
    chars = raw.length;
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, reason: "malformed-json" };
    }
  }
  if (!isObj(value)) return { ok: false, reason: "not-an-object" };
  if (value["v"] !== BRIDGE_VERSION) return { ok: false, reason: "unsupported-version" };
  const { type, payload } = value;
  if (typeof type !== "string") return { ok: false, reason: "type-missing" };
  if (!isObj(payload)) return { ok: false, reason: "payload-missing" };
  if (chars > maxChars(type, payload)) return { ok: false, reason: "too-large" };
  return { ok: true, type, payload };
}

/** Tin từ app (chuỗi JSON hoặc object đã parse) → tin đã chuẩn hoá (đã cắt tên, chuẩn hoá liên kết, mặc định hoá tham số). */
export function parseHostMessage(raw: unknown): ParseResult<HostMessage> {
  const env = parseEnvelope(raw, (type, payload) => (type === "init" && payload["source"] === "snapshot" ? BRIDGE_LIMITS.maxSnapshotInitChars : BRIDGE_LIMITS.maxMessageChars));
  if (!env.ok) return fail(env.reason);
  const result = parseByType(env.type, env.payload);
  if (!result.ok) return result;
  return { ok: true, message: { v: BRIDGE_VERSION, type: env.type, payload: result.message } as HostMessage };
}

const CONNECTION_STATES = ["connecting", "synced", "offline", "closed"] as const;
const ERROR_CODES = ["AUTH_EXPIRED", "FORBIDDEN", "NOT_FOUND", "TOO_LARGE", "LOAD_FAILED", "INVALID_MESSAGE"] as const;
const NOTICE_CODES = ["SAVE_FAILED", "SAVE_RECOVERED", "TOO_LARGE", "ARCHIVED", "RESTORED", "READ_ONLY"] as const;
const BOOL_STATUS = ["unsynced", "saveFailed", "readOnly", "archived", "tooLarge", "nearLimit"] as const;
const BOOL_SELECTION = ["bold", "italic", "underline", "strike", "code", "bulletList", "orderedList", "taskList", "blockquote", "codeBlock", "table", "canUndo", "canRedo", "canEdit"] as const;
const allBools = (p: Obj, keys: readonly string[]): boolean => keys.every((k) => typeof p[k] === "boolean");
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;

function validEditorPayload(type: string, p: Obj): boolean {
  switch (type) {
    case "ready":
      return p["protocol"] === BRIDGE_VERSION && typeof p["bundle"] === "string" && Array.isArray(p["commands"]);
    case "status":
      return oneOf(CONNECTION_STATES, p["connection"]) && oneOf(MODES, p["mode"]) && allBools(p, BOOL_STATUS);
    case "selectionState":
      return allBools(p, BOOL_SELECTION) && (p["link"] === null || typeof p["link"] === "string") && [null, 1, 2, 3].includes(p["heading"] as null | 1 | 2 | 3);
    case "awareness":
      return typeof p["count"] === "number" && Array.isArray(p["users"]) && p["users"].every((u) => isObj(u) && isStr(u["id"]) && typeof u["name"] === "string" && typeof u["self"] === "boolean");
    case "requestToken":
      return (p["reason"] === "expired" || p["reason"] === "unauthorized") && typeof p["attempt"] === "number";
    case "requestImage":
      return isStr(p["requestId"]) && (p["source"] === "paste" || p["source"] === "drop");
    case "resolveAssetUrl":
      return isStr(p["assetId"]);
    case "openLink":
      return typeof p["url"] === "string" && isSafeLinkUrl(p["url"]);
    case "notice":
      return oneOf(NOTICE_CODES, p["code"]);
    case "commandResult":
      return isStr(p["requestId"]) && typeof p["ok"] === "boolean";
    case "error":
      return oneOf(ERROR_CODES, p["code"]) && typeof p["fatal"] === "boolean";
    default:
      return false;
  }
}

/** Phía APP: đọc tin từ WebView (`onMessage` → `event.nativeEvent.data`). Tin sai kiểu bị từ chối thay vì ép kiểu mù. */
export function parseEditorMessage(raw: unknown): ParseResult<EditorMessage> {
  const env = parseEnvelope(raw, () => BRIDGE_LIMITS.maxMessageChars);
  if (!env.ok) return fail(env.reason);
  if (!validEditorPayload(env.type, env.payload)) return fail("payload-invalid", { type: env.type });
  return { ok: true, message: { v: BRIDGE_VERSION, type: env.type, payload: env.payload } as EditorMessage };
}

