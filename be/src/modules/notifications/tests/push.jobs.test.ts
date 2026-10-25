import type { Job } from "bullmq";

type Processor = (job: Job) => Promise<unknown>;

const mockRegistered: Array<[string, string, Processor]> = [];
jest.mock("../../../infrastructure/queue", () => ({
  registerJob: (queue: string, jobName: string, fn: Processor) => {
    mockRegistered.push([queue, jobName, fn]);
  },
  defineCron: jest.fn(),
}));

const mockCancelPendingByScope = jest.fn().mockResolvedValue(0);
const mockCancelUnreadByScope = jest.fn().mockResolvedValue(0);
const mockFindRecipientsByIds = jest.fn();
const mockGetPreference = jest.fn();
jest.mock("../repositories", () => ({
  PrismaNotificationRepository: jest.fn().mockImplementation(() => ({
    cancelPendingByScope: mockCancelPendingByScope,
    cancelUnreadByScope: mockCancelUnreadByScope,
    findRecipientsByIds: (...args: unknown[]) => mockFindRecipientsByIds(...args),
    getPreference: (...args: unknown[]) => mockGetPreference(...args),
  })),
}));
jest.mock("../../../infrastructure/redis", () => ({ redis: { del: jest.fn().mockResolvedValue(undefined) } }));
const mockGetActiveVoipTokens = jest.fn();
jest.mock("../../devices/public", () => ({
  createDeviceService: jest.fn().mockReturnValue({
    getActiveVoipTokens: (...args: unknown[]) => mockGetActiveVoipTokens(...args),
    revokeTokens: jest.fn(),
  }),
}));
jest.mock("../../../infrastructure/push", () => ({ getPushSender: jest.fn(), getVoipSender: jest.fn() }));

import { getVoipSender } from "../../../infrastructure/push";
import "../jobs/push.jobs";

function getProcessor(queue: string, jobName: string): Processor {
  const call = mockRegistered.find((c) => c[0] === queue && c[1] === jobName);
  if (!call) throw new Error(`Không tìm thấy processor đã đăng ký cho ${queue}/${jobName}`);
  return call[2];
}

describe("push.jobs — push.cancel-scope", () => {
  beforeEach(() => {
    mockCancelPendingByScope.mockClear().mockResolvedValue(0);
    mockCancelUnreadByScope.mockClear().mockResolvedValue(0);
  });

  it("đăng ký job push.cancel-scope trên queue push", () => {
    expect(mockRegistered).toContainEqual(["push", "push.cancel-scope", expect.any(Function)]);
  });

  it("gọi repo.cancelPendingByScope đúng {userIds, scopeType, scopeId} — KHÔNG phải recipientRowIds", async () => {
    const processor = getProcessor("push", "push.cancel-scope");
    await processor({
      data: { userIds: ["u1", "u2"], scopeType: "WORKSPACE", scopeId: "ws1", version: 3 },
    } as Job);
    expect(mockCancelPendingByScope).toHaveBeenCalledWith(["u1", "u2"], "WORKSPACE", "ws1");
  });

  it("p1-07: huỷ luôn mục hộp thư chưa đọc của scope (NT-05)", async () => {
    const processor = getProcessor("push", "push.cancel-scope");
    await processor({
      data: { userIds: ["u1"], scopeType: "CONVERSATION", scopeId: "c1", version: 2 },
    } as Job);
    expect(mockCancelUnreadByScope).toHaveBeenCalledWith(["u1"], "CONVERSATION", "c1", expect.any(Date));
  });

  it("userIds rỗng → không gọi repo (không có gì để huỷ)", async () => {
    const processor = getProcessor("push", "push.cancel-scope");
    await processor({ data: { userIds: [], scopeType: "WORKSPACE", scopeId: "ws1", version: 1 } } as Job);
    expect(mockCancelPendingByScope).not.toHaveBeenCalled();
    expect(mockCancelUnreadByScope).not.toHaveBeenCalled();
  });
});

