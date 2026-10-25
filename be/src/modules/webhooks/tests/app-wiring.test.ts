import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Bẫy đã biết (app.ts): chữ ký webhook tính trên byte gốc — route webhook PHẢI được mount TRƯỚC `express.json()` và
 * `sanitizeInput`, và KHÔNG được mount lại trong `router.ts` (sau body parser thì mọi chữ ký đều sai). Test tĩnh vì
 * import `app.ts` kéo cả ứng dụng (Redis, rate limiter...).
 */
const SRC = join(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(join(SRC, file), "utf8");

describe("nối dây webhook (p0-08)", () => {
  const app = read("app.ts");

  it("app.ts mount /api/v1/webhooks TRƯỚC express.json() và sanitizeInput", () => {
    const mount = app.indexOf('app.use("/api/v1/webhooks"');
    expect(mount).toBeGreaterThan(-1);
    expect(mount).toBeLessThan(app.indexOf("app.use(express.json("));
    expect(mount).toBeLessThan(app.indexOf("app.use(sanitizeInput)"));
  });

  it("router.ts không mount route webhook (đã ở app.ts, trước body parser)", () => {
    expect(read("router.ts")).not.toMatch(/webhooks\.routes|["']\/webhooks["']/);
  });

  it("register-jobs.ts nạp job livekit.event + cron sweep/prune + rooms-snapshot", () => {
    const jobs = read("infrastructure/queue/register-jobs.ts");
    for (const file of ["webhooks/jobs/livekit-event.job", "webhooks/jobs/webhook-maintenance.jobs", "media-admin/media-rooms-snapshot.job"]) {
      expect(jobs).toContain(`modules/${file}`);
    }
  });
});
