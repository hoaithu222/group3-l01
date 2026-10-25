import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config";
import { KIND_SPECS, buildDocumentName, parseDocumentName } from "../src/resource-kinds";
import { TEST_SECRET } from "./fixtures/secrets";

const base = { BE_INTERNAL_URL: "http://api:3000/", COLLAB_SHARED_SECRET: TEST_SECRET };

describe("loadConfig", () => {
  it("mặc định khớp README (cổng 4000, debounce 2 s/60 s, 50 kết nối/tài liệu) và bỏ dấu / cuối URL BE", () => {
    const c = loadConfig(base);
    expect(c).toMatchObject({
      port: 4000,
      beInternalUrl: "http://api:3000",
      storeDebounceMs: 2000,
      storeMaxDebounceMs: 60_000,
      maxConnectionsPerDoc: 50,
      accessCacheTtlMs: 30_000,
      accessRecheckMs: 30_000,
      trustProxy: false,
      redisUrl: undefined,
    });
    expect([...c.kinds]).toEqual(["document"]);
    expect(c.redisKeyPrefix).toBe("superapp:collab:");
  });

  it("chuỗi rỗng trong .env coi như chưa đặt; số/bool được ép kiểu", () => {
    const c = loadConfig({ ...base, REDIS_URL: "", PORT: "", TRUST_PROXY: "true", MAX_CONNECTIONS_PER_DOC: "7", COLLAB_KINDS: "document, whiteboard" });
    expect(c.redisUrl).toBeUndefined();
    expect(c.port).toBe(4000);
    expect(c.trustProxy).toBe(true);
    expect(c.maxConnectionsPerDoc).toBe(7);
    expect([...c.kinds].sort()).toEqual(["document", "whiteboard"]);
  });

  it("thiếu/ngắn bí mật hoặc thiếu URL BE → lỗi nêu tên khoá, KHÔNG in giá trị bí mật", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    try {
      loadConfig({ BE_INTERNAL_URL: "http://api", COLLAB_SHARED_SECRET: "ngan-qua-bi-mat-xyz" });
      throw new Error("phải ném lỗi");
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as Error).message).toContain("COLLAB_SHARED_SECRET");
      expect((err as Error).message).not.toContain("ngan-qua-bi-mat-xyz");
    }
    expect(() => loadConfig({ ...base, COLLAB_KINDS: "spreadsheet" })).toThrow(/loại lạ/);
    expect(() => loadConfig({ ...base, COLLAB_KINDS: " , " })).toThrow(/ít nhất một loại/);
  });

  it("WB_AWARENESS_MAX_HZ: mặc định 60 (kế hoạch p6-02), rỗng = chưa đặt, đặt được; sai → lỗi nêu TÊN khoá", () => {
    expect(loadConfig(base).wbAwarenessMaxHz).toBe(60);
    expect(loadConfig({ ...base, WB_AWARENESS_MAX_HZ: "" }).wbAwarenessMaxHz).toBe(60);
    expect(loadConfig({ ...base, WB_AWARENESS_MAX_HZ: "30" }).wbAwarenessMaxHz).toBe(30);
    for (const bad of ["0", "-5", "1.5", "nhanh"]) expect(() => loadConfig({ ...base, WB_AWARENESS_MAX_HZ: bad })).toThrow(/WB_AWARENESS_MAX_HZ/);
  });

  it("debounce tối đa không bao giờ nhỏ hơn debounce", () => {
    const c = loadConfig({ ...base, STORE_DEBOUNCE_MS: "5000", STORE_MAX_DEBOUNCE_MS: "1000" });
    expect(c.storeMaxDebounceMs).toBe(5000);
  });
});

describe("tên document", () => {
  const id = "0123456789abcdef01234567";
  it("doc:/wb: ↔ loại + id; sai dạng → null", () => {
    expect(parseDocumentName(`doc:${id}`)).toMatchObject({ kind: "document", id });
    expect(parseDocumentName(`wb:${id.toUpperCase()}`)).toMatchObject({ kind: "whiteboard", id });
    for (const bad of ["", "doc", "doc:", "doc:123", `xx:${id}`, `doc:${id}z`, `${id}`, `doc:${id}:more`]) expect(parseDocumentName(bad)).toBeNull();
    expect(buildDocumentName("document", id.toUpperCase())).toBe(`doc:${id}`);
    expect(buildDocumentName("whiteboard", id)).toBe(`wb:${id}`);
  });

  it("mỗi loại có trần state và khoá awareness riêng (bảng trắng dùng lại được service)", () => {
    expect(KIND_SPECS.document.awarenessKeys).toContain("cursor");
    expect(KIND_SPECS.whiteboard.awarenessKeys).toContain("pointer");
    expect(KIND_SPECS.whiteboard.stateMaxBytes).toBeGreaterThan(KIND_SPECS.document.stateMaxBytes);
  });
});
