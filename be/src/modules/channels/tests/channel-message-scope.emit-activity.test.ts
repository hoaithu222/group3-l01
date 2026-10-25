/**
 * Unit — `ChannelMessageScopeAdapter#emitActivity()` (CH-09, README p1-03 §8): sự kiện
 * `channel:activity` của kênh PRIVATE KHÔNG bao giờ tới room `ws:{workspaceId}` — chỉ
 * unicast `user:{id}` cho từng người có grant (người được nhắc nhận bản `mentionMe:true`);
 * kênh PUBLIC broadcast `ws:{id}` (không liệt kê từng thành viên). Payload không có nội dung tin.
 * (Phần socket thật client-nhận ở `tests/integration/channels-realtime.test.ts`.)
 */
const mockChannelFindUnique = jest.fn();
const mockGrantFindMany = jest.fn();
const mockMembershipFindMany = jest.fn();
jest.mock("../../../infrastructure/database", () => ({
  prisma: {
    channel: { findUnique: (...a: unknown[]) => mockChannelFindUnique(...a) },
    // p3-04 — kênh PUBLIC còn phát riêng cho KHÁCH được chỉ định (khách không ở room ws:{id}).
    channelGrant: { findMany: (...a: unknown[]) => mockGrantFindMany(...a) },
    workspaceMembership: { findMany: (...a: unknown[]) => mockMembershipFindMany(...a) },
  },
}));

const mockEmitToRoom = jest.fn();
const mockEmitToUsers = jest.fn();
jest.mock("../../../infrastructure/socket/socket.emit", () => ({
  emitToRoom: (...a: unknown[]) => mockEmitToRoom(...a),
  emitToUsers: (...a: unknown[]) => mockEmitToUsers(...a),
}));
jest.mock("../../../infrastructure/socket", () => ({
  ROOM: { workspace: (id: string) => `ws:${id}`, channel: (id: string) => `ch:${id}` },
}));
jest.mock("../../../core/permission", () => ({ permissionService: {} }));

import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import { ChannelMessageScopeAdapter } from "../services/channel-message-scope.adapter";
import type { IChannelGrantRepository } from "../repositories/channel-grant.repository.interface";
import type { MessageActivityInfo } from "../../messages/public";

const WS = "a1".repeat(12);
const CH = "c1".repeat(12);
const G1 = "b1".repeat(12);
const G2 = "b2".repeat(12);
const G3 = "b3".repeat(12);
const OUTSIDER = "b9".repeat(12);

const info = (mentions: MessageActivityInfo["mentions"] = []): MessageActivityInfo => ({
  messageId: "d1".repeat(12),
  seq: 7,
  createdAt: new Date("2026-09-19T03:00:00.000Z"),
  kind: "USER",
  authorId: G1,
  mentions,
});

function adapter(grantUserIds: string[]) {
  const listByChannel = jest.fn().mockResolvedValue(grantUserIds.map((userId) => ({ grant: { userId } })));
  const grantRepo = { listByChannel } as unknown as IChannelGrantRepository;
  return { listByChannel, adapter: new ChannelMessageScopeAdapter(grantRepo) };
}

// `seq`/`threadId`/`authorId` là phần app DỰA VÀO để không tự cộng chưa đọc cho tin của chính mình và để chống cộng
// trùng (be.md p1-03 §6; xem docstring `emitActivity`). `lastSeq` giữ tên cũ p1-04, cùng giá trị với `seq`.
const BASE = {
  v: 1,
  channelId: CH,
  workspaceId: WS,
  seq: 7,
  threadId: null,
  authorId: G1,
  lastSeq: 7,
  lastMessageAt: new Date("2026-09-19T03:00:00.000Z"),
};

