import { readFileSync } from "fs";
import { join } from "path";

jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn(), connect: jest.fn(), disconnect: jest.fn() },
}));

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
}

function collectRoutes(stack: Layer[] | undefined, out: string[] = []): string[] {
  for (const layer of stack ?? []) {
    if (layer.route) for (const method of Object.keys(layer.route.methods)) out.push(`${method.toUpperCase()} ${layer.route.path}`);
    else collectRoutes(layer.handle?.stack, out);
  }
  return out;
}

describe("router.ts — nối dây module admin-media-ops (p2-07)", () => {
  it("router v1 mount ĐỦ endpoint vận hành gọi & họp (không chỉ nằm trong file routes)", async () => {
    const router = (await import("../../../router")).default as unknown as { stack: Layer[] };
    const routes = collectRoutes(router.stack);
    expect(routes).toEqual(
      expect.arrayContaining([
        "GET /admin/meetings",
        "GET /admin/meetings/:meetingId",
        "POST /admin/meetings/:meetingId/force-end",
        "GET /admin/calls",
        "GET /admin/calls/stats",
        "GET /admin/calls/:callId",
        "POST /admin/calls/:callId/force-end",
        "GET /admin/media/health",
        "GET /admin/workspaces/:workspaceId/media-stats",
        // đã có từ trước, vẫn nguyên
        "GET /admin/recordings",
        "GET /admin/workspaces/:workspaceId/meetings",
      ])
    );
    // `/stats` khai báo TRƯỚC `/:callId` (param objectId sẽ từ chối "stats").
    expect(routes.indexOf("GET /admin/calls/stats")).toBeLessThan(routes.indexOf("GET /admin/calls/:callId"));
    // Không có route ghi nào ngoài hai force-end (module này chỉ đọc + kết thúc cưỡng bức).
    const mine = routes.filter((r) => /\/admin\/(meetings|calls)/.test(r) || r.includes("media-stats") || r.endsWith("/admin/media/health"));
    expect(mine.filter((r) => !r.startsWith("GET"))).toEqual(["POST /admin/meetings/:meetingId/force-end", "POST /admin/calls/:callId/force-end"]);
  }, 120000);

  it("mount TRƯỚC `/admin/workspaces` — `admin-workspaces.routes` có router.use(requireFeature(COMMUNICATION)) chặn mọi `/admin/workspaces/*` (media-stats 404 nhầm nếu mount sau)", () => {
    const src = readFileSync(join(__dirname, "..", "..", "..", "router.ts"), "utf8");
    const mine = src.indexOf("v1.use(adminMediaOpsRoutes);");
    const workspaces = src.indexOf('v1.use("/admin/workspaces", adminWorkspacesRoutes);');
    expect(mine).toBeGreaterThan(-1);
    expect(workspaces).toBeGreaterThan(-1);
    expect(mine).toBeLessThan(workspaces);
    // Middleware gắn TỪNG route, không `router.use` (sẽ chặn nhầm request module khác đi qua).
    const routesSrc = readFileSync(join(__dirname, "..", "admin-media-ops.routes.ts"), "utf8");
    expect(routesSrc.split("\n").filter((l) => l.startsWith("router.use("))).toEqual([]);
  });

  it("register-jobs nạp sink admin-media; worker-registries không cần đổi (sink chỉ dùng emitToRoom + Redis throttle)", () => {
    const src = readFileSync(join(__dirname, "..", "..", "..", "infrastructure", "queue", "register-jobs.ts"), "utf8");
    expect(src).toContain('modules/admin-media-ops/jobs/admin-media.jobs');
    const meetingRooms = readFileSync(join(__dirname, "..", "..", "meetings", "jobs", "meeting-room.jobs.ts"), "utf8");
    expect(meetingRooms).toContain('registerJob("calls", "meeting.force-end"');
    const callJobs = readFileSync(join(__dirname, "..", "..", "calls", "jobs", "call.jobs.ts"), "utf8");
    expect(callJobs).toContain("./call-admin.outbox-handlers");
  });
});
