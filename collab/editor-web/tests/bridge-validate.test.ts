import { describe, expect, it } from "vitest";
import { BRIDGE_LIMITS } from "../src/bridge-protocol";
import { clampText, decodeJwtClaims, isSafeLinkUrl, normalizeLinkHref, parseEditorMessage, parseHostMessage, toEpochMs } from "../src/bridge-validate";
import { fakeJwt, initMessage, initPayload, USER, USER_ID } from "./helpers/fixtures";
import { msg } from "./helpers/fake-transport";

const parse = (m: unknown) => parseHostMessage(JSON.stringify(m));
const okPayload = (m: unknown) => {
  const r = parse(m);
  if (!r.ok) throw new Error(`mong đợi hợp lệ nhưng nhận: ${r.reason}`);
  return r.message.payload;
};

describe("parseHostMessage — phong bì", () => {
  it("nhận chuỗi JSON và object đã parse", () => {
    expect(parseHostMessage(JSON.stringify(msg("retry", {}))).ok).toBe(true);
    expect(parseHostMessage(msg("retry", {})).ok).toBe(true);
  });

  it.each([
    ["không phải chuỗi/object", 42, "not-an-object"],
    ["null", null, "not-an-object"],
    ["mảng", [], "not-an-object"],
    ["JSON hỏng", "{not json", "malformed-json"],
    ["chuỗi rỗng", "", "malformed-json"],
    ["v khác 1", JSON.stringify({ v: 2, type: "retry", payload: {} }), "unsupported-version"],
    ["thiếu v", JSON.stringify({ type: "retry", payload: {} }), "unsupported-version"],
    ["thiếu type", JSON.stringify({ v: 1, payload: {} }), "type-missing"],
    ["type không phải chuỗi", JSON.stringify({ v: 1, type: 5, payload: {} }), "type-missing"],
    ["thiếu payload", JSON.stringify({ v: 1, type: "retry" }), "payload-missing"],
    ["payload là mảng", JSON.stringify({ v: 1, type: "retry", payload: [] }), "payload-missing"],
    ["type lạ", JSON.stringify({ v: 1, type: "explode", payload: {} }), "unknown-type"],
  ])("từ chối %s", (_name, raw, reason) => {
    const r = parseHostMessage(raw);
    expect(r).toMatchObject({ ok: false, reason });
  });

  it("từ chối tin bị CẮT CỤT giữa chừng (mọi vị trí cắt) mà không ném lỗi", () => {
    const full = JSON.stringify(initMessage());
    for (let cut = 1; cut < full.length; cut += 7) {
      const r = parseHostMessage(full.slice(0, cut));
      expect(r.ok).toBe(false);
    }
  });

  it("chặn tin quá cỡ (tin thường 64 KiB; tin snapshot có trần riêng)", () => {
    const big = JSON.stringify(msg("setToken", { token: "x".repeat(BRIDGE_LIMITS.maxMessageChars) }));
    expect(parseHostMessage(big)).toMatchObject({ ok: false, reason: "too-large" });
    expect(parseHostMessage("x".repeat(BRIDGE_LIMITS.maxSnapshotInitChars + 1))).toMatchObject({ ok: false, reason: "too-large" });
    const snapshot = msg("init", { source: "snapshot", yjsState: "A".repeat(200_000) });
    expect(parse(snapshot)).toMatchObject({ ok: true });
  });
});

