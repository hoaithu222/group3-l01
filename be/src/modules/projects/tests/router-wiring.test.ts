jest.mock("../../../infrastructure/redis", () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn(), ping: jest.fn(), connect: jest.fn(), disconnect: jest.fn() },
}));

describe("router.ts — nối dây module projects", () => {
  it("router v1 nạp được, mount đủ route (401 khi chưa đăng nhập) và đăng ký resolver BOARD + children WORKSPACE + guard board:", async () => {
    const router = (await import("../../../router")).default;
    const { getResolver } = await import("../../../core/permission");
    const { resolveJoinable } = await import("../../../infrastructure/socket/socket.rooms");
    expect(router).toBeDefined();
    expect(getResolver("BOARD")).toBeDefined();
    expect(getResolver("WORKSPACE")?.children).toBeDefined();
    const res = await resolveJoinable({ id: "a".repeat(24), email: "x@e.com", role: "user", permissions: [] }, "board", "b".repeat(24));
    expect(res.code).toBe("PERM_404");
    const express = (await import("express")).default;
    const request = (await import("supertest")).default;
    const app = express();
    app.use("/api", router);
    for (const [method, path] of [["get", "/api/v1/boards/" + "a".repeat(24)], ["post", "/api/v1/tasks/" + "a".repeat(24) + "/move"], ["delete", "/api/v1/labels/" + "a".repeat(24)], ["get", "/api/v1/workspaces/" + "a".repeat(24) + "/boards"], ["get", "/api/v1/admin/workspaces/" + "a".repeat(24) + "/project-stats"], ["get", "/api/v1/tasks/" + "a".repeat(24)], ["post", "/api/v1/tasks/" + "a".repeat(24) + "/comments"], ["delete", "/api/v1/task-comments/" + "a".repeat(24)], ["get", "/api/v1/boards/" + "a".repeat(24) + "/mentionables"], ["put", "/api/v1/tasks/" + "a".repeat(24) + "/watch"], ["get", "/api/v1/tasks/" + "a".repeat(24) + "/watchers"], ["post", "/api/v1/tasks/" + "a".repeat(24) + "/duplicate"], ["post", "/api/v1/tasks/" + "a".repeat(24) + "/checklist/" + "b".repeat(24) + "/convert"], ["get", "/api/v1/board-templates"], ["post", "/api/v1/boards/" + "a".repeat(24) + "/duplicate"], ["post", "/api/v1/workspaces/" + "a".repeat(24) + "/boards/from-template"]] as const) {
      const r = await request(app)[method](path);
      expect([path, r.status]).toEqual([path, 401]);
    }
  }, 120000);
});
