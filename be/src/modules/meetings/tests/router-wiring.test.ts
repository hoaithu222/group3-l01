jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn(), connect: jest.fn(), disconnect: jest.fn() },
}));

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
}

/** Duyệt đệ quy cây Router của Express → danh sách "METHOD path" của mọi route đã mount. */
function collectRoutes(stack: Layer[] | undefined, out: string[] = []): string[] {
  for (const layer of stack ?? []) {
    if (layer.route) for (const method of Object.keys(layer.route.methods)) out.push(`${method.toUpperCase()} ${layer.route.path}`);
    else collectRoutes(layer.handle?.stack, out);
  }
  return out;
}

describe("router.ts — nối dây module meetings", () => {
  it("router v1 mount route lịch họp của người dùng VÀ route admin cuộc họp theo workspace (không chỉ nằm trong file routes)", async () => {
    const router = (await import("../../../router")).default as unknown as { stack: Layer[] };
    const routes = collectRoutes(router.stack);
    // Người dùng
    expect(routes).toEqual(expect.arrayContaining(["GET /me/meetings", "POST /workspaces/:workspaceId/meetings", "GET /meetings/:meetingId"]));
    // Admin (p2-04 admin.md §2.1) — đúng một route, chỉ đọc: không có POST/PATCH/DELETE nào dưới /admin/workspaces/:workspaceId/meetings
    const adminMeetings = routes.filter((r) => r.includes("/admin/workspaces/:workspaceId/meetings"));
    expect(adminMeetings).toEqual(["GET /admin/workspaces/:workspaceId/meetings"]);
  }, 120000);
});