describe("ChannelMessageScopeAdapter#emitActivity() — CH-09", () => {
  beforeEach(() => {
    // Mặc định: kênh không có khách nào được chỉ định.
    mockGrantFindMany.mockResolvedValue([]);
    mockMembershipFindMany.mockResolvedValue([]);
  });

  it("p3-04 — kênh PUBLIC: khách ĐƯỢC CHỈ ĐỊNH (còn hạn) nhận unicast user:{id} (người được nhắc nhận mentionMe:true); khách hết hạn/không grant thì không", async () => {
    mockChannelFindUnique.mockResolvedValue({ workspaceId: WS, visibility: "PUBLIC" });
    const GUEST1 = "e1".repeat(12);
    const GUEST2 = "e2".repeat(12);
    const EXPIRED = "e3".repeat(12);
    mockGrantFindMany.mockResolvedValue([{ userId: GUEST1 }, { userId: GUEST2 }, { userId: EXPIRED }]);
    mockMembershipFindMany.mockResolvedValue([
      { userId: GUEST1, expiresAt: new Date(Date.now() + 3600_000) },
      { userId: GUEST2, expiresAt: new Date(Date.now() + 3600_000) },
      { userId: EXPIRED, expiresAt: new Date(Date.now() - 1000) },
    ]);

    await adapter([]).adapter.emitActivity(CH, info([{ type: "USER", targetId: GUEST2 }]));

    expect(mockEmitToRoom).toHaveBeenCalledWith(`ws:${WS}`, SocketEvent.CHANNEL_ACTIVITY, { ...BASE, mentionMe: false });
    expect(mockEmitToUsers).toHaveBeenCalledWith([GUEST1], SocketEvent.CHANNEL_ACTIVITY, { ...BASE, mentionMe: false });
    expect(mockEmitToUsers).toHaveBeenCalledWith([GUEST2], SocketEvent.CHANNEL_ACTIVITY, { ...BASE, mentionMe: true });
    const recipients = mockEmitToUsers.mock.calls.flatMap((c) => c[0] as string[]);
    expect(recipients).not.toContain(EXPIRED);
  });

  it("kênh PRIVATE: KHÔNG emit tới room ws:{id}; unicast từng grantee, người được nhắc nhận mentionMe:true", async () => {
    mockChannelFindUnique.mockResolvedValue({ workspaceId: WS, visibility: "PRIVATE" });
    const { adapter: a } = adapter([G1, G2, G3]);

    await a.emitActivity(CH, info([{ type: "USER", targetId: G2 }]));

    expect(mockEmitToRoom).not.toHaveBeenCalled(); // kể cả room ws:{WS} lẫn ch:{CH}
    expect(mockEmitToUsers).toHaveBeenCalledTimes(2);
    expect(mockEmitToUsers).toHaveBeenCalledWith([G1, G3], SocketEvent.CHANNEL_ACTIVITY, { ...BASE, mentionMe: false });
    expect(mockEmitToUsers).toHaveBeenCalledWith([G2], SocketEvent.CHANNEL_ACTIVITY, { ...BASE, mentionMe: true });
    const recipients = mockEmitToUsers.mock.calls.flatMap((c) => c[0] as string[]);
    expect(recipients.sort()).toEqual([G1, G2, G3].sort());
    expect(recipients).not.toContain(OUTSIDER);
  });

  it("kênh PRIVATE không ai được nhắc: đúng 1 lần emitToUsers cho toàn bộ grantee, mentionMe:false", async () => {
    mockChannelFindUnique.mockResolvedValue({ workspaceId: WS, visibility: "PRIVATE" });
    await adapter([G1, G2]).adapter.emitActivity(CH, info());

    expect(mockEmitToRoom).not.toHaveBeenCalled();
    expect(mockEmitToUsers).toHaveBeenCalledTimes(1);
    expect(mockEmitToUsers).toHaveBeenCalledWith([G1, G2], SocketEvent.CHANNEL_ACTIVITY, { ...BASE, mentionMe: false });
  });

  it("kênh PRIVATE: người được nhắc KHÔNG có grant (payload giả) không nhận gì; chỉ USER được tính, ALL bị bỏ qua, id trùng gộp 1", async () => {
    mockChannelFindUnique.mockResolvedValue({ workspaceId: WS, visibility: "PRIVATE" });
    await adapter([G1, G2]).adapter.emitActivity(
      CH,
      info([{ type: "USER", targetId: OUTSIDER }, { type: "ALL", targetId: null }, { type: "USER", targetId: G2 }, { type: "USER", targetId: G2 }])
    );
    const recipients = mockEmitToUsers.mock.calls.flatMap((c) => c[0] as string[]);
    expect(recipients).not.toContain(OUTSIDER);
    expect(mockEmitToUsers).toHaveBeenCalledWith([G2], SocketEvent.CHANNEL_ACTIVITY, { ...BASE, mentionMe: true });
    expect(mockEmitToUsers).toHaveBeenCalledWith([G1], SocketEvent.CHANNEL_ACTIVITY, { ...BASE, mentionMe: false });
  });

  it("kênh PUBLIC: broadcast room ws:{workspaceId} (không dò từng thành viên); người được nhắc nhận thêm bản mentionMe:true", async () => {
    mockChannelFindUnique.mockResolvedValue({ workspaceId: WS, visibility: "PUBLIC" });
    const { adapter: a, listByChannel } = adapter([]);

    await a.emitActivity(CH, info([{ type: "USER", targetId: G3 }]));

    expect(mockEmitToRoom).toHaveBeenCalledTimes(1);
    expect(mockEmitToRoom).toHaveBeenCalledWith(`ws:${WS}`, SocketEvent.CHANNEL_ACTIVITY, { ...BASE, mentionMe: false });
    expect(mockEmitToUsers).toHaveBeenCalledWith([G3], SocketEvent.CHANNEL_ACTIVITY, { ...BASE, mentionMe: true });
    expect(listByChannel).not.toHaveBeenCalled();
  });

  it("kênh PUBLIC không ai được nhắc: chỉ emitToRoom, không emitToUsers", async () => {
    mockChannelFindUnique.mockResolvedValue({ workspaceId: WS, visibility: "PUBLIC" });
    await adapter([]).adapter.emitActivity(CH, info());
    expect(mockEmitToRoom).toHaveBeenCalledTimes(1);
    expect(mockEmitToUsers).not.toHaveBeenCalled();
  });

  it("payload KHÔNG chứa nội dung/preview/tên tác giả — chỉ id, seq, mốc thời gian và authorId", async () => {
    mockChannelFindUnique.mockResolvedValue({ workspaceId: WS, visibility: "PUBLIC" });
    await adapter([]).adapter.emitActivity(CH, info());
    const payload = mockEmitToRoom.mock.calls[0][2] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual([
      "authorId",
      "channelId",
      "lastMessageAt",
      "lastSeq",
      "mentionMe",
      "seq",
      "threadId",
      "v",
      "workspaceId",
    ]);
    // Không có chữ nào của tin: nội dung/preview/tên người gửi vẫn nằm ngoài payload.
    expect(payload).not.toHaveProperty("content");
    expect(payload).not.toHaveProperty("preview");
    expect(payload).not.toHaveProperty("authorName");
  });

  it("kênh không còn tồn tại → không emit gì", async () => {
    mockChannelFindUnique.mockResolvedValue(null);
    await adapter([G1]).adapter.emitActivity(CH, info());
    expect(mockEmitToRoom).not.toHaveBeenCalled();
    expect(mockEmitToUsers).not.toHaveBeenCalled();
  });
});
