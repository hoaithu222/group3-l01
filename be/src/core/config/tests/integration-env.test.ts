/**
 * p5-03 — bộ khoá env theo nhà cung cấp tích hợp, cảnh báo `validateRuntime` (KHÔNG chặn khởi động) và khoá registry `integrations`.
 */
import { SYSTEM_CONFIG_REGISTRY } from "../system-config.registry";
import {
  allIntegrationProviderEnvStatus,
  integrationProviderEnvStatus,
  isIntegrationProviderConfigured,
} from "../integration-env";

describe("integrationProviderEnvStatus (hàm thuần)", () => {
  it("GitHub cần đủ 6 khoá (App + client OAuth + webhook secret); thiếu → liệt kê TÊN khoá thiếu, không lộ giá trị", () => {
    const s = integrationProviderEnvStatus("GITHUB", { GITHUB_APP_ID: "123", GITHUB_APP_SLUG: "vci-app" });
    expect(s.configured).toBe(false);
    expect(s.missing).toEqual(["GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET", "GITHUB_WEBHOOK_SECRET"]);
    expect(JSON.stringify(s)).not.toContain("123");
  });

  it("chuỗi rỗng/khoảng trắng coi như thiếu", () => {
    expect(isIntegrationProviderConfigured("GOOGLE_CALENDAR", { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "  " })).toBe(false);
    expect(isIntegrationProviderConfigured("GOOGLE_CALENDAR", { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s" })).toBe(true);
  });

  it("đủ khoá → configured; all* trả đủ 4 provider", () => {
    const full = {
      GITHUB_APP_ID: "1",
      GITHUB_APP_PRIVATE_KEY: "pem",
      GITHUB_APP_SLUG: "x",
      GITHUB_APP_CLIENT_ID: "cid",
      GITHUB_APP_CLIENT_SECRET: "csec",
      GITHUB_WEBHOOK_SECRET: "s",
      GITLAB_CLIENT_ID: "a",
      GITLAB_CLIENT_SECRET: "b",
      FIGMA_CLIENT_ID: "c",
      FIGMA_CLIENT_SECRET: "d",
    };
    const all = allIntegrationProviderEnvStatus(full);
    expect(all.map((s) => s.provider).sort()).toEqual(["FIGMA", "GITHUB", "GITLAB", "GOOGLE_CALENDAR"]);
    expect(all.find((s) => s.provider === "GITHUB")?.configured).toBe(true);
    expect(all.find((s) => s.provider === "GOOGLE_CALENDAR")?.configured).toBe(false);
  });
});

describe("validateRuntime — integration (README §7)", () => {
  const ORIGINAL_ENV = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    for (const k of ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_SLUG", "GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET", "GITHUB_WEBHOOK_SECRET", "GITLAB_CLIENT_ID", "GITLAB_CLIENT_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "FIGMA_CLIENT_ID", "FIGMA_CLIENT_SECRET"]) delete process.env[k];
  });
  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("integration=true thiếu khoá → CẢNH BÁO từng provider (không lỗi, không lộ giá trị), không cảnh báo 'chưa có mã'", () => {
    process.env.FEATURE_FLAGS = "integration=true";
    const { validateRuntime } = require("../validate-runtime") as typeof import("../validate-runtime");
    const checks = validateRuntime();
    const warns = checks.filter((c) => c.level === "warn" && c.message.includes("integration=true"));
    expect(warns).toHaveLength(4);
    expect(warns.map((w) => w.message).join("\n")).toContain("GITHUB_APP_PRIVATE_KEY");
    expect(checks.some((c) => c.level === "error")).toBe(false);
    expect(checks.some((c) => c.message.includes("chưa có mã"))).toBe(false);
  });

  it("integration tắt → không cảnh báo khoá tích hợp", () => {
    process.env.FEATURE_FLAGS = "";
    const { validateRuntime } = require("../validate-runtime") as typeof import("../validate-runtime");
    expect(validateRuntime().some((c) => c.message.includes("integration=true"))).toBe(false);
  });

  it("đủ khoá GitHub → không còn cảnh báo GitHub", () => {
    process.env.FEATURE_FLAGS = "integration=true";
    Object.assign(process.env, { GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: "pem", GITHUB_APP_SLUG: "x", GITHUB_APP_CLIENT_ID: "cid", GITHUB_APP_CLIENT_SECRET: "csec", GITHUB_WEBHOOK_SECRET: "s" });
    const { validateRuntime } = require("../validate-runtime") as typeof import("../validate-runtime");
    const warns = validateRuntime().filter((c) => c.message.includes("integration=true"));
    expect(warns).toHaveLength(3);
    expect(warns.some((w) => w.message.includes("GitHub"))).toBe(false);
  });
});

describe("SYSTEM_CONFIG_REGISTRY.integrations (INT-09)", () => {
  const def = SYSTEM_CONFIG_REGISTRY.integrations!;

  it("4 cờ providers.<key>.enabled, mặc định BẬT, kiểu bool", () => {
    expect(def.fields.map((f) => f.path).sort()).toEqual([
      "providers.figma.enabled",
      "providers.github.enabled",
      "providers.gitlab.enabled",
      "providers.google-calendar.enabled",
    ]);
    for (const f of def.fields) expect(f).toMatchObject({ kind: "bool", default: true });
    expect(def.affects).toEqual(["runtime"]);
  });

  it("schema nhận tắt một provider; provider lạ/kiểu sai bị từ chối", () => {
    expect(def.schema.safeParse({ providers: { github: { enabled: false } } }).success).toBe(true);
    expect(def.schema.safeParse({ providers: { "google-calendar": { enabled: true } } }).success).toBe(true);
    expect(def.schema.safeParse({ providers: { slack: { enabled: true } } }).success).toBe(false);
    expect(def.schema.safeParse({ providers: { github: { enabled: "yes" } } }).success).toBe(false);
    expect(def.schema.safeParse({ khac: 1 }).success).toBe(false);
  });
});
