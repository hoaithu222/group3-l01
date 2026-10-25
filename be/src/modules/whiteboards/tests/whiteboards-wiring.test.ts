import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

/**
 * Nối dây p6-02 (test TĨNH — import `app.ts`/`router.ts` kéo cả ứng dụng): endpoint NỘI BỘ của collab mount ở `app.ts` TRƯỚC `globalLimiter` và body parser; router người dùng mount ở
 * `router.ts`; job nạp ở `register-jobs.ts`; registry boot ở `worker-registries.ts`; module không import module khác ngoài barrel công khai (luật 3 tầng).
 */
const SRC = join(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(join(SRC, file), "utf8");

describe("app.ts / router.ts", () => {
  const app = read("app.ts");
  const router = read("router.ts");

  it("mount /api/internal/whiteboards TRƯỚC globalLimiter và express.json()/sanitizeInput (body Yjs nhị phân, lưu lượng collab không ăn hạn mức IP)", () => {
    const mount = app.indexOf('app.use("/api/internal/whiteboards", internalWhiteboardsRoutes)');
    expect(mount).toBeGreaterThan(-1);
    expect(mount).toBeLessThan(app.indexOf("app.use(globalLimiter)"));
    expect(mount).toBeLessThan(app.indexOf("app.use(express.json("));
    expect(mount).toBeLessThan(app.indexOf("app.use(sanitizeInput)"));
    expect(mount).toBeGreaterThan(app.indexOf('app.use("/api/internal/documents", internalDocumentsRoutes)'));
  });

  it("router.ts mount router người dùng SAU workspacesRoutes + đăng ký module/hook, và KHÔNG mount route nội bộ ở đây", () => {
    expect(router).toContain("v1.use(whiteboardsRoutes);");
    expect(router).toContain("registerWhiteboardsModule();");
    expect(router).toContain("registerWhiteboardsApiHooks();");
    expect(router).not.toContain("internal-whiteboards");
    expect(router.indexOf("v1.use(whiteboardsRoutes);")).toBeGreaterThan(router.indexOf("v1.use(workspacesRoutes);"));
  });
});

describe("worker / job", () => {
  it("register-jobs.ts nạp jobs/whiteboard.jobs; worker-registries.ts boot registerWhiteboardsModule (worker riêng không import router.ts)", () => {
    expect(read("infrastructure/queue/register-jobs.ts")).toContain("modules/whiteboards/jobs/whiteboard.jobs");
    expect(read("infrastructure/worker-registries.ts")).toContain("registerWhiteboardsModule()");
  });

  it("whiteboard.jobs đăng ký runner `whiteboard` + job cron dùng chung; documents.jobs cũng đăng ký runner `document` (không còn cron document.snapshot-hourly riêng)", () => {
    const wb = read("modules/whiteboards/jobs/whiteboard.jobs.ts");
    expect(wb).toContain('registerCollabSnapshotRunner("whiteboard"');
    expect(wb).toContain("registerCollabSnapshotHourlyJob()");
    const doc = read("modules/documents/jobs/document.jobs.ts");
    expect(doc).toContain('registerCollabSnapshotRunner("document"');
    expect(doc).toContain("registerCollabSnapshotHourlyJob()");
    expect(doc).not.toContain("defineCron");
    expect(read("modules/documents/services/document-events.ts")).not.toContain("document.snapshot-hourly");
  });
});

describe("luật 3 tầng của module whiteboards", () => {
  const ROOT = join(SRC, "modules", "whiteboards");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return name === "tests" ? [] : files(full);
      return name.endsWith(".ts") ? [full] : [];
    });
  /** Mọi đường dẫn tương đối được import (tĩnh hoặc `import(...)`), bỏ dòng chú thích. */
  const specifiers = (file: string): string[] =>
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .flatMap((line) => [...line.matchAll(/(?:from|import\()\s*"(\.[^"]*)"/g)].map((m) => m[1] ?? ""));

  it("chỉ import core/infrastructure/shared hoặc barrel công khai của module khác (assets/public, audit-log service)", () => {
    const allowedModuleTargets = new Set(["modules/audit-log/audit-log.service", "modules/assets/public"]);
    for (const file of files(ROOT)) {
      for (const spec of specifiers(file)) {
        const target = resolve(dirname(file), spec);
        if (target === ROOT || target.startsWith(ROOT + sep)) continue;
        const rel = relative(SRC, target).split(sep).join("/");
        const ok = /^(core|infrastructure|shared)\//.test(rel) || allowedModuleTargets.has(rel);
        expect({ file: relative(SRC, file), spec, ok }).toEqual({ file: relative(SRC, file), spec, ok: true });
      }
    }
  });

  it("service/controller không import Prisma trực tiếp (chỉ repository/tx)", () => {
    for (const file of files(ROOT)) {
      const rel = relative(SRC, file).split(sep).join("/");
      if (!/\/(services|controllers)\//.test(rel)) continue;
      const src = readFileSync(file, "utf8");
      expect({ file: rel, prisma: /@prisma\/client|infrastructure\/database/.test(src) }).toEqual({ file: rel, prisma: false });
    }
  });

  it("không dùng alias @core/@infrastructure/@modules/@shared trong mã chạy thật (dist không nạp được)", () => {
    for (const file of files(ROOT)) {
      const offenders = readFileSync(file, "utf8")
        .split(/\r?\n/)
        .filter((line) => /^\s*(?:import|export)\b[^;]*\bfrom\s+["']@(?:core|infrastructure|modules|shared)\//.test(line));
      expect({ file: relative(SRC, file), offenders }).toEqual({ file: relative(SRC, file), offenders: [] });
    }
  });
});
