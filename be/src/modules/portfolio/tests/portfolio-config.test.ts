import { LIMITS } from "../../../core/constants/limits";
import { SYSTEM_CONFIG_REGISTRY } from "../../../core/config/system-config.registry";
import { systemConfigKeyParamSchema } from "../../system-config/dtos/update-system-config.dto";

/** Cấu hình p6-07: env (`PUBLIC_PORTFOLIO_BASE_URL`, `PORTFOLIO_STORAGE_PREFIX`), `validateRuntime`, khoá SystemConfig `portfolio`, giới hạn. */
describe("env portfolio", () => {
  const ORIGINAL_ENV = process.env;
  const load = () => (require("../../../core/config/env.schema") as typeof import("../../../core/config/env.schema")).env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("PORTFOLIO_STORAGE_PREFIX mặc định 'portfolio/'; nhận tiền tố nhiều tầng", () => {
    delete process.env.PORTFOLIO_STORAGE_PREFIX;
    expect(load().PORTFOLIO_STORAGE_PREFIX).toBe("portfolio/");
    jest.resetModules();
    process.env.PORTFOLIO_STORAGE_PREFIX = "staging/portfolio/";
    expect(load().PORTFOLIO_STORAGE_PREFIX).toBe("staging/portfolio/");
  });

  it.each(["/tuyet-doi/", "a/../b/", "co khoang trang/", "ky-tu-la-@/", ".."])("từ chối PORTFOLIO_STORAGE_PREFIX '%s' (chống thoát thư mục/khoá lạ)", (value) => {
    process.env.PORTFOLIO_STORAGE_PREFIX = value;
    expect(() => load()).toThrow("Invalid environment variables");
  });

  it("PUBLIC_PORTFOLIO_BASE_URL rỗng coi như chưa đặt; URL hợp lệ được giữ; rác bị từ chối", () => {
    process.env.PUBLIC_PORTFOLIO_BASE_URL = "";
    expect(load().PUBLIC_PORTFOLIO_BASE_URL).toBeUndefined();
    jest.resetModules();
    process.env.PUBLIC_PORTFOLIO_BASE_URL = "https://superapp.vcijsc.com/p";
    expect(load().PUBLIC_PORTFOLIO_BASE_URL).toBe("https://superapp.vcijsc.com/p");
    jest.resetModules();
    process.env.PUBLIC_PORTFOLIO_BASE_URL = "khong-phai-url";
    expect(() => load()).toThrow("Invalid environment variables");
  });

  it("portfolioBaseUrl bỏ dấu / cuối và rơi về <PUBLIC_API_URL>/p khi thiếu (dev); portfolioStoragePrefix luôn kết thúc bằng /", () => {
    process.env.PUBLIC_PORTFOLIO_BASE_URL = "https://superapp.vcijsc.com/p//";
    process.env.PORTFOLIO_STORAGE_PREFIX = "portfolio";
    const ports = require("../services/portfolio.ports") as typeof import("../services/portfolio.ports");
    expect(ports.portfolioBaseUrl()).toBe("https://superapp.vcijsc.com/p");
    expect(ports.portfolioStoragePrefix()).toBe("portfolio/");
    expect(ports.buildFolder("portfolio/", "abc", 3)).toBe("portfolio/abc/b3/");
    jest.resetModules();
    delete process.env.PUBLIC_PORTFOLIO_BASE_URL;
    process.env.PUBLIC_API_URL = "http://localhost:3000";
    const dev = require("../services/portfolio.ports") as typeof import("../services/portfolio.ports");
    expect(dev.portfolioBaseUrl()).toBe("http://localhost:3000/p");
  });
});

