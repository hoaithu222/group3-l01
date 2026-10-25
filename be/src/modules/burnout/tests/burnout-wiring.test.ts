import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { TASK_EVENTS } from "../../projects/events/project-events";
import { BurnoutHarness, userId } from "./support/burnout-harness";
import { TASK_ACTIVITY_EVENTS, recordTaskActivity } from "../services/burnout-task-sink";

/**
 * Nối dây p7-03 (test TĨNH — import `router.ts` kéo cả ứng dụng): router mount + đăng ký, job nạp ở `register-jobs.ts`, worker chỉ đăng ký loại thông báo (listener presence CHỈ ở API), consumer ẩn danh hoá ghi ở `UserAnonymizer`;
 * mọi route gắn cờ (trừ hai đường rút lại/xoá có chủ đích); domain thuần; luật 3 tầng; log không lộ số liệu.
 */
const SRC = join(__dirname, "..", "..", "..");
const MODULE = join(SRC, "modules", "burnout");
const read = (file: string): string => readFileSync(join(SRC, file), "utf8");
const COMMENT_LINE = /^\s*(\/\/|\*|\/\*)/;
const code = (file: string): string =>
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => !COMMENT_LINE.test(line))
    .join("\n");

const files = (dir: string, skipTests = true): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return skipTests && name === "tests" ? [] : files(full, skipTests);
    return name.endsWith(".ts") ? [full] : [];
  });
