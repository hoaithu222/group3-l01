/**
 * Unit — `channel.events` (consumer outbox): khi nhận `status-changed` mà kênh ĐÃ lưu trữ, consumer đóng phạm vi kênh cho module gắn
 * với nó qua `permissionService.revokeScope({ reason: "ARCHIVED" })` (p2-03 be.md §5.9: `calls` kết thúc phòng thoại `ARCHIVED`).
 * Khôi phục kênh (`status-changed` với kênh ACTIVE) và mọi sự kiện khác KHÔNG được đóng phạm vi.
 */
import type { Job } from "bullmq";

type Processor = (job: Job) => Promise<unknown>;
const mockRegistered: Array<[string, string, Processor]> = [];
jest.mock("../../../infrastructure/queue", () => ({
  registerJob: (queue: string, jobName: string, fn: Processor) => {
    mockRegistered.push([queue, jobName, fn]);
  },
}));

const mockChannelFindUnique = jest.fn();
jest.mock("../../../infrastructure/database", () => ({
  prisma: { channel: { findUnique: (...a: unknown[]) => mockChannelFindUnique(...a) }, channelGrant: { findMany: jest.fn().mockResolvedValue([]) } },
}));

const mockEmitToRoom = jest.fn();
const mockEmitToUsers = jest.fn();
jest.mock("../../../infrastructure/socket/socket.emit", () => ({
  emitToRoom: (...a: unknown[]) => mockEmitToRoom(...a),
  emitToUsers: (...a: unknown[]) => mockEmitToUsers(...a),
}));
jest.mock("../../../infrastructure/socket", () => ({ ROOM: { channel: (id: string) => `ch:${id}`, workspace: (id: string) => `ws:${id}` } }));

const mockRevokeScope = jest.fn();
jest.mock("../../../core/permission", () => ({ permissionService: { revokeScope: (...a: unknown[]) => mockRevokeScope(...a) } }));
jest.mock("../services/channel-role-audience", () => ({ loadRoleCoveredMembers: jest.fn().mockResolvedValue([]) }));

import "../jobs/channel-events.consumer";

const processor = (): Processor => {
  const found = mockRegistered.find((r) => r[0] === "notifications" && r[1] === "channel.events");
  if (!found) throw new Error("chưa đăng ký channel.events");
  return found[2];
};
const job = (payload: Record<string, unknown>) => ({ data: { channelId: "ch1", workspaceId: "ws1", ...payload } }) as unknown as Job;
const channel = (over: Record<string, unknown>) => ({ id: "ch1", workspaceId: "ws1", visibility: "PUBLIC", status: "ARCHIVED", archiveReason: "MANUAL", ...over });

describe("channel.events — đóng phạm vi kênh khi lưu trữ", () => {
  beforeEach(() => {
    mockRevokeScope.mockReset().mockResolvedValue(undefined);
    mockEmitToRoom.mockReset();
    mockEmitToUsers.mockReset();
    mockChannelFindUnique.mockReset();
  });

  it("status-changed + kênh ARCHIVED → phát channel:archived rồi revokeScope(CHANNEL, ARCHIVED) không thu hồi người dùng cụ thể", async () => {
    mockChannelFindUnique.mockResolvedValue(channel({}));
    await processor()(job({ event: "status-changed", status: "ARCHIVED" }));
    expect(mockEmitToRoom).toHaveBeenCalledWith("ws:ws1", "channel:archived", expect.objectContaining({ id: "ch1", status: "ARCHIVED" }));
    expect(mockRevokeScope).toHaveBeenCalledTimes(1);
    expect(mockRevokeScope).toHaveBeenCalledWith({ scope: { type: "CHANNEL", id: "ch1" }, userIds: [], reason: "ARCHIVED" });
  });

  it.each(["PLATFORM", "NO_MANAGER"])("mọi đường lưu trữ (%s) đều đi qua cùng consumer → đóng phạm vi", async (archiveReason) => {
    mockChannelFindUnique.mockResolvedValue(channel({ archiveReason }));
    await processor()(job({ event: "status-changed", status: "ARCHIVED", archiveReason }));
    expect(mockRevokeScope).toHaveBeenCalledTimes(1);
  });

  it("khôi phục kênh (status ACTIVE) hoặc sự kiện khác (updated) → KHÔNG đóng phạm vi", async () => {
    mockChannelFindUnique.mockResolvedValue(channel({ status: "ACTIVE", archiveReason: null }));
    await processor()(job({ event: "status-changed", status: "ACTIVE" }));
    await processor()(job({ event: "updated" }));
    expect(mockRevokeScope).not.toHaveBeenCalled();
  });

  it("kênh không còn tồn tại → bỏ qua (không lỗi, không revoke)", async () => {
    mockChannelFindUnique.mockResolvedValue(null);
    await expect(processor()(job({ event: "status-changed", status: "ARCHIVED" }))).resolves.toBeUndefined();
    expect(mockRevokeScope).not.toHaveBeenCalled();
  });
});
