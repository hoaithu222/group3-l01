import { buildMessagePushPayload, effectiveLevel, type BuildMessagePushInput } from "../services/message-push-payload.builder";
import { renderMessagePreview, truncateGraphemes } from "../services/message-preview";

const NOW = new Date("2026-09-19T10:00:00.000Z");
const U = "64b000000000000000000001";
const M = "64b000000000000000000010";
const CH = "64b000000000000000000020";

function input(over: Partial<BuildMessagePushInput> = {}): BuildMessagePushInput {
  return {
    userId: U,
    messageId: M,
    scopeType: "CONVERSATION",
    scopeId: CH,
    threadId: null,
    scopeKey: `CONVERSATION:${CH}`,
    reason: "MESSAGE",
    workspaceId: null,
    conversationKind: "DIRECT",
    scopeName: null,
    senderName: "Minh",
    preview: "Chiều nay họp lúc 3h nhé",
    level: "HIDDEN",
    restricted: false,
    badge: 3,
    sound: true,
    now: NOW,
    ...over,
  };
}

describe("buildMessagePushPayload — NT-10 ba mức lockScreenPreview", () => {
  it("HIDDEN (mặc định): không lộ người gửi/nội dung/tên nơi chat", () => {
    const p = buildMessagePushPayload(input({ level: "HIDDEN" }));
    expect(p.title).toBe("Super App");
    expect(p.body).toBe("Bạn có tin nhắn mới");
    expect(JSON.stringify(p)).not.toContain("Minh");
    expect(JSON.stringify(p)).not.toContain("họp lúc 3h");
  });

  it("HIDDEN + mention → 'Bạn được nhắc tên'", () => {
    expect(buildMessagePushPayload(input({ reason: "MENTION" })).body).toBe("Bạn được nhắc tên");
  });

  it("SENDER 1-1: tiêu đề = tên người gửi, body = 'Đã gửi tin nhắn'", () => {
    const p = buildMessagePushPayload(input({ level: "SENDER" }));
    expect(p.title).toBe("Minh");
    expect(p.body).toBe("Đã gửi tin nhắn");
    expect(JSON.stringify(p)).not.toContain("họp lúc 3h");
  });

  it("SENDER nhóm: tiêu đề = tên nhóm, body = 'Tên: đã gửi tin nhắn'", () => {
    const p = buildMessagePushPayload(input({ level: "SENDER", conversationKind: "GROUP", scopeName: "Đồ án" }));
    expect(p.title).toBe("Đồ án");
    expect(p.body).toBe("Minh: đã gửi tin nhắn");
  });

  it("SENDER kênh: tiêu đề = '#tên kênh'", () => {
    const p = buildMessagePushPayload(
      input({ level: "SENDER", scopeType: "CHANNEL", conversationKind: undefined, scopeName: "frontend", scopeKey: `CHANNEL:${CH}` })
    );
    expect(p.title).toBe("#frontend");
    expect(p.body).toBe("Minh: đã gửi tin nhắn");
  });

  it("FULL 1-1: body = trích đoạn; FULL nhóm: 'Tên: trích đoạn'", () => {
    expect(buildMessagePushPayload(input({ level: "FULL" })).body).toBe("Chiều nay họp lúc 3h nhé");
    const g = buildMessagePushPayload(input({ level: "FULL", conversationKind: "GROUP", scopeName: "Đồ án" }));
    expect(g.body).toBe("Minh: Chiều nay họp lúc 3h nhé");
  });

  it("NT-10: kênh riêng tư (restricted) với FULL hạ xuống SENDER — không lộ nội dung", () => {
    const p = buildMessagePushPayload(
      input({ level: "FULL", restricted: true, scopeType: "CHANNEL", conversationKind: undefined, scopeName: "ban-giam-doc" })
    );
    expect(p.title).toBe("#ban-giam-doc");
    expect(p.body).toBe("Minh: đã gửi tin nhắn");
    expect(JSON.stringify(p)).not.toContain("họp lúc 3h");
    expect(effectiveLevel("FULL", true)).toBe("SENDER");
    expect(effectiveLevel("HIDDEN", true)).toBe("HIDDEN");
    expect(effectiveLevel("SENDER", false)).toBe("SENDER");
  });

  it("gộp burst: 'N tin nhắn mới' ở HIDDEN/SENDER, kèm data.count", () => {
    const hidden = buildMessagePushPayload(input({ batchCount: 4 }));
    expect(hidden.body).toBe("4 tin nhắn mới");
    expect(hidden.data["count"]).toBe("4");
    const sender = buildMessagePushPayload(input({ level: "SENDER", batchCount: 4 }));
    expect(sender.title).toBe("Minh");
    expect(sender.body).toBe("4 tin nhắn mới");
  });

  it("batchCount = 1 không phải burst (không có data.count)", () => {
    expect(buildMessagePushPayload(input({ batchCount: 1 })).data["count"]).toBeUndefined();
  });
});