describe("push.jobs — push.voip (p2-02: không gửi VoIP quá hạn đổ chuông)", () => {
  const send = jest.fn();
  const row = (refs: Record<string, unknown>) => ({
    recipient: { id: "r1", recipientId: "u1", readAt: null, pushStatus: "PENDING" },
    notification: { id: "n1", type: "call.incoming", scopeType: "CALL", scopeId: "c1", workspaceId: null, refs },
  });

  beforeEach(() => {
    send.mockReset().mockResolvedValue({ ok: true, status: 200, shouldRevoke: false, retriable: false });
    (getVoipSender as jest.Mock).mockReturnValue({ send });
    mockGetActiveVoipTokens.mockReset().mockResolvedValue([{ token: "voip-token", environment: "SANDBOX", bundleId: "com.app" }]);
    mockFindRecipientsByIds.mockReset();
    mockGetPreference.mockReset().mockResolvedValue(null); // chưa chọn mức xem trước ⇒ cuộc gọi dùng FULL
  });

  const run = () => getProcessor("push", "push.voip")({ data: { recipientRowId: "r1" } } as Job);

  it("còn hạn đổ chuông → gửi VoIP, payload mang callVersion/expiresAt/scopeKind", async () => {
    const expiresAt = new Date(Date.now() + 40_000).toISOString();
    mockFindRecipientsByIds.mockResolvedValue([row({ callId: "507f1f77bcf86cd799439011", callerId: "u2", mediaKind: "AUDIO", scopeKind: "DIRECT", callVersion: 1, expiresAt })]);

    await run();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][3]).toMatchObject({ callVersion: "1", expiresAt, scopeKind: "DIRECT", type: "call.incoming" });
  });

  it("ĐÃ quá hạn đổ chuông (job trễ/retry) → KHÔNG gửi VoIP (iOS buộc hiện CallKit cho mọi VoIP → chuông ma)", async () => {
    mockFindRecipientsByIds.mockResolvedValue([row({ callId: "507f1f77bcf86cd799439011", callerId: "u2", expiresAt: new Date(Date.now() - 1000).toISOString() })]);

    await run();

    expect(send).not.toHaveBeenCalled();
    expect(mockGetActiveVoipTokens).not.toHaveBeenCalled();
  });

  it("refs cũ không có expiresAt → vẫn gửi như trước (tương thích ngược)", async () => {
    mockFindRecipientsByIds.mockResolvedValue([row({ callId: "507f1f77bcf86cd799439011", callerId: "u2" })]);
    await run();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("xem trước màn hình khoá (p2-02 §5.3): chưa chọn → FULL (có tên); HIDDEN → callerName rỗng + không tên nhóm/ảnh; SENDER → có tên, không tên nhóm", async () => {
    const refs = { callId: "507f1f77bcf86cd799439011", callerId: "u2", callerName: "Lan", callerAvatar: "https://cdn.test/a.png", scopeTitle: "Nhóm Đồ án" };
    mockFindRecipientsByIds.mockResolvedValue([row(refs)]);

    await run(); // chưa có preference
    expect(send.mock.calls[0][3]).toMatchObject({ callerName: "Lan", scopeTitle: "Nhóm Đồ án" });

    send.mockClear();
    mockGetPreference.mockResolvedValue({ lockScreenLevel: "HIDDEN" });
    await run();
    expect(mockGetPreference).toHaveBeenCalledWith("u1", "ACCOUNT", "account");
    expect(send.mock.calls[0][3]).toMatchObject({ callerName: "", scopeTitle: undefined, callerAvatar: undefined, callerId: "u2" });

    send.mockClear();
    mockGetPreference.mockResolvedValue({ lockScreenLevel: "SENDER" });
    await run();
    expect(send.mock.calls[0][3]).toMatchObject({ callerName: "Lan", scopeTitle: undefined });
  });
});
