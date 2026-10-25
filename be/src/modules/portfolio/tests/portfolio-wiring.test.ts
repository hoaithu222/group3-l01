import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Nối dây p6-07 (test TĨNH — import `app.ts`/`router.ts` kéo cả ứng dụng): trang công khai mount ở `app.ts` NGOÀI `/api`, TRƯỚC body parser và sau `globalLimiter`; router người dùng/quản trị
 * mount ở `router.ts`; job nạp ở `register-jobs.ts`; `UserAnonymizer` ghi dòng outbox riêng cho consumer portfolio.
 */
const SRC = join(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(join(SRC, file), "utf8");

describe("app.ts / router.ts", () => {
  const app = read("app.ts");
  const router = read("router.ts");

  it("mount /p sau globalLimiter và TRƯỚC express.json()/sanitizeInput, NGOÀI /api", () => {
    const mount = app.indexOf('app.use("/p", publicPortfolioRoutes)');
    expect(mount).toBeGreaterThan(-1);
    expect(mount).toBeGreaterThan(app.indexOf("app.use(globalLimiter)"));
    expect(mount).toBeLessThan(app.indexOf("app.use(express.json("));
    expect(mount).toBeLessThan(app.indexOf("app.use(sanitizeInput)"));
    expect(mount).toBeLessThan(app.indexOf('app.use("/api", routes)'));
  });

  it("router.ts mount router người dùng + quản trị và KHÔNG mount trang công khai", () => {
    expect(router).toContain("v1.use(portfolioRoutes);");
    expect(router).toContain("v1.use(adminPortfolioRoutes);");
    expect(router).not.toContain("public-portfolio");
  });
});

describe("worker / anonymizer", () => {
  it("register-jobs.ts nạp jobs/portfolio.jobs", () => {
    expect(read("infrastructure/queue/register-jobs.ts")).toContain("modules/portfolio/jobs/portfolio.jobs");
  });

  it("UserAnonymizer có consumer notifications/portfolio.on-user-anonymized (trùng jobName job đăng ký)", () => {
    const anonymizer = read("modules/users/services/user-anonymizer.ts");
    expect(anonymizer).toContain('{ queue: "notifications", jobName: "portfolio.on-user-anonymized" }');
    expect(read("modules/portfolio/jobs/portfolio.jobs.ts")).toContain('const USER_ANONYMIZED_JOB = "portfolio.on-user-anonymized"');
  });

  it("module portfolio KHÔNG import module khác ngoài các barrel công khai (luật 3 tầng)", () => {
    const allowed = /(career\/public|contribution\/public|moderation\/public|notifications\/public|assets\/public|audit-log\/audit-log\.service|system-config\/dtos)/;
    const files = ["portfolio.container.ts", "index.ts", "public.ts", "services/portfolio.ports.ts", "jobs/portfolio.jobs.ts", "repositories/tx.ts", "notifications/portfolio.notification-types.ts"];
    for (const file of files) {
      const imports = read(`modules/portfolio/${file}`).match(/from "\.\.\/\.\.\/[^"]+"/g) ?? [];
      for (const imp of imports) {
        if (/\.\.\/\.\.\/(core|infrastructure|shared)\//.test(imp) || /^from "\.\.\/\.\.\/\.\.\/(core|infrastructure|shared)\//.test(imp)) continue;
        expect({ file, imp, ok: allowed.test(imp) }).toEqual({ file, imp, ok: true });
      }
    }
  });
});