describe("buildMessagePushPayload — khoá dữ liệu, kênh Android, badge", () => {
  it("luôn có type, scopeType, scopeId, messageId, targetUserId; app fetch lại khi mở", () => {
    const p = buildMessagePushPayload(input({ workspaceId: "64b000000000000000000030", threadId: "64b000000000000000000040" }));
    expect(p).toMatchObject({
      type: "message.new",
      targetUserId: U,
      scopeType: "CONVERSATION",
      scopeId: CH,
      workspaceId: "64b000000000000000000030",
    });
    expect(p.data).toMatchObject({ messageId: M, threadId: "64b000000000000000000040", conversationKind: "DIRECT", v: "1" });
  });

  it("thread.reply mang rootMessageId (= Message.threadId = id tin GỐC) để app dựng route luồng; không thread thì không có khoá", () => {
    const root = "64b000000000000000000040";
    const reply = buildMessagePushPayload(input({ reason: "THREAD_REPLY", threadId: root }));
    expect(reply.type).toBe("thread.reply");
    expect(reply.data).toMatchObject({ messageId: M, threadId: root, rootMessageId: root });
    // nhắc tên trong luồng cũng cần mở đúng luồng
    expect(buildMessagePushPayload(input({ reason: "MENTION", threadId: root })).data["rootMessageId"]).toBe(root);
    // tin thường ngoài thread → không ghi khoá rỗng
    const plain = buildMessagePushPayload(input());
    expect(plain.data["rootMessageId"]).toBeUndefined();
    expect(plain.data["threadId"]).toBeUndefined();
  });

  it("loại push + kênh Android theo lý do: MESSAGE→default; MENTION/THREAD_REPLY/FIRST_REPLY→mentions", () => {
    expect(buildMessagePushPayload(input({ reason: "MESSAGE" }))).toMatchObject({ type: "message.new", androidChannel: "default" });
    expect(buildMessagePushPayload(input({ reason: "MENTION" }))).toMatchObject({ type: "mention", androidChannel: "mentions" });
    expect(buildMessagePushPayload(input({ reason: "THREAD_REPLY" }))).toMatchObject({ type: "thread.reply", androidChannel: "mentions" });
    expect(buildMessagePushPayload(input({ reason: "FIRST_REPLY" }))).toMatchObject({ type: "thread.reply", androidChannel: "mentions" });
  });

  it("badge, groupKey (= scopeKey → tag Android / thread-id iOS), sound, ttl", () => {
    const p = buildMessagePushPayload(input({ badge: 7, sound: false }));
    expect(p).toMatchObject({ badge: 7, groupKey: `CONVERSATION:${CH}`, sound: false, ttlSeconds: 3600 });
  });

  it("collapseKey: message.new theo luồng; mention theo tin; thread.reply theo thread", () => {
    expect(buildMessagePushPayload(input()).collapseKey).toBe(`msg:${CH}`);
    expect(buildMessagePushPayload(input({ reason: "MENTION" })).collapseKey).toBe(`mention:${M}`);
    expect(buildMessagePushPayload(input({ reason: "THREAD_REPLY", threadId: "64b000000000000000000040" })).collapseKey).toBe(
      "thread:64b000000000000000000040"
    );
  });

  it("thiếu tên người gửi/nhóm → nhãn dự phòng, không 'undefined'", () => {
    const p = buildMessagePushPayload(input({ level: "SENDER", senderName: null, conversationKind: "GROUP", scopeName: null }));
    expect(p.title).toBe("Cuộc trò chuyện");
    expect(p.body).toBe("Ai đó: đã gửi tin nhắn");
  });
});

describe("renderMessagePreview / truncateGraphemes", () => {
  const USER = "64b0000000000000000000aa";

  it("thay marker mention bằng @tên từ mentions[].label; @all → @tất cả", () => {
    const text = renderMessagePreview(
      {
        content: `Chào @{u:${USER}} và @{all} nhé`,
        mentions: [{ type: "USER", targetId: USER, label: "An" }],
        attachments: [],
      },
      100
    );
    expect(text).toBe("Chào @An và @tất cả nhé");
  });

  it("gộp xuống dòng thành khoảng trắng, cắt theo grapheme và thêm …", () => {
    expect(renderMessagePreview({ content: "a\n\n b", mentions: [], attachments: [] }, 100)).toBe("a b");
    expect(truncateGraphemes("abcdef", 3)).toBe("abc…");
    expect(truncateGraphemes("👨‍👩‍👧‍👦👨‍👩‍👧‍👦👨‍👩‍👧‍👦", 2)).toBe("👨‍👩‍👧‍👦👨‍👩‍👧‍👦…");
  });

  it("tin chỉ có tệp → placeholder theo loại", () => {
    const att = (kind: string, name = "f") => ({ content: null, mentions: [], attachments: [{ kind, name }] });
    expect(renderMessagePreview(att("IMAGE"), 100)).toBe("[Ảnh]");
    expect(renderMessagePreview(att("VIDEO"), 100)).toBe("[Video]");
    expect(renderMessagePreview(att("VOICE"), 100)).toBe("[Tin nhắn thoại]");
    expect(renderMessagePreview(att("FILE", "bao-cao.pdf"), 100)).toBe("[Tệp] bao-cao.pdf");
  });

  it("không nội dung, không tệp → chuỗi rỗng", () => {
    expect(renderMessagePreview({ content: null, mentions: [], attachments: [] }, 100)).toBe("");
  });
});
