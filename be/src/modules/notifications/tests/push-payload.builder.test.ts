import { buildPushPayload, buildVoipPayload, callIdToUuid } from "../services/push-payload.builder";

describe("buildPushPayload", () => {
  it("PUSH-09: message.new trong kênh riêng tư — không lộ nội dung/tên kênh, luôn có targetUserId", () => {
    const payload = buildPushPayload({
      type: "message.new",
      targetUserId: "u1",
      notificationId: "n1",
      scopeType: "CHANNEL",
      scopeId: "ch1",
      workspaceId: "ws1",
      refs: { messageId: "m1", scopeTitle: "kênh-mật-của-sếp", preview: "nội dung tin nhắn bí mật" },
      lockScreenPreview: false,
    });

    expect(payload.targetUserId).toBe("u1");
    expect(payload.body).toBe("Bạn có thông báo mới trong Super App");
    expect(JSON.stringify(payload)).not.toContain("bí mật");
    expect(JSON.stringify(payload)).not.toContain("kênh-mật-của-sếp");
    expect(payload.data).not.toHaveProperty("preview");
    expect(payload.data).not.toHaveProperty("scopeTitle");
    expect(payload).toMatchSnapshot({ sentAt: expect.any(String) });
  });

  it("lockScreenPreview=true → dùng preview nếu module gọi có truyền", () => {
    const payload = buildPushPayload({
      type: "mention",
      targetUserId: "u1",
      refs: { messageId: "m1", preview: "Xin chào" },
      lockScreenPreview: true,
    });
    expect(payload.body).toBe("Xin chào");
  });

  it("call.incoming → không hiển thị (title/body undefined), androidChannel calls, ttl 60s", () => {
    const payload = buildPushPayload({
      type: "call.incoming",
      targetUserId: "u1",
      refs: { callId: "c1", callerId: "u2", callerName: "Alice", mediaKind: "AUDIO" },
      lockScreenPreview: false,
    });
    expect(payload.title).toBeUndefined();
    expect(payload.body).toBeUndefined();
    expect(payload.androidChannel).toBe("calls");
    expect(payload.ttlSeconds).toBe(60);
    expect(payload.collapseKey).toBe("call:c1");
    expect(payload.data.callUuid).toBe(callIdToUuid("c1"));
  });

  it("batch > 1 → tiêu đề 'N thông báo mới', data.count + data.type của loại đầu", () => {
    const payload = buildPushPayload({
      type: "mention",
      targetUserId: "u1",
      refs: { messageId: "m1" },
      lockScreenPreview: false,
      batchCount: 12,
    });
    expect(payload.title).toBe("12 thông báo mới");
    expect(payload.data.count).toBe("12");
    expect(payload.data.type).toBe("mention");
  });

  it("call.missed nhóm → 'Cuộc gọi nhỡ trong nhóm', DM → tên người gọi", () => {
    const group = buildPushPayload({
      type: "call.missed",
      targetUserId: "u1",
      scopeType: "CHANNEL",
      refs: { callId: "c1", callerId: "u2", scopeTitle: "Nhóm dự án" },
      lockScreenPreview: false,
    });
    expect(group.body).toBe("Cuộc gọi nhỡ trong nhóm");

    const dm = buildPushPayload({
      type: "call.missed",
      targetUserId: "u1",
      refs: { callId: "c1", callerId: "u2", callerName: "Bob" },
      lockScreenPreview: false,
    });
    expect(dm.body).toBe("Cuộc gọi nhỡ từ Bob");
  });

  it("meeting.reminder — ttl tới startAt", () => {
    const startAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const payload = buildPushPayload({
      type: "meeting.reminder",
      targetUserId: "u1",
      refs: { meetingId: "mt1", startAt, minutesBefore: 5 },
      lockScreenPreview: false,
    });
    expect(payload.ttlSeconds).toBeGreaterThan(0);
    expect(payload.ttlSeconds).toBeLessThanOrEqual(300);
  });
});

describe("buildVoipPayload", () => {
  it("body phẳng, có callUuid tất định từ callId", () => {
    const payload = buildVoipPayload({
      targetUserId: "u1",
      callId: "507f1f77bcf86cd799439011",
      refs: { callerId: "u2", callerName: "Alice", mediaKind: "VIDEO" },
    });
    expect(payload.callUuid).toBe(callIdToUuid("507f1f77bcf86cd799439011"));
    expect(payload.type).toBe("call.incoming");
    expect(payload.targetUserId).toBe("u1");
  });

  it("callIdToUuid tất định — cùng callId luôn ra cùng UUID", () => {
    expect(callIdToUuid("abc")).toBe(callIdToUuid("abc"));
    expect(callIdToUuid("abc")).not.toBe(callIdToUuid("def"));
  });
});
