/**
 * Unit — `ChannelService.list()` gắn `voice` (số người trong phòng thoại) vào kênh VOICE qua cổng
 * `shared/ports/channel-voice-activity.port` (p2-03 README §1: "số người trong phòng hiện ở danh sách kênh").
 * Không import `modules/calls` — cổng do `registerCallsModule()` đăng ký; ở đây dùng bản giả.
 */
jest.mock("../../../infrastructure/database", () => ({
  prisma: { workspace: { findUnique: jest.fn() }, workspaceMembership: { findMany: jest.fn().mockResolvedValue([]) } },
  withTransaction: jest.fn(),
}));

import { ChannelService } from "../services/channel.service";
import { InMemoryChannelRepository } from "../repositories/channel.repository.inmemory";
import { InMemoryChannelMembershipRepository } from "../repositories/channel-membership.repository.inmemory";
import { InMemoryChannelGrantRepository } from "../repositories/channel-grant.repository.inmemory";
import { clearChannelVoiceActivityReader, registerChannelVoiceActivityReader } from "../../../shared/ports/channel-voice-activity.port";
import type { Channel, ChannelMembership } from "../entities/channel.interface";

function ch(over: Partial<Channel>): Channel {
  return {
    id: "c",
    workspaceId: "ws1",
    name: "K",
    normalizedName: "k",
    description: null,
    type: "TEXT",
    visibility: "PUBLIC",
    postingPolicy: "MEMBERS",
    status: "ACTIVE",
    archiveReason: null,
    archivedAt: null,
    archivedBy: null,
    isDefault: false,
    position: 0,
    lastSeq: 0,
    lastMessageAt: null,
    lastMessageId: null,
    memberCount: 1,
    createdBy: "u0",
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

function member(channelId: string): ChannelMembership {
  return { id: `m-${channelId}`, channelId, workspaceId: "ws1", userId: "u1", notifyMode: "INHERIT", pinned: false, position: null, joinedAt: new Date(), updatedAt: new Date() };
}

describe("ChannelService.list — voice activity (p2-03)", () => {
  afterEach(() => clearChannelVoiceActivityReader());

  function build() {
    const channels = new InMemoryChannelRepository();
    const memberships = new InMemoryChannelMembershipRepository();
    channels.seed(ch({ id: "v-busy", name: "Phòng A", normalizedName: "phong a", type: "VOICE" }));
    channels.seed(ch({ id: "v-empty", name: "Phòng B", normalizedName: "phong b", type: "VOICE" }));
    channels.seed(ch({ id: "t1", name: "Chat", normalizedName: "chat", type: "TEXT" }));
    channels.seed(ch({ id: "v-discover", name: "Phòng C", normalizedName: "phong c", type: "VOICE" }));
    for (const id of ["v-busy", "v-empty", "t1"]) memberships.seed(member(id));
    return new ChannelService(channels, memberships, new InMemoryChannelGrantRepository());
  }

  it("kênh VOICE đang có người mang `voice {callId,count}` ở CẢ danh sách đã vào lẫn khám phá; kênh trống/TEXT thì không; mỗi danh sách một lượt đọc", async () => {
    const activityOf = jest.fn().mockResolvedValue(
      new Map([
        ["v-busy", { callId: "call1", count: 3 }],
        ["v-discover", { callId: "call2", count: 1 }],
      ])
    );
    registerChannelVoiceActivityReader({ activityOf });

    const { joined, discoverable } = await build().list("u1", "ws1", { include: "all", status: "ACTIVE" });
    expect(joined.find((c) => c.id === "v-busy")!.voice).toEqual({ callId: "call1", count: 3 });
    expect(joined.find((c) => c.id === "v-empty")!.voice).toBeUndefined();
    expect(joined.find((c) => c.id === "t1")!.voice).toBeUndefined();
    expect(discoverable.find((c) => c.id === "v-discover")!.voice).toEqual({ callId: "call2", count: 1 });
    // Chỉ truyền id kênh VOICE, mỗi danh sách (đã vào / khám phá) đúng một lượt.
    expect(activityOf.mock.calls.map((c) => [...(c[0] as string[])].sort())).toEqual([["v-busy", "v-empty"], ["v-discover"]]);
  });

  it("cổng chưa đăng ký hoặc lỗi → danh sách vẫn trả bình thường, không có `voice`", async () => {
    const service = build();
    const plain = await service.list("u1", "ws1", { include: "joined", status: "ACTIVE" });
    expect(plain.joined.every((c) => c.voice === undefined)).toBe(true);

    registerChannelVoiceActivityReader({ activityOf: jest.fn().mockRejectedValue(new Error("db lỗi")) });
    const failing = await service.list("u1", "ws1", { include: "joined", status: "ACTIVE" });
    expect(failing.joined).toHaveLength(3);
    expect(failing.joined.every((c) => c.voice === undefined)).toBe(true);
  });

  it("kênh đã lưu trữ không hỏi cổng (không có phòng đang chạy)", async () => {
    const activityOf = jest.fn().mockResolvedValue(new Map());
    registerChannelVoiceActivityReader({ activityOf });
    const channels = new InMemoryChannelRepository();
    const memberships = new InMemoryChannelMembershipRepository();
    channels.seed(ch({ id: "v-old", type: "VOICE", status: "ARCHIVED" }));
    memberships.seed(member("v-old"));
    const { joined } = await new ChannelService(channels, memberships, new InMemoryChannelGrantRepository()).list("u1", "ws1", { include: "joined", status: "ARCHIVED" });
    expect(joined).toHaveLength(1);
    expect(activityOf).not.toHaveBeenCalled();
  });
});
