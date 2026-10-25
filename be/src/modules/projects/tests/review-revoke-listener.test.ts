const enqueue = jest.fn();
jest.mock("../../../infrastructure/queue", () => ({
  enqueue: (...args: unknown[]) => enqueue(...args),
  toSafeJobId: (id: string) => id.replace(/:/g, "_"),
}));

// `bumpVersion` cần Redis (INCR) — unit test không có Redis, giả lập trả version.
jest.mock("../../../core/permission/permission.cache", () => ({
  ...jest.requireActual("../../../core/permission/permission.cache"),
  bumpVersion: jest.fn().mockResolvedValue(1),
}));

import { clearRevokeListeners, resetPermissionPorts, revokeScope, setPermissionPorts } from "../../../core/permission";
import { registerReviewRevokeListener } from "../jobs/review-revoke-listener";

describe("registerReviewRevokeListener — nối chấm chéo vào mọi đường thu hồi quyền của workspace", () => {
  beforeEach(() => {
    enqueue.mockReset().mockResolvedValue(undefined);
    clearRevokeListeners();
    resetPermissionPorts();
    setPermissionPorts({
      realtime: { leaveRooms: () => Promise.resolve(), emitToUsers: () => Promise.resolve() },
      outbox: { enqueueNow: () => Promise.resolve() },
    });
    registerReviewRevokeListener();
  });

  it("revokeScope(WORKSPACE) xếp job reports/review.membership { workspaceId, userIds } với jobId an toàn cho BullMQ (không dấu ':')", async () => {
    await revokeScope({ scope: { type: "WORKSPACE", id: "w1" }, userIds: ["u1", "u2"], reason: "REMOVED", cascade: false });
    expect(enqueue).toHaveBeenCalledTimes(1);
    const [queue, jobName, data, opts] = enqueue.mock.calls[0] as [string, string, Record<string, unknown>, { jobId: string }];
    expect([queue, jobName]).toEqual(["reports", "review.membership"]);
    expect(data).toEqual({ workspaceId: "w1", userIds: ["u1", "u2"] });
    expect(opts.jobId).not.toContain(":");
  });

  it("scope khác (BOARD, CHANNEL…) hoặc không có người bị thu hồi (workspace lưu trữ) → không xếp job", async () => {
    await revokeScope({ scope: { type: "BOARD", id: "b1" }, userIds: ["u1"], reason: "REMOVED", cascade: false });
    await revokeScope({ scope: { type: "CHANNEL", id: "c1" }, userIds: ["u1"], reason: "REMOVED", cascade: false });
    await revokeScope({ scope: { type: "WORKSPACE", id: "w1" }, userIds: [], reason: "ARCHIVED", cascade: false });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("enqueue lỗi hoặc treo (Redis mất) KHÔNG làm hỏng revokeScope và không chờ quá ~1 giây (cron review.reconcile quét bù)", async () => {
    enqueue.mockRejectedValue(new Error("Redis down"));
    await expect(revokeScope({ scope: { type: "WORKSPACE", id: "w1" }, userIds: ["u1"], reason: "LEFT", cascade: false })).resolves.toBeUndefined();

    enqueue.mockReset().mockReturnValue(new Promise(() => undefined)); // treo vô hạn như queueConnection khi mất Redis
    const started = Date.now();
    await expect(revokeScope({ scope: { type: "WORKSPACE", id: "w1" }, userIds: ["u1"], reason: "BANNED", cascade: false })).resolves.toBeUndefined();
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("đăng ký lặp không nhân đôi (theo tên): một lần thu hồi ⇒ một job", async () => {
    registerReviewRevokeListener();
    registerReviewRevokeListener();
    await revokeScope({ scope: { type: "WORKSPACE", id: "w1" }, userIds: ["u1"], reason: "EXPIRED", cascade: false });
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