describe("init (live)", () => {
  it("chuẩn hoá tên (cắt ≤ 80, không chẻ cặp surrogate), giữ nguyên tiếng Việt", () => {
    const name = `${"Đ".repeat(79)}😀`;
    const payload = okPayload(initMessage({ user: { ...USER, name } })) as { user: { name: string } };
    expect(payload.user.name.length).toBeLessThanOrEqual(BRIDGE_LIMITS.maxNameChars);
    expect(payload.user.name).toBe("Đ".repeat(79));
    expect((okPayload(initMessage()) as { user: { name: string } }).user.name).toBe("Nguyễn Thị Hoài Thu");
  });

  it("tên rỗng → tên mặc định; url ws/wss hợp lệ; expiresAt ISO → epoch ms", () => {
    const exp = new Date(Date.now() + 60_000).toISOString();
    const p = okPayload(initMessage({ user: { ...USER, name: "   " }, url: "ws://10.0.2.2:4000/collab", expiresAt: exp })) as { user: { name: string }; expiresAt: number };
    expect(p.user.name).toBe("Người dùng");
    expect(p.expiresAt).toBe(Date.parse(exp));
  });

  it.each([
    ["url http", { url: "http://x/collab" }, "url-must-be-ws"],
    ["url không hợp lệ", { url: "not a url" }, "url-invalid"],
    ["url có thông tin đăng nhập", { url: "wss://a:b@x/collab" }, "url-must-be-ws"],
    ["token rỗng", { token: "" }, "token-invalid"],
    ["documentName sai dạng", { documentName: "doc:xyz" }, "documentName-invalid"],
    ["documentName của bảng trắng", { documentName: `wb:${"a".repeat(24)}` }, "documentName-invalid"],
    ["mode lạ", { mode: "admin" as never }, "mode-invalid"],
    ["màu sai", { user: { ...USER, color: "red" } }, "user-color-invalid"],
    ["id người dùng sai", { user: { ...USER, id: "" } }, "user-id-invalid"],
  ])("từ chối %s", (_n, overrides, reason) => {
    expect(parse(initMessage(overrides as never))).toMatchObject({ ok: false, reason });
  });

  it("phát hiện sớm user.id ≠ sub của token và token cho tài liệu khác (server sẽ đóng kết nối)", () => {
    expect(parse(initMessage({ token: fakeJwt({ sub: "64b7f0c2a1d3e4f5a6b7c8ff" }) }))).toMatchObject({ ok: false, reason: "user-id-mismatch" });
    expect(parse(initMessage({ token: fakeJwt({ docId: "64b7f0c2a1d3e4f5a6b7c800" }) }))).toMatchObject({ ok: false, reason: "document-mismatch" });
    expect(parse(initMessage({ token: fakeJwt({ kind: "whiteboard" }) }))).toMatchObject({ ok: false, reason: "kind-mismatch" });
    // Token không phải JWT đọc được: để server quyết định.
    expect(parse(initMessage({ token: "opaque-token" })).ok).toBe(true);
  });

  it("snapshot: chỉ nhận base64 hợp lệ, cho phép rỗng", () => {
    expect(okPayload(msg("init", { source: "snapshot", yjsState: "AAA=" }))).toMatchObject({ source: "snapshot" });
    expect(okPayload(msg("init", { source: "snapshot", yjsState: "" }))).toMatchObject({ source: "snapshot", yjsState: "" });
    expect(parse(msg("init", { source: "snapshot", yjsState: "không phải base64!" }))).toMatchObject({ ok: false, reason: "snapshot-invalid" });
    expect(parse(msg("init", { source: "lạ" }))).toMatchObject({ ok: false, reason: "source-invalid" });
  });

  it("stateMaxBytes hợp lệ được giữ, giá trị bậy bị bỏ", () => {
    expect(okPayload(initMessage({ stateMaxBytes: 5 * 1024 * 1024 }))).toMatchObject({ stateMaxBytes: 5 * 1024 * 1024 });
    expect(okPayload(initMessage({ stateMaxBytes: -1 }))).not.toHaveProperty("stateMaxBytes");
    expect(okPayload(initMessage({ stateMaxBytes: 1.5 }))).not.toHaveProperty("stateMaxBytes");
  });
});