const specifiers = (file: string): string[] => code(file).split(/\r?\n/).flatMap((line) => [...line.matchAll(/(?:from|import\()\s*"(\.[^"]*)"/g)].map((m) => m[1] ?? ""));

describe("router.ts / register-jobs / worker-registries / user-anonymizer", () => {
  const router = read("router.ts");

  it("router.ts mount route người dùng + admin và đăng ký module (loại thông báo + listener presence)", () => {
    for (const line of ["v1.use(burnoutRoutes);", "v1.use(adminBurnoutRoutes);", "registerBurnoutModule();", "registerBurnoutPresenceCollector();"]) expect(router).toContain(line);
  });

  it("register-jobs.ts nạp jobs/burnout.jobs; worker-registries.ts CHỈ đăng ký loại thông báo (worker không nhận presence:heartbeat)", () => {
    expect(read("infrastructure/queue/register-jobs.ts")).toContain("modules/burnout/jobs/burnout.jobs");
    // Chỉ xét MÃ (chú thích ở file có nhắc tên hàm để giải thích vì sao KHÔNG đăng ký ở worker).
    const workerRegistries = code(join(SRC, "infrastructure", "worker-registries.ts"));
    expect(workerRegistries).toContain("registerBurnoutModule()");
    expect(workerRegistries).not.toContain("registerBurnoutPresenceCollector");
  });

  it("job đăng ký đủ processor + cron tĩnh + sink task.events; UserAnonymizer ghi dòng outbox RIÊNG cho `wellbeing.user-anonymized`", () => {
    const jobs = readFileSync(join(MODULE, "jobs", "burnout.jobs.ts"), "utf8");
    for (const name of ["evaluate", "retention", "purge", "onUserAnonymized"]) expect(jobs).toContain(`BURNOUT_JOBS.${name}.queue, BURNOUT_JOBS.${name}.name`);
    expect(jobs).toContain('registerTaskEventSink("p7-03.burnout"');
    expect(jobs).toContain('pattern: "20 * * * *"');
    expect(jobs).toContain('pattern: "0 3 * * *"');
    const events = readFileSync(join(MODULE, "services", "burnout-events.ts"), "utf8");
    expect(events).toContain('onUserAnonymized: { queue: "gamification", name: "wellbeing.user-anonymized" }');
    expect(events).toContain('purge: { queue: "gamification", name: "wellbeing.purge" }');
    const anonymizer = read("modules/users/services/user-anonymizer.ts");
    expect(anonymizer).toContain('{ queue: "gamification", jobName: "wellbeing.user-anonymized" }');
  });

  it("log của job/collector không kèm số liệu sức khoẻ hay định danh", () => {
    for (const file of files(MODULE)) {
      for (const line of code(file).split(/\r?\n/)) {
        const at = line.search(/\b(?:log|logger)\.(?:info|warn|error|debug)\(/);
        if (at < 0) continue;
        // Chỉ xét phần lời gọi log (một dòng có thể chứa cả mã khác dùng `userId` trước đó).
        expect({ file: relative(SRC, file), line, leaks: /riskScore|factors|activeMinutes|longestContinuous|lateNight|eventsCount|userId|setting\./.test(line.slice(at)) }).toMatchObject({ leaks: false });
      }
    }
  });
});

describe("routes: cờ + đăng nhập + rate limit", () => {
  const routes = readFileSync(join(MODULE, "burnout.routes.ts"), "utf8");
  const registrations = [...routes.matchAll(/\brouter\.(get|post|put|patch|delete)\(\s*"([^"]+)",([^\n]*)/g)].map((m) => ({ route: `${m[1].toUpperCase()} ${m[2]}`, rest: m[3] }));
  const byRoute = (route: string): string => registrations.find((r) => r.route === route)?.rest ?? "";

  it("mọi route có đăng nhập; route cần cờ đi qua `guard` (auth → cờ burnout → apiLimiter)", () => {
    expect(routes).toContain("const guard = [authenticateToken, featureGate, apiLimiter];");
    expect(routes).toContain("const featureGate = requireFeature(MODULES.BURNOUT);");
    for (const route of ["GET /me/wellbeing", "GET /me/wellbeing/assessments", "POST /me/wellbeing/alerts/:id/ack"]) expect(byRoute(route)).toContain("...guard");
    for (const { route, rest } of registrations) expect({ route, authed: rest.includes("...guard") || rest.includes("...alwaysAllowedGuard") || rest.includes("authenticateToken") }).toMatchObject({ authed: true });
  });

  it("hai đường được phép khi phân hệ TẮT (quyền tắt/xoá dữ liệu): PUT chỉ khi optIn=false, DELETE data luôn; bật vẫn cần cờ", () => {
    expect(byRoute("PUT /me/wellbeing")).toContain("featureUnlessOptOut");
    expect(byRoute("PUT /me/wellbeing")).toContain("validateBody(updateSettingSchema)");
    expect(byRoute("DELETE /me/wellbeing/data")).toContain("...alwaysAllowedGuard");
    expect(routes).toContain("optIn === false");
  });

  it("mọi route ghi/đọc có rate limit theo người dùng (`apiLimiter` + scopeLimiter cho thao tác ghi)", () => {
    expect(byRoute("PUT /me/wellbeing")).toContain("apiLimiter");
    expect(byRoute("PUT /me/wellbeing")).toContain('perHour("wellbeing-setting"');
    expect(byRoute("POST /me/wellbeing/alerts/:id/ack")).toContain('perMinute("wellbeing-ack"');
    expect(byRoute("DELETE /me/wellbeing/data")).toContain('perHour("wellbeing-delete"');
    expect(routes).toContain("const alwaysAllowedGuard = [authenticateToken, apiLimiter];");
  });

  it("validate TRƯỚC limiter ở route ghi (request sai không tiêu hạn mức)", () => {
    const put = byRoute("PUT /me/wellbeing");
    expect(put.indexOf("validateBody")).toBeGreaterThan(-1);
    expect(put.indexOf("validateBody")).toBeLessThan(put.indexOf("perHour"));
    const ack = byRoute("POST /me/wellbeing/alerts/:id/ack");
    expect(ack.indexOf("validateBody")).toBeLessThan(ack.indexOf("perMinute"));
  });
});

describe("domain THUẦN (không I/O)", () => {
  it("domain/*.ts chỉ import core/ thuần hoặc file cùng thư mục; không async/await/Promise/Date.now/Math.random/console", () => {
    for (const file of files(join(MODULE, "domain"))) {
      for (const spec of specifiers(file)) {
        const target = resolve(dirname(file), spec);
        const rel = relative(SRC, target).split(sep).join("/");
        expect({ file: relative(SRC, file), spec, ok: /^core\/(constants|utils)\//.test(rel) || target.startsWith(join(MODULE, "domain")) }).toMatchObject({ ok: true });
      }
      const src = code(file);
      expect({ file: relative(SRC, file), impure: /\b(async|await|Promise|setTimeout|Date\.now|Math\.random|console\.)\b|new Date\(\)/.test(src) }).toEqual({ file: relative(SRC, file), impure: false });
      expect(src).not.toMatch(/@prisma\/client|infrastructure\/|express|redis/);
    }
  });
});

describe("luật 3 tầng của module burnout", () => {
  it("chỉ import core/infrastructure/shared hoặc barrel công khai của module khác", () => {
    const allowed = new Set(["modules/audit-log/audit-log.service", "modules/notifications/public", "modules/system-config/public", "modules/presence/presence.service", "modules/projects"]);
    for (const file of files(MODULE)) {
      for (const spec of specifiers(file)) {
        const target = resolve(dirname(file), spec);
        if (target === MODULE || target.startsWith(MODULE + sep)) continue;
        const rel = relative(SRC, target).split(sep).join("/");
        expect({ file: relative(SRC, file), spec, ok: /^(core|infrastructure|shared)\//.test(rel) || allowed.has(rel) }).toMatchObject({ ok: true });
      }
    }
  });

  it("service/controller không import Prisma trực tiếp (chỉ repository/tx)", () => {
    for (const file of files(MODULE)) {
      const rel = relative(SRC, file).split(sep).join("/");
      if (!/\/(services|controllers)\//.test(rel)) continue;
      expect({ file: rel, prisma: /@prisma\/client|infrastructure\/database/.test(code(file)) }).toEqual({ file: rel, prisma: false });
    }
  });

  it("không dùng alias @core/@infrastructure/@modules/@shared và không console.*", () => {
    for (const file of files(MODULE)) {
      const src = code(file);
      expect({ file: relative(SRC, file), alias: /(?:import|export)\b[^;]*\bfrom\s+["']@(?:core|infrastructure|modules|shared)\//.test(src), console: /\bconsole\./.test(src) }).toEqual({ file: relative(SRC, file), alias: false, console: false });
    }
  });
});

describe("sink task.events", () => {
  it("chỉ nhận tên sự kiện có thật trong `TASK_EVENTS` của projects (đối chiếu hợp đồng)", () => {
    const known = new Set<string>(Object.values(TASK_EVENTS));
    for (const event of TASK_ACTIVITY_EVENTS) expect({ event, known: known.has(event) }).toEqual({ event, known: true });
    // Không tính dời lịch tự động / xoá / khôi phục / sửa bình luận.
    for (const event of [TASK_EVENTS.RESCHEDULED, TASK_EVENTS.RESCHEDULE_BULK_COMPLETED, TASK_EVENTS.DELETED, TASK_EVENTS.RESTORED, TASK_EVENTS.COMMENT_UPDATED]) expect(TASK_ACTIVITY_EVENTS.has(event)).toBe(false);
  });

  it("người ĐÃ bật: +1 sự kiện cho `actorId`; người chưa bật: không ghi gì; actorId null (hệ thống) và sự kiện không thuộc danh sách: bỏ qua; cùng jobId chỉ đếm một lần", async () => {
    const h = new BurnoutHarness();
    const on = userId(1);
    const off = userId(2);
    await h.optIn(on);
    h.addUser(off);
    const sink = (actorId: string | null, event: string = TASK_EVENTS.COMPLETED, jobId = "job-1") => recordTaskActivity(h.collector, { event, actorId }, jobId);
    await sink(off);
    await sink(null);
    await sink(on, TASK_EVENTS.RESCHEDULED);
    expect(h.store.hashes.size).toBe(0);
    await sink(on);
    await sink(on); // giao lại cùng jobId
    await sink(on, TASK_EVENTS.CREATED, "job-2");
    const [hash] = [...h.store.hashes.values()];
    expect(Object.values(hash ?? {}).map(Number).reduce((a, b) => a + b, 0)).toBe(2);
    expect(h.store.hashes.size).toBe(1);
    expect(JSON.stringify([...h.store.hashes.entries()])).not.toMatch(/completed|created|task/i);
  });
});
