import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

/**
 * Nối dây p7-04 (test TĨNH — import `router.ts` kéo cả ứng dụng): router mount SAU `messagesRoutes`, đăng ký module ở API lẫn worker, job nạp ở `register-jobs.ts`, consumer ẩn danh hoá ghi ở
 * `UserAnonymizer`; mọi route gắn cờ phụ; module không import module khác ngoài barrel công khai (luật 3 tầng); service/controller không import Prisma; không alias `@core/...`.
 */
const SRC = join(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(join(SRC, file), "utf8");

describe("router.ts / register-jobs / worker-registries / user-anonymizer", () => {
  const router = read("router.ts");

  it("router.ts mount route + alias kênh/hội thoại SAU messagesRoutes và đăng ký module", () => {
    expect(router).toContain("v1.use(chatExtensionsRoutes);");
    expect(router).toContain('v1.use("/channels", createScopedExtensionRouter("CHANNEL"));');
    expect(router).toContain('v1.use("/conversations", createScopedExtensionRouter("CONVERSATION"));');
    expect(router).toContain("registerChatExtensionsModule();");
    expect(router.indexOf("v1.use(chatExtensionsRoutes);")).toBeGreaterThan(router.indexOf("v1.use(messagesRoutes);"));
  });

  it("register-jobs.ts nạp jobs/chat-extensions.jobs; worker-registries.ts boot registerChatExtensionsModule (worker riêng không import router.ts)", () => {
    expect(read("infrastructure/queue/register-jobs.ts")).toContain("modules/chat-extensions/jobs/chat-extensions.jobs");
    expect(read("infrastructure/worker-registries.ts")).toContain("registerChatExtensionsModule()");
  });

  it("job đăng ký đủ processor + cron tĩnh; UserAnonymizer ghi dòng outbox RIÊNG cho consumer `chat-extensions.on-user-anonymized`", () => {
    const jobs = read("modules/chat-extensions/jobs/chat-extensions.jobs.ts");
    for (const name of ["pollClose", "pollEmit", "pollMessageDeleted", "scheduledSend", "reminderFire", "onUserAnonymized", "sweep"]) expect(jobs).toContain(`CHAT_EXT_JOBS.${name}.queue, CHAT_EXT_JOBS.${name}.name`);
    expect(jobs).toContain('pattern: "*/5 * * * *"');
    expect(read("modules/users/services/user-anonymizer.ts")).toContain('jobName: "chat-extensions.on-user-anonymized"');
    // Tên job `poll.message-deleted` do `messages` ghi và `chat-extensions` xử lý dùng CHUNG một hằng ở shared/ports.
    expect(read("modules/messages/services/message.service.ts")).toContain("POLL_MESSAGE_DELETED_JOB");
    expect(read("modules/chat-extensions/services/chat-extensions-events.ts")).toContain("pollMessageDeleted: POLL_MESSAGE_DELETED_JOB");
  });
});

describe("routes: mọi endpoint gắn cờ phụ + đăng nhập + rate limit; endpoint theo be.md §4", () => {
  const routes = read("modules/chat-extensions/chat-extensions.routes.ts");
  const registrations = [...routes.matchAll(/\b(?:router|r)\.(get|post|put|patch|delete)\(\s*"([^"]+)"/g)].map((m) => `${(m[1] as string).toUpperCase()} ${m[2]}`);
  const flagged = [...routes.matchAll(/\b(?:router|r)\.(?:get|post|put|patch|delete)\(\s*"[^"]+",\s*\.\.\.(POLLS|SCHEDULED|REMINDERS|TO_TASK|TO_RESOURCE)\b/g)];

  it("đủ endpoint của kế hoạch và mỗi route đều đi qua nhóm middleware có cờ phụ", () => {
    expect(registrations.sort()).toEqual(
      [
        "POST /scopes/:scopeType/:scopeId/polls",
        "GET /polls/:pollId",
        "PUT /polls/:pollId/vote",
        "DELETE /polls/:pollId/vote",
        "POST /polls/:pollId/close",
        "GET /polls/:pollId/voters",
        "POST /scopes/:scopeType/:scopeId/scheduled-messages",
        "GET /me/scheduled-messages",
        "PATCH /scheduled-messages/:id",
        "DELETE /scheduled-messages/:id",
        "POST /scheduled-messages/:id/send-now",
        "POST /messages/:messageId/reminders",
        "GET /me/reminders",
        "DELETE /reminders/:id",
        "POST /messages/:messageId/to-task",
        "POST /messages/:messageId/to-resource",
        "POST /:id/polls",
        "POST /:id/scheduled-messages",
      ].sort()
    );
    expect(flagged).toHaveLength(registrations.length);
  });

  it("nhóm middleware = đăng nhập → phân hệ communication → cờ phụ → apiLimiter; to-task/to-resource bắt buộc Idempotency-Key", () => {
    expect(routes).toMatch(/const base = \(flag[^=]*=> \[authenticateToken, requireFeature\(MODULES\.COMMUNICATION\), requireSubFeature\(flag\), apiLimiter\]/);
    for (const flag of ["POLLS", "SCHEDULED_MESSAGES", "MESSAGE_REMINDERS", "MESSAGE_TO_TASK", "MESSAGE_TO_RESOURCE"]) expect(routes).toContain(`SUB_FEATURES.${flag}`);
    expect(routes.match(/idempotencyKey\("message-to-(?:task|resource)", \{ required: true \}\)/g)).toHaveLength(2);
  });
});

describe("luật 3 tầng của module chat-extensions", () => {
  const ROOT = join(SRC, "modules", "chat-extensions");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return name === "tests" ? [] : files(full);
      return name.endsWith(".ts") ? [full] : [];
    });
  const specifiers = (file: string): string[] =>
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .flatMap((line) => [...line.matchAll(/(?:from|import\()\s*"(\.[^"]*)"/g)].map((m) => m[1] ?? ""));

  it("chỉ import core/infrastructure/shared hoặc barrel công khai của module khác (messages/public, notifications/public, assets/public, projects)", () => {
    const allowedModuleTargets = new Set(["modules/messages/public", "modules/notifications/public", "modules/assets/public", "modules/projects"]);
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

  it("không đụng collection `Message` trực tiếp: chat-extensions KHÔNG dùng prisma.message / `tx.message` (chỉ qua IMessageSendPort)", () => {
    for (const file of files(ROOT)) {
      const src = readFileSync(file, "utf8");
      expect({ file: relative(SRC, file), direct: /\b(?:prisma|tx)\.message\b/.test(src) }).toEqual({ file: relative(SRC, file), direct: false });
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
