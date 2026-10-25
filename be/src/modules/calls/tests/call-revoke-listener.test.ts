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

import { clearRevokeListeners, registerPermissionResolverForTest } from "./support/permission-fixtures";
import { revokeScope } from "../../../core/permission";
import { registerCallRevokeListener } from "../jobs/call-revoke-listener";

describe("registerCallRevokeListener — nối calls vào mọi đường thu hồi quyền", () => {
  beforeEach(() => {
    enqueue.mockReset().mockResolvedValue(undefined);
    clearRevokeListeners();
    registerPermissionResolverForTest();
    registerCallRevokeListener();
  });

  it("revokeScope(CONVERSATION) xếp job call.revocation (queue calls) với jobId an toàn cho BullMQ", async () => {
    await revokeScope({ scope: { type: "CONVERSATION", id: "c1" }, userIds: ["u1"], reason: "REMOVED" });
    expect(enqueue).toHaveBeenCalledTimes(1);
    const [queue, jobName, data, opts] = enqueue.mock.calls[0] as [string, string, Record<string, unknown>, { jobId: string }];
    expect([queue, jobName]).toEqual(["calls", "call.revocation"]);
    expect(data).toEqual({ scopeType: "CONVERSATION", scopeId: "c1", userIds: ["u1"], reason: "REMOVED" });
    expect(opts.jobId).not.toContain(":");
  });

  it("scope không liên quan (CALL, BOARD) không xếp job — tránh vòng lặp khi calls tự thu hồi scope CALL", async () => {
    await revokeScope({ scope: { type: "CALL", id: "k1" }, userIds: ["u1"], reason: "REMOVED", cascade: false });
    await revokeScope({ scope: { type: "BOARD", id: "b1" }, userIds: ["u1"], reason: "REMOVED", cascade: false });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("enqueue lỗi/treo không làm hỏng revokeScope (chỉ log)", async () => {
    enqueue.mockRejectedValue(new Error("Redis down"));
    await expect(revokeScope({ scope: { type: "WORKSPACE", id: "w1" }, userIds: ["u1"], reason: "ARCHIVED", cascade: false })).resolves.toBeUndefined();
  });
});
