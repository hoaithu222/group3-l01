import type { BatchResponse } from "firebase-admin/messaging";

// Tên biến PHẢI có tiền tố "mock" — Jest chỉ cho phép jest.mock() factory
// tham chiếu biến ngoài phạm vi khi tên bắt đầu bằng "mock". `resetMocks:
// true` (jest.config.ts) xoá implementation trước MỖI test, kể cả implementation
// gán lúc tạo — nên phải gán lại `mockGetMessaging` trong `beforeEach`.
const mockSendEachForMulticast = jest.fn();
const mockGetMessaging = jest.fn();

jest.mock("firebase-admin/messaging", () => ({
  getMessaging: (...args: unknown[]) => mockGetMessaging(...args),
}));

import { FirebasePushSender } from "../firebase-push.sender";
import type { PushPayload } from "../push.types";

describe("FirebasePushSender", () => {
  const payload: PushPayload = {
    type: "mention",
    targetUserId: "u1",
    notificationId: "n1",
    sentAt: "2026-01-01T00:00:00.000Z",
    data: { foo: "bar" },
  };
  const sender = new FirebasePushSender({ name: "push" } as never);

  beforeEach(() => {
    mockGetMessaging.mockReturnValue({ sendEachForMulticast: mockSendEachForMulticast });
  });

  it("token chết (not-registered/invalid) → gom vào invalidTokens, các lỗi khác thì không", async () => {
    mockSendEachForMulticast.mockResolvedValueOnce({
      successCount: 1,
      failureCount: 2,
      responses: [
        { success: true },
        { success: false, error: { code: "messaging/registration-token-not-registered" } },
        { success: false, error: { code: "messaging/third-party-auth-error" } },
      ],
    } as unknown as BatchResponse);

    const result = await sender.sendMulticast(["ok", "dead", "config-error"], payload);

    expect(result.successCount).toBe(1);
    expect(result.invalidTokens).toEqual(["dead"]);
  });

  it("lỗi throw khi gửi lô → không throw ra ngoài, trả kết quả rỗng cho lô đó", async () => {
    mockSendEachForMulticast.mockRejectedValueOnce(new Error("network down"));

    await expect(sender.sendMulticast(["a", "b"], payload)).resolves.toEqual({
      successCount: 0,
      invalidTokens: [],
    });
  });

  it("tokens rỗng → không gọi Firebase", async () => {
    const result = await sender.sendMulticast([], payload);
    expect(result).toEqual({ successCount: 0, invalidTokens: [] });
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it("gắn androidChannel, priority high, badge iOS, collapseKey → apns-collapse-id", async () => {
    mockSendEachForMulticast.mockResolvedValueOnce({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    } as unknown as BatchResponse);

    await sender.sendMulticast(["t1"], {
      ...payload,
      title: "Cuộc gọi nhỡ",
      body: "Bạn có 1 cuộc gọi nhỡ",
      androidChannel: "calls",
      collapseKey: "missed:c1",
      badge: 3,
      ttlSeconds: 86400,
    });

    const sent = mockSendEachForMulticast.mock.calls[0][0] as {
      android: { priority: string; collapseKey?: string; ttl?: number; notification?: { channelId: string } };
      apns: { headers?: Record<string, string>; payload: { aps: { badge?: number } } };
      notification?: { title: string; body: string };
    };
    expect(sent.android.priority).toBe("high");
    // Tên LOGIC `calls` được ánh xạ sang id kênh THẬT trên máy (xem `ANDROID_CHANNEL_ID`).
    expect(sent.android.notification?.channelId).toBe("superapp-call-ring-v1");
    expect(sent.android.collapseKey).toBe("missed:c1");
    expect(sent.android.ttl).toBe(86_400_000);
    expect(sent.apns.headers?.["apns-collapse-id"]).toBe("missed:c1");
    expect(sent.apns.payload.aps.badge).toBe(3);
    expect(sent.notification).toEqual({ title: "Cuộc gọi nhỡ", body: "Bạn có 1 cuộc gọi nhỡ" });
  });

  it("không có title/body (data-only) → content-available:1, không có field notification", async () => {
    mockSendEachForMulticast.mockResolvedValueOnce({
      successCount: 1,
      failureCount: 0,
      responses: [{ success: true }],
    } as unknown as BatchResponse);

    await sender.sendMulticast(["t1"], payload);

    const sent = mockSendEachForMulticast.mock.calls[0][0] as {
      notification?: unknown;
      apns: { payload: { aps: Record<string, unknown> } };
    };
    expect(sent.notification).toBeUndefined();
    expect(sent.apns.payload.aps["content-available"]).toBe(1);
  });

  it("expiresAt → apns-expiration (epoch giây) cùng apns-collapse-id; không expiresAt → chỉ collapse-id như cũ", async () => {
    mockSendEachForMulticast.mockResolvedValue({ successCount: 0, failureCount: 0, responses: [] } as unknown as BatchResponse);
    const expiresAt = "2026-09-26T09:00:45.000Z";

    await sender.sendMulticast(["t1"], { ...payload, collapseKey: "call:c1", ttlSeconds: 45, expiresAt });
    await sender.sendMulticast(["t1"], { ...payload, collapseKey: "missed:c1" });
    await sender.sendMulticast(["t1"], payload);

    const apnsOf = (i: number) => (mockSendEachForMulticast.mock.calls[i][0] as { apns: { headers?: Record<string, string> } }).apns.headers;
    expect(apnsOf(0)).toEqual({ "apns-collapse-id": "call:c1", "apns-expiration": String(Date.parse(expiresAt) / 1000) });
    expect(apnsOf(1)).toEqual({ "apns-collapse-id": "missed:c1" });
    expect(apnsOf(2)).toBeUndefined(); // không có collapse/expiresAt → không đặt header (giữ mặc định FCM)
  });

  it("expiresAt không hợp lệ → bỏ qua (không đặt apns-expiration)", async () => {
    mockSendEachForMulticast.mockResolvedValue({ successCount: 0, failureCount: 0, responses: [] } as unknown as BatchResponse);
    await sender.sendMulticast(["t1"], { ...payload, expiresAt: "hỏng" });
    expect((mockSendEachForMulticast.mock.calls[0][0] as { apns: { headers?: unknown } }).apns.headers).toBeUndefined();
  });

  it("chia lô đúng 500 token/lần khi gửi > 500 token", async () => {
    mockSendEachForMulticast.mockResolvedValue({
      successCount: 0,
      failureCount: 0,
      responses: [],
    } as unknown as BatchResponse);
    const tokens = Array.from({ length: 750 }, (_, i) => `t${i}`);

    await sender.sendMulticast(tokens, payload);

    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(2);
    const firstCallTokens = (mockSendEachForMulticast.mock.calls[0][0] as { tokens: string[] }).tokens;
    const secondCallTokens = (mockSendEachForMulticast.mock.calls[1][0] as { tokens: string[] }).tokens;
    expect(firstCallTokens).toHaveLength(500);
    expect(secondCallTokens).toHaveLength(250);
  });
});
