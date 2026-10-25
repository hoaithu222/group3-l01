/**
 * Cờ `project` TẮT (mặc định của mọi môi trường chưa bật phân hệ) ⇒ mọi route của phân hệ trả 404 `CFG_005`, kiểm SAU xác thực.
 * Module `project` đã có mã (`AVAILABLE_MODULES` chứa nó) nên chỉ CỜ quyết định — đặt `FEATURE_FLAGS` rỗng TƯỜNG MINH để kết quả không phụ
 * thuộc `be/.env` của người chạy (máy dev bật `project=true`). KHÔNG mock `AVAILABLE_MODULES`/`FEATURE_FLAGS` ở file này.
 */
process.env.FEATURE_FLAGS = "";

jest.mock("../../../../infrastructure/redis", () => ({
  redis: { connect: jest.fn(), disconnect: jest.fn(), ping: jest.fn(), get: jest.fn(), set: jest.fn(), del: jest.fn(), incr: jest.fn(), expire: jest.fn() },
}));
jest.mock("../../../../core/permission/user-status", () => ({
  getUserStatusCached: jest.fn(),
  invalidateUserStatusCache: jest.fn().mockResolvedValue(undefined),
}));

import express from "express";
import request from "supertest";
import { errorHandler, notFoundHandler } from "../../../../core/middlewares";
import { AVAILABLE_MODULES, FEATURE_FLAGS, MODULES } from "../../../../core/constants/modules";
import { JwtUtils } from "../../../../core/utils/jwt";
import { getUserStatusCached } from "../../../../core/permission/user-status";
import { redis } from "../../../../infrastructure/redis";
import projectsRoutes from "../../projects.routes";
import adminProjectsRoutes from "../../admin-projects.routes";

const id = "a".repeat(24);
const token = JwtUtils.generateAccessToken({ userId: id, email: "a@e.com", name: "T", role: "admin", sv: 1 });

describe("cờ project chưa bật", () => {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", projectsRoutes);
  app.use("/api/v1", adminProjectsRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  beforeEach(() => {
    (getUserStatusCached as jest.Mock).mockResolvedValue({ status: "ACTIVE", sessionVersion: 1 });
    (redis.get as jest.Mock).mockResolvedValue(null);
  });

  it("tiền đề: `project` đã có mã (AVAILABLE_MODULES) nhưng cờ env đang TẮT — nên 404 dưới đây là do cờ, không phải do chưa có mã", () => {
    expect(AVAILABLE_MODULES).toContain(MODULES.PROJECT);
    expect(FEATURE_FLAGS[MODULES.PROJECT]).toBe(false);
  });

  it.each([
    ["get", `/api/v1/workspaces/${id}/boards`],
    ["post", `/api/v1/workspaces/${id}/boards`],
    ["get", `/api/v1/boards/${id}`],
    ["put", `/api/v1/boards/${id}/columns`],
    ["get", `/api/v1/boards/${id}/tasks`],
    ["post", `/api/v1/tasks/${id}/move`],
    ["get", `/api/v1/boards/${id}/labels`],
    ["delete", `/api/v1/labels/${id}`],
    ["get", `/api/v1/admin/workspaces/${id}/project-stats`],
    // p3-03 — chi tiết thẻ, checklist, đính kèm, nhật ký, bình luận, gợi ý người
    ["get", `/api/v1/tasks/${id}`],
    ["patch", `/api/v1/tasks/${id}`],
    ["delete", `/api/v1/tasks/${id}`],
    ["post", `/api/v1/tasks/${id}/restore`],
    ["post", `/api/v1/tasks/${id}/checklist`],
    ["patch", `/api/v1/tasks/${id}/checklist/${id}`],
    ["delete", `/api/v1/tasks/${id}/checklist/${id}`],
    ["get", `/api/v1/tasks/${id}/attachments`],
    ["post", `/api/v1/tasks/${id}/attachments`],
    ["delete", `/api/v1/tasks/${id}/attachments/${id}`],
    ["get", `/api/v1/tasks/${id}/activity`],
    ["get", `/api/v1/tasks/${id}/comments`],
    ["post", `/api/v1/tasks/${id}/comments`],
    ["patch", `/api/v1/task-comments/${id}`],
    ["delete", `/api/v1/task-comments/${id}`],
    ["get", `/api/v1/boards/${id}/mentionables`],
    // p4-05 — chấm chéo
    ["get", `/api/v1/boards/${id}/review-config`],
    ["put", `/api/v1/boards/${id}/review-config`],
    ["get", `/api/v1/tasks/${id}/reviews`],
    ["post", `/api/v1/tasks/${id}/review/waive`],
    ["post", `/api/v1/task-reviews/${id}/submit`],
    ["post", `/api/v1/task-reviews/${id}/reassign`],
    ["get", `/api/v1/me/reviews`],
    ["get", `/api/v1/admin/workspaces/${id}/review-stats`],
    // P1 — theo dõi/sao chép thẻ, chuyển việc nhỏ thành thẻ (p3-03); mẫu bảng + sao chép bảng (p3-02)
    ["put", `/api/v1/tasks/${id}/watch`],
    ["delete", `/api/v1/tasks/${id}/watch`],
    ["get", `/api/v1/tasks/${id}/watchers`],
    ["post", `/api/v1/tasks/${id}/duplicate`],
    ["post", `/api/v1/tasks/${id}/checklist/${id}/convert`],
    ["get", `/api/v1/board-templates`],
    ["post", `/api/v1/workspaces/${id}/boards/from-template`],
    ["post", `/api/v1/boards/${id}/duplicate`],
  ] as const)("%s %s → 404 CFG_005", async (method, path) => {
    const res = await request(app)[method](path).set("Authorization", `Bearer ${token}`).send({});
    expect([res.status, res.body.error.code]).toEqual([404, "CFG_005"]);
  });

  it("chưa đăng nhập vẫn 401 (cờ kiểm SAU xác thực)", async () => {
    expect((await request(app).get(`/api/v1/boards/${id}`)).status).toBe(401);
  });
});
