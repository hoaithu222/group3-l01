import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

/**
 * Nối dây p7-02 (test TĨNH — import `router.ts` kéo cả ứng dụng): router mount ở `router.ts`; job nạp ở `register-jobs.ts` SAU gamification (ghi đè processor rỗng `xp.awarded`); mọi route gắn cờ + giới hạn tốc độ +
 * quyền đúng kế hoạch; số dư CHỈ đổi qua sổ cái; sổ cái append-only; module không import module khác ngoài cổng công khai; không có đường nạp/rút/quy đổi tiền thật.
 */
const SRC = join(__dirname, "..", "..", "..");
const ROOT = join(SRC, "modules", "coins");
const read = (file: string) => readFileSync(join(SRC, file), "utf8");

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "tests" ? [] : sourceFiles(full);
    return name.endsWith(".ts") ? [full] : [];
  });
const files = sourceFiles(ROOT);
const rel = (file: string) => relative(ROOT, file).split(sep).join("/");
const codeLines = (file: string) => readFileSync(file, "utf8").split(/\r?\n/).filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l));

describe("router.ts / register-jobs.ts", () => {
  const router = read("router.ts");
  const jobs = read("infrastructure/queue/register-jobs.ts");

  it("router.ts mount router người dùng + admin ở root v1, TRƯỚC `/admin/users`", () => {
    expect(router).toContain('import coinsRoutes from "./modules/coins/coins.routes";');
    expect(router).toContain('import adminEconomyRoutes from "./modules/coins/admin-economy.routes";');
    const user = router.indexOf("v1.use(coinsRoutes);");
    const admin = router.indexOf("v1.use(adminEconomyRoutes);");
    expect(user).toBeGreaterThan(-1);
    expect(admin).toBeGreaterThan(user);
    expect(admin).toBeLessThan(router.indexOf('v1.use("/admin/users", userRoutes);'));
  });

  it("register-jobs.ts nạp coins.jobs SAU gamification.jobs (registerJob là Map.set: file sau ghi đè processor rỗng `xp.awarded` của gamification)", () => {
    const gam = jobs.indexOf('import("../../modules/gamification/jobs/gamification.jobs")');
    const coins = jobs.indexOf('import("../../modules/coins/jobs/coins.jobs")');
    expect(gam).toBeGreaterThan(-1);
    expect(coins).toBeGreaterThan(gam);
  });

  it("coins.jobs đăng ký consumer `gamification/xp.awarded` và cron TĨNH `economy.reconcile` (02:30, chỉ 1 lần thử)", () => {
    const src = readFileSync(join(ROOT, "jobs", "coins.jobs.ts"), "utf8");
    expect(src).toContain('registerJob("gamification", "xp.awarded"');
    expect(src).toContain('registerJob("cron", "economy.reconcile"');
    expect(src).toMatch(/defineCron\(\{ schedulerId: "economy\.reconcile", queue: "cron", jobName: "economy\.reconcile", pattern: "30 2 \* \* \*"/);
  });

  it("module không đăng ký registry nào chỉ-API cần cho worker (không cần sửa worker-registries.ts)", () => {
    const registries = ["registerNotificationType", "registerScopeResolver", "registerAssetScopeGate", "registerAssetTargetReadResolver", "registerReportTargetExtension"];
    for (const file of files) for (const name of registries) expect(readFileSync(file, "utf8")).not.toContain(name);
  });
});

describe("route người dùng (coins.routes.ts)", () => {
  const src = readFileSync(join(ROOT, "coins.routes.ts"), "utf8");
  const routes = [...src.matchAll(/^router\.(get|post|put|patch|delete)\("([^"]+)",(.*)$/gm)].map((m) => ({ method: m[1] ?? "", path: m[2] ?? "", rest: m[3] ?? "" }));

  it("mọi route đi qua guard (đăng nhập + cờ `coins` + apiLimiter); guard khai đúng", () => {
    expect(routes.length).toBe(9);
    for (const r of routes) expect(r.rest).toContain("...guard");
    expect(src).toContain("const guard = [authenticateToken, requireFeature(MODULES.COINS), apiLimiter];");
  });

  it("người dùng chỉ thao tác trên CHÍNH mình: không route nào có :userId, không PUT/PATCH/DELETE, không endpoint chuyển/tặng/nạp/rút", () => {
    for (const r of routes) {
      expect(r.path).not.toContain(":userId");
      expect(["get", "post"]).toContain(r.method);
      expect(r.path).not.toMatch(/topup|deposit|withdraw|cashout|payout|convert|transfer|gift|send/i);
    }
  });

  it("route ghi có giới hạn tốc độ theo người dùng; mua BẮT BUỘC Idempotency-Key", () => {
    const by = (path: string) => routes.find((r) => r.path === path)?.rest ?? "";
    expect(by("/shop/items/:id/buy")).toContain('idempotencyKey("shop-buy", { required: true })');
    expect(by("/shop/items/:id/buy")).toContain('perMinute("coins-buy", LIMITS.coins.buyPerMinute)');
    expect(by("/me/quests/:id/claim")).toContain('idempotencyKey("quest-claim")');
    expect(by("/me/quests/:id/claim")).toContain('perMinute("coins-claim", LIMITS.coins.claimPerMinute)');
    expect(by("/me/inventory/:id/equip")).toContain('perMinute("coins-equip", LIMITS.coins.equipPerMinute)');
    expect(by("/me/inventory/:id/unequip")).toContain('perMinute("coins-equip", LIMITS.coins.equipPerMinute)');
    expect(src).toContain("scopeLimiter(name, byUser,");
    // Idempotency đặt TRƯỚC limiter (limiter 429 không đầu độc khoá 24 giờ — xem reuse-first `idempotencyKey`).
    for (const path of ["/shop/items/:id/buy", "/me/quests/:id/claim"]) expect(by(path).indexOf("idempotencyKey")).toBeLessThan(by(path).indexOf("perMinute"));
  });

  it("mọi route có :id validate param; danh sách validate query", () => {
    for (const r of routes) if (r.path.includes(":id")) expect(r.rest).toContain("validateParams(coinIdParamSchema)");
    expect(routes.find((r) => r.path === "/me/wallet/transactions")?.rest).toContain("validateQuery(txQuerySchema)");
  });
});

describe("route admin (admin-economy.routes.ts)", () => {
  const src = readFileSync(join(ROOT, "admin-economy.routes.ts"), "utf8");
  const start = src.indexOf("router.");
  const body = src.slice(start);
  const routes = [...body.matchAll(/router\.(get|post|put|patch|delete)\(\s*"([^"]+)",([\s\S]*?)\);/g)].map((m) => ({ method: m[1] ?? "", path: m[2] ?? "", rest: m[3] ?? "" }));

  it("mọi route qua guard + quyền: GET cần gamification:view, ghi cần gamification:update", () => {
    expect(routes.length).toBe(12);
    expect(src).toContain('requirePermission("gamification:view")');
    expect(src).toContain('requirePermission("gamification:update")');
    for (const r of routes) {
      expect(r.rest).toContain("...guard");
      expect(r.rest).toContain(r.method === "get" ? "view," : "update,");
    }
  });

  it("điều chỉnh xu: Idempotency-Key BẮT BUỘC trước limiter 60 lần/giờ/admin, rồi validate body", () => {
    const adjust = routes.find((r) => r.path === "/admin/economy/users/:userId/adjust")?.rest ?? "";
    expect(adjust).toContain('idempotencyKey("coins-adjust", { required: true })');
    expect(adjust).toContain("LIMITS.coins.adminAdjustPerHour");
    expect(adjust.indexOf("idempotencyKey")).toBeLessThan(adjust.indexOf("scopeLimiter"));
    expect(adjust.indexOf("scopeLimiter")).toBeLessThan(adjust.indexOf("validateBody(adjustSchema)"));
  });

  it("mọi route ghi validate body; không có DELETE (không xoá vật phẩm/luật/nhiệm vụ — tắt bằng isActive)", () => {
    for (const r of routes.filter((x) => x.method !== "get")) expect(r.rest).toContain("validateBody(");
    expect(routes.filter((r) => r.method === "delete")).toHaveLength(0);
  });
});

describe("an toàn sổ cái", () => {
  const nonTest = files.map((f) => ({ file: f, name: rel(f), text: readFileSync(f, "utf8") }));

  it("sổ cái APPEND-ONLY: interface không có update/delete; Prisma repository không gọi update/delete/upsert trên coinTransaction", () => {
    const iface = nonTest.find((f) => f.name === "repositories/ledger.repository.interface.ts")?.text ?? "";
    expect(iface).not.toMatch(/\b(update|delete|remove|upsert)\w*\(/);
    const prismaRepo = nonTest.find((f) => f.name === "repositories/ledger.repository.prisma.ts")?.text ?? "";
    expect(prismaRepo).not.toMatch(/coinTransaction\.(update|updateMany|delete|deleteMany|upsert)/);
  });

  it("CoinWallet chỉ bị ghi trong wallet.repository.prisma.ts; `applyDelta` chỉ được gọi từ coin-ledger.service.ts", () => {
    for (const f of nonTest) {
      if (f.name === "repositories/wallet.repository.prisma.ts") continue;
      expect(f.text).not.toMatch(/coinWallet\.(update|updateMany|upsert|create|delete|deleteMany)/);
    }
    const callers = nonTest.filter((f) => codeLines(f.file).some((l) => l.includes(".applyDelta(")));
    expect(callers.map((c) => c.name)).toEqual(["services/coin-ledger.service.ts"]);
  });

  it("chỉ repository (Prisma) chạm `@prisma/client`/`infrastructure/database`; service/controller/domain không", () => {
    for (const f of nonTest) {
      if (f.name.startsWith("repositories/") || f.name === "seed/coins.seed.ts") continue;
      expect(f.text).not.toMatch(/from "@prisma\/client"|infrastructure\/database/);
    }
  });

  it("không tích hợp cổng thanh toán/tiền thật", () => {
    for (const f of nonTest) expect(f.text).not.toMatch(/stripe|paypal|momo|vnpay|zalopay|payos/i);
  });

  it("phát socket qua `SocketEvent.GAMIFICATION_UPDATED` (hợp đồng be.md §6), payload chỉ có `coins`", () => {
    const ports = nonTest.find((f) => f.name === "services/coins.ports.ts")?.text ?? "";
    expect(ports).toContain("SocketEvent.GAMIFICATION_UPDATED");
    expect(ports).toContain("coins: { balance: number; delta: number; reason: CoinChangeReason }");
  });
});

describe("luật 3 tầng của module coins", () => {
  const specifiers = (file: string): string[] => codeLines(file).flatMap((line) => [...line.matchAll(/(?:from|import\()\s*"(\.[^"]*)"/g)].map((m) => m[1] ?? ""));

  it("chỉ import core/infrastructure/shared hoặc dịch vụ dùng chung đã xác nhận (audit-log); không import module khác", () => {
    const allowedModuleTargets = new Set(["modules/audit-log/audit-log.service"]);
    for (const file of files) {
      for (const spec of specifiers(file)) {
        const target = resolve(dirname(file), spec);
        if (target.startsWith(ROOT)) continue;
        const fromSrc = relative(SRC, target).split(sep).join("/");
        if (fromSrc.startsWith("modules/")) expect(allowedModuleTargets).toContain(fromSrc);
      }
    }
  });
});