describe("command", () => {
  it("lệnh đơn giản + requestId", () => {
    expect(okPayload(msg("command", { name: "bold", requestId: "r-1" }))).toEqual({ name: "bold", requestId: "r-1" });
    expect(okPayload(msg("command", { name: "undo" }))).toEqual({ name: "undo" });
  });

  it("heading chỉ 1–3", () => {
    expect(okPayload(msg("command", { name: "heading", attrs: { level: 2 } }))).toMatchObject({ attrs: { level: 2 } });
    for (const level of [0, 4, "1", 1.5, undefined]) {
      expect(parse(msg("command", { name: "heading", attrs: { level }, requestId: "r" }))).toMatchObject({ ok: false, reason: "invalid-attrs", requestId: "r", type: "command" });
    }
  });

  it("tên lệnh lạ trả kèm requestId để editor báo commandResult", () => {
    expect(parse(msg("command", { name: "formatDisk", requestId: "r-9" }))).toMatchObject({ ok: false, reason: "unknown-command", requestId: "r-9" });
    expect(parse(msg("command", { requestId: "r" }))).toMatchObject({ ok: false, reason: "unknown-command" });
  });

  it("link: chuẩn hoá, từ chối javascript:/data:, null/rỗng = gỡ liên kết", () => {
    expect(okPayload(msg("command", { name: "link", attrs: { href: "example.com/a" } }))).toMatchObject({ attrs: { href: "https://example.com/a" } });
    expect(okPayload(msg("command", { name: "link", attrs: { href: "hoai@thu.vn" } }))).toMatchObject({ attrs: { href: "mailto:hoai@thu.vn" } });
    expect(okPayload(msg("command", { name: "link", attrs: { href: null } }))).toMatchObject({ attrs: { href: null } });
    expect(okPayload(msg("command", { name: "link", attrs: { href: "" } }))).toMatchObject({ attrs: { href: null } });
    for (const href of ["javascript:alert(1)", "data:text/html,x", "  javascript:alert(1)", 5]) {
      expect(parse(msg("command", { name: "link", attrs: { href } }))).toMatchObject({ ok: false, reason: "invalid-attrs" });
    }
  });

  it("insertTable mặc định 3×3, chặn kích thước quá lớn", () => {
    expect(okPayload(msg("command", { name: "insertTable" }))).toMatchObject({ attrs: { rows: 3, cols: 3 } });
    expect(parse(msg("command", { name: "insertTable", attrs: { rows: 11, cols: 3 } }))).toMatchObject({ ok: false, reason: "invalid-attrs" });
    expect(parse(msg("command", { name: "insertTable", attrs: { rows: 0, cols: 3 } }))).toMatchObject({ ok: false, reason: "invalid-attrs" });
  });

  it("focus mặc định về cuối", () => {
    expect(okPayload(msg("command", { name: "focus" }))).toMatchObject({ attrs: { position: "end" } });
    expect(parse(msg("command", { name: "focus", attrs: { position: "middle" } }))).toMatchObject({ ok: false, reason: "invalid-attrs" });
  });

  it("requestId sai định dạng bị bỏ (không phản chiếu chuỗi tuỳ ý)", () => {
    expect(okPayload(msg("command", { name: "bold", requestId: "có dấu cách" }))).toEqual({ name: "bold" });
  });
});

describe("các tin khác", () => {
  it("setToken", () => {
    expect(okPayload(msg("setToken", { token: "t", expiresAt: 1_900_000_000_000 }))).toEqual({ token: "t", expiresAt: 1_900_000_000_000 });
    expect(parse(msg("setToken", { token: "" }))).toMatchObject({ ok: false, reason: "token-invalid" });
    expect(parse(msg("setToken", {}))).toMatchObject({ ok: false });
  });

  it("insertImage: assetId chặt, alt cắt ngắn", () => {
    expect(okPayload(msg("insertImage", { assetId: "64b7f0c2a1d3e4f5a6b7c8d9", alt: " ảnh " }))).toEqual({ assetId: "64b7f0c2a1d3e4f5a6b7c8d9", alt: "ảnh" });
    for (const assetId of ["", "ab", "../../etc/passwd", "a b c d e f g h", 7]) {
      expect(parse(msg("insertImage", { assetId }))).toMatchObject({ ok: false, reason: "assetId-invalid" });
    }
  });

  it("assetUrl: url http(s) hoặc error", () => {
    const id = "64b7f0c2a1d3e4f5a6b7c8d9";
    expect(okPayload(msg("assetUrl", { assetId: id, url: "https://cdn.example/x.png?sig=1" }))).toMatchObject({ url: "https://cdn.example/x.png?sig=1" });
    expect(okPayload(msg("assetUrl", { assetId: id, error: "not-found" }))).toEqual({ assetId: id, error: "not-found" });
    for (const url of ["javascript:alert(1)", "data:image/png;base64,AAAA", "file:///etc/passwd", "không phải url"]) {
      expect(parse(msg("assetUrl", { assetId: id, url }))).toMatchObject({ ok: false, reason: "url-invalid" });
    }
    expect(parse(msg("assetUrl", { assetId: id }))).toMatchObject({ ok: false });
    expect(parse(msg("assetUrl", { assetId: id, error: "boom" }))).toMatchObject({ ok: false, reason: "error-invalid" });
  });

  it("setMode/setTheme", () => {
    expect(okPayload(msg("setMode", { mode: "comment" }))).toEqual({ mode: "comment" });
    expect(parse(msg("setMode", { mode: "root" }))).toMatchObject({ ok: false });
    expect(okPayload(msg("setTheme", { theme: "dark" }))).toEqual({ theme: "dark" });
    expect(parse(msg("setTheme", { theme: "neon" }))).toMatchObject({ ok: false });
  });
});

