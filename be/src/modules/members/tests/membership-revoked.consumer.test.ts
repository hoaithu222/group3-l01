import type { Job } from "bullmq";

type Processor = (job: Job) => Promise<unknown>;

const mockRegistered: Array<[string, string, Processor]> = [];
jest.mock("../../../infrastructure/queue", () => ({
  registerJob: (queue: string, jobName: string, fn: Processor) => {
    mockRegistered.push([queue, jobName, fn]);
  },
}));

const mockEmitToScope = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../infrastructure/socket/socket.emit", () => ({
  emitToScope: (...args: unknown[]) => mockEmitToScope(...args),
}));

const mockFindUnique = jest.fn();
jest.mock("../../../infrastructure/database", () => ({
  prisma: { workspaceMembership: { findUnique: (...args: unknown[]) => mockFindUnique(...args) } },
}));

const mockLoggerWarn = jest.fn();
jest.mock("../../../infrastructure/logger", () => ({
  logger: { warn: (...args: unknown[]) => mockLoggerWarn(...args), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import "../jobs/membership-revoked.consumer";

function getProcessor(): Processor {
  const call = mockRegistered.find((c) => c[0] === "notifications" && c[1] === "membership.events");
  if (!call) throw new Error("Không tìm thấy processor membership.events đã đăng ký");
  return call[2];
}

describe("membership-revoked.consumer (job membership.events)", () => {
  beforeEach(() => {
    mockEmitToScope.mockClear();
    mockFindUnique.mockReset();
    mockLoggerWarn.mockClear();
  });

  it("đăng ký processor trên queue notifications, jobName membership.events", () => {
    expect(mockRegistered).toContainEqual(["notifications", "membership.events", expect.any(Function)]);
  });

  it.each(["invite-created", "invite-revoked"] as const)(
    "event %s → no-op, không đọc DB / không emit",
    async (event) => {
      const processor = getProcessor();
      await processor({ data: { event, workspaceId: "ws1" } } as Job);
      expect(mockFindUnique).not.toHaveBeenCalled();
      expect(mockEmitToScope).not.toHaveBeenCalled();
    }
  );

  it("thiếu userId → no-op", async () => {
    const processor = getProcessor();
    await processor({ data: { event: "joined", workspaceId: "ws1" } } as Job);
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockEmitToScope).not.toHaveBeenCalled();
  });

  it.each(["joined", "role-changed", "revoked", "displayName-changed"] as const)(
    "event %s + membership còn tồn tại → emit member:updated vào ws:{id}",
    async (event) => {
      mockFindUnique.mockResolvedValue({ role: "ADMIN", status: "ACTIVE", displayName: "Sếp" });
      const processor = getProcessor();
      await processor({ data: { event, workspaceId: "ws1", userId: "u1" } } as Job);

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { workspaceId_userId: { workspaceId: "ws1", userId: "u1" } },
      });
      expect(mockEmitToScope).toHaveBeenCalledWith(
        { type: "WORKSPACE", id: "ws1" },
        "member:updated",
        { workspaceId: "ws1", userId: "u1", role: "ADMIN", status: "ACTIVE", displayName: "Sếp" }
      );
    }
  );

  it("membership không còn tồn tại (đã bị xoá hẳn) → log warn, KHÔNG emit (retry vô hại)", async () => {
    mockFindUnique.mockResolvedValue(null);
    const processor = getProcessor();
    await processor({ data: { event: "revoked", workspaceId: "ws1", userId: "u1" } } as Job);

    expect(mockLoggerWarn).toHaveBeenCalled();
    expect(mockEmitToScope).not.toHaveBeenCalled();
  });
});