describe("validateRuntime — career cần PUBLIC_PORTFOLIO_BASE_URL", () => {
  const ORIGINAL_ENV = process.env;
  const check = () => (require("../../../core/config/validate-runtime") as typeof import("../../../core/config/validate-runtime")).validateRuntime();

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.PUBLIC_PORTFOLIO_BASE_URL;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("career bật + có URL → không có kiểm tra nào nhắc PUBLIC_PORTFOLIO_BASE_URL", () => {
    process.env.FEATURE_FLAGS = "career=true";
    process.env.PUBLIC_PORTFOLIO_BASE_URL = "https://superapp.vcijsc.com/p";
    expect(check().some((c) => c.message.includes("PUBLIC_PORTFOLIO_BASE_URL"))).toBe(false);
  });

  it("career bật + thiếu URL ở dev/test → CẢNH BÁO (rơi về <PUBLIC_API_URL>/p), không lỗi", () => {
    process.env.FEATURE_FLAGS = "career=true";
    const hit = check().filter((c) => c.message.includes("PUBLIC_PORTFOLIO_BASE_URL"));
    expect(hit).toEqual([expect.objectContaining({ level: "warn" })]);
  });

  it("career bật + thiếu URL ở production → LỖI (link công khai sai sẽ bị phát đi)", () => {
    process.env.FEATURE_FLAGS = "career=true";
    process.env.NODE_ENV = "production";
    process.env.ENCRYPTION_KEY = "a".repeat(64); // production bắt buộc khoá mã hoá (p6-04)
    const hit = check().filter((c) => c.message.includes("PUBLIC_PORTFOLIO_BASE_URL"));
    expect(hit).toEqual([expect.objectContaining({ level: "error" })]);
  });

  it("career TẮT → không kiểm URL", () => {
    process.env.FEATURE_FLAGS = "";
    process.env.NODE_ENV = "production";
    process.env.ENCRYPTION_KEY = "a".repeat(64);
    expect(check().some((c) => c.message.includes("PUBLIC_PORTFOLIO_BASE_URL"))).toBe(false);
  });
});

describe("SystemConfig khoá 'portfolio'", () => {
  const def = SYSTEM_CONFIG_REGISTRY["portfolio"]!;

  it("khoá đi qua validator route admin; ba field đúng kiểu và mặc định (bật, noindex, không từ cấm)", () => {
    expect(systemConfigKeyParamSchema.safeParse({ key: "portfolio" }).success).toBe(true);
    expect(def.tab).toBe("features");
    expect(def.affects).toEqual(["runtime"]);
    const fields = Object.fromEntries(def.fields.map((f) => [f.path, f]));
    expect(fields["enabled"]).toMatchObject({ kind: "bool", default: true });
    expect(fields["defaultNoindex"]).toMatchObject({ kind: "bool", default: true });
    expect(fields["bannedSlugTerms"]).toMatchObject({ kind: "json", default: [] });
  });

  it("schema: từ cấm ≤ 500 mục, mỗi từ 2–30 ký tự; trường lạ/sai kiểu bị từ chối", () => {
    expect(def.schema.safeParse({ bannedSlugTerms: ["lừa đảo", "vci"] }).success).toBe(true);
    expect(def.schema.safeParse({ bannedSlugTerms: Array.from({ length: LIMITS.portfolio.bannedTermsMax + 1 }, (_, i) => `tu${i}x`) }).success).toBe(false);
    expect(def.schema.safeParse({ bannedSlugTerms: ["a"] }).success).toBe(false);
    expect(def.schema.safeParse({ bannedSlugTerms: ["x".repeat(LIMITS.portfolio.bannedTermMax + 1)] }).success).toBe(false);
    expect(def.schema.safeParse({ enabled: "yes" }).success).toBe(false);
    expect(def.schema.safeParse({ enabled: false, defaultNoindex: false }).success).toBe(true);
  });
});

describe("LIMITS.portfolio (README §7)", () => {
  it("giữ đúng con số kế hoạch", () => {
    expect(LIMITS.portfolio).toMatchObject({
      projectsMax: 12,
      slugMin: 3,
      slugMax: 30,
      headlineMax: 120,
      bioMax: 600,
      linksMax: 6,
      highlightsMax: 3,
      highlightMax: 160,
      refreshPerHour: 10,
      publishPerHour: 20,
      htmlMaxBytes: 2 * 1024 * 1024,
      slugReserveDays: 30,
      buildTimeoutSec: 60,
      purgeDelayMinutes: 10,
    });
  });

  it("slugMin/slugMax khớp regex slug (3–30)", () => {
    const { SLUG_REGEX } = require("../entities/portfolio.rules") as typeof import("../entities/portfolio.rules");
    expect(SLUG_REGEX.test("a".repeat(LIMITS.portfolio.slugMin))).toBe(true);
    expect(SLUG_REGEX.test("a".repeat(LIMITS.portfolio.slugMin - 1))).toBe(false);
    expect(SLUG_REGEX.test("a".repeat(LIMITS.portfolio.slugMax))).toBe(true);
    expect(SLUG_REGEX.test("a".repeat(LIMITS.portfolio.slugMax + 1))).toBe(false);
  });
});