describe("parseEditorMessage (phía app)", () => {
  const ok = (m: unknown) => parseEditorMessage(JSON.stringify(m)).ok;
  const status = { connection: "synced", unsynced: false, saveFailed: false, mode: "edit", readOnly: false, archived: false, tooLarge: false, nearLimit: false };

  it("nhận tin hợp lệ", () => {
    expect(ok(msg("status", status))).toBe(true);
    expect(ok(msg("awareness", { count: 1, users: [{ ...USER, self: true }] }))).toBe(true);
    expect(ok(msg("error", { code: "FORBIDDEN", fatal: true }))).toBe(true);
    expect(ok(msg("openLink", { url: "https://a.b" }))).toBe(true);
    expect(ok(msg("notice", { code: "RESTORED" }))).toBe(true);
    expect(ok(msg("requestToken", { reason: "expired", attempt: 1 }))).toBe(true);
  });

  it("từ chối tin sai kiểu/không an toàn", () => {
    expect(ok(msg("status", { ...status, connection: "unknown" }))).toBe(false);
    expect(ok(msg("status", { ...status, unsynced: "no" }))).toBe(false);
    expect(ok(msg("openLink", { url: "javascript:alert(1)" }))).toBe(false);
    expect(ok(msg("notice", { code: "BOOM" }))).toBe(false);
    expect(ok(msg("error", { code: "AUTH_EXPIRED" }))).toBe(false);
    expect(ok(msg("init", initPayload()))).toBe(false);
    expect(parseEditorMessage("{cắt cụt")).toMatchObject({ ok: false, reason: "malformed-json" });
  });
});

describe("tiện ích", () => {
  it("isSafeLinkUrl / normalizeLinkHref", () => {
    expect(isSafeLinkUrl("https://a.vn")).toBe(true);
    expect(isSafeLinkUrl("tel:+84901234567")).toBe(true);
    expect(isSafeLinkUrl("mailto:a@b.vn")).toBe(true);
    expect(isSafeLinkUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeLinkUrl("https://" + "a".repeat(BRIDGE_LIMITS.maxLinkChars))).toBe(false);
    expect(isSafeLinkUrl("")).toBe(false);
    expect(normalizeLinkHref("  ")).toBeNull();
    expect(normalizeLinkHref("vbscript:x")).toBeNull();
  });

  it("toEpochMs, decodeJwtClaims, clampText", () => {
    expect(toEpochMs("2030-01-01T00:00:00Z")).toBe(Date.parse("2030-01-01T00:00:00Z"));
    expect(toEpochMs("hôm qua")).toBeUndefined();
    expect(toEpochMs(-5)).toBeUndefined();
    expect(decodeJwtClaims(fakeJwt())?.["sub"]).toBe(USER_ID);
    expect(decodeJwtClaims("a.b")).toBeNull();
    expect(decodeJwtClaims("a.@@@.c")).toBeNull();
    expect(clampText("abc", 5)).toBe("abc");
    expect(clampText("ab😀", 3)).toBe("ab");
  });
});
