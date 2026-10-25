import { LIMITS } from "../../../core/constants/limits";
import { ScopeForbiddenError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { SocketEvent } from "../../../infrastructure/socket/socket.events";
import {
  InMemoryAnnouncementLookupRepository,
  InMemoryAnnouncementRepository,
} from "../repositories/announcement.repository.inmemory";
import { AnnouncementReceiptsService } from "../services/announcement-receipts.service";
import { AnnouncementService, type AnnouncementEmitter } from "../services/announcement.service";

const CHANNEL = "c".repeat(24);
const WS = "w".repeat(24);
const MSG = "a".repeat(24);
const ADMIN: AuthUser = { id: "1".repeat(24), email: "admin@e.com", role: "user" };
const MEMBER: AuthUser = { id: "2".repeat(24), email: "m@e.com", role: "user" };
const OTHER: AuthUser = { id: "3".repeat(24), email: "o@e.com", role: "user" };
const HOUR = 3600_000;

interface Emitted {
  target: string;
  event: string;
  payload: Record<string, unknown>;
}

function setup(now = new Date("2026-09-25T00:00:00.000Z")) {
  const repo = new InMemoryAnnouncementRepository();
  const lookup = new InMemoryAnnouncementLookupRepository();
  const clock = { now };
  const emitted: Emitted[] = [];
  const emitter: AnnouncementEmitter = {
    toRoom: (room, event, payload) => void emitted.push({ target: room, event, payload }),
    toUsers: (ids, event, payload) => void emitted.push({ target: ids.join(","), event, payload }),
  };
  // Quyền giả: ADMIN quản lý được; mọi người trong `readers` đọc được; người khác bị chặn (404 = ném lỗi giống assert thật).
  const readers = new Set([ADMIN.id, MEMBER.id]);
  const permissions = {
    async can(user: AuthUser, action: string) {
      return user.id === ADMIN.id ? true : readers.has(user.id) && action === "channel.read";
    },
    async assert(user: AuthUser, action: string) {
      if (!(await this.can(user, action))) throw new ScopeForbiddenError("Không có quyền");
      return { visible: true, role: null, actions: new Set() };
    },
  };
  lookup.channels.set(CHANNEL, { id: CHANNEL, workspaceId: WS, postingPolicy: "ADMINS_ONLY", status: "ACTIVE" });
  lookup.messages.set(MSG, { id: MSG, scopeType: "CHANNEL", scopeId: CHANNEL, workspaceId: WS, threadId: null, kind: "USER", authorId: ADMIN.id, deletedAt: null });
  lookup.names.set(ADMIN.id, "Quản trị");
  lookup.names.set(MEMBER.id, "An");
  lookup.names.set(OTHER.id, "Bình");
  lookup.readers.set(CHANNEL, [ADMIN.id, MEMBER.id, OTHER.id]);

  const service = new AnnouncementService({ repo, lookup, permissions: permissions as never, emitter, now: () => clock.now });
  const receipts = new AnnouncementReceiptsService(repo, lookup, (id) => lookup.channelReaderIds(id), permissions as never);
  return { repo, lookup, service, receipts, emitted, clock, readers };
}

describe("AnnouncementService.create", () => {
  it("tạo yêu cầu: ghi outbox notify + nhắc hạn, phát announcement:updated tới kênh, trả 'created'", async () => {
    const { service, repo, emitted, clock } = setup();
    const deadlineAt = new Date(clock.now.getTime() + 3 * 24 * HOUR);
    const { view, created } = await service.create(ADMIN, MSG, { deadlineAt });

    expect(created).toBe(true);
    expect(view).toMatchObject({ messageId: MSG, channelId: CHANNEL, requestedBy: ADMIN.id, expired: false, confirmedByMe: false, canViewReceipts: true, confirmedCount: 0 });
    expect(repo.requests).toHaveLength(1);
    expect(repo.requests[0]).toMatchObject({ cancelledAt: null, cancelledBy: null });
    expect(repo.events.map((e) => e.jobName)).toEqual(["announcement.notify", "announcement.deadline-remind"]);
    expect(repo.events[0].dedupeKey).toBe(`announcement.notify:msg:${MSG}`);
    expect(repo.events[1].availableAt?.getTime()).toBe(deadlineAt.getTime() - LIMITS.announcement.remindBeforeHours * HOUR);
    expect(emitted).toEqual([
      expect.objectContaining({ target: `ch:${CHANNEL}`, event: SocketEvent.ANNOUNCEMENT_UPDATED, payload: expect.objectContaining({ messageId: MSG, required: true, cancelled: false }) }),
    ]);
  });

  it("không hạn → không lịch nhắc; bấm hai lần → idempotent (created:false, không ghi thêm)", async () => {
    const { service, repo } = setup();
    expect((await service.create(ADMIN, MSG, {})).created).toBe(true);
    expect(repo.events.map((e) => e.jobName)).toEqual(["announcement.notify"]);
    expect((await service.create(ADMIN, MSG, {})).created).toBe(false);
    expect(repo.requests).toHaveLength(1);
    expect(repo.events).toHaveLength(1);
  });

  it("ANN_001: kênh không phải ADMINS_ONLY, tin thuộc thread, tin hội thoại; 404 khi tin đã xoá; CH_004 khi kênh lưu trữ", async () => {
    const { service, lookup } = setup();
    lookup.channels.set(CHANNEL, { id: CHANNEL, workspaceId: WS, postingPolicy: "MEMBERS", status: "ACTIVE" });
    await expect(service.create(ADMIN, MSG, {})).rejects.toMatchObject({ errorCode: "ANN_001", statusCode: 400 });

    lookup.channels.set(CHANNEL, { id: CHANNEL, workspaceId: WS, postingPolicy: "ADMINS_ONLY", status: "ACTIVE" });
    lookup.messages.set(MSG, { ...lookup.messages.get(MSG)!, threadId: "d".repeat(24) });
    await expect(service.create(ADMIN, MSG, {})).rejects.toMatchObject({ errorCode: "ANN_001" });
    lookup.messages.set(MSG, { ...lookup.messages.get(MSG)!, threadId: null, scopeType: "CONVERSATION" });
    await expect(service.create(ADMIN, MSG, {})).rejects.toMatchObject({ errorCode: "ANN_001" });

    lookup.messages.set(MSG, { ...lookup.messages.get(MSG)!, scopeType: "CHANNEL", deletedAt: new Date() });
    await expect(service.create(ADMIN, MSG, {})).rejects.toMatchObject({ statusCode: 404 });
    lookup.messages.set(MSG, { ...lookup.messages.get(MSG)!, deletedAt: null });
    lookup.channels.set(CHANNEL, { id: CHANNEL, workspaceId: WS, postingPolicy: "ADMINS_ONLY", status: "ARCHIVED" });
    await expect(service.create(ADMIN, MSG, {})).rejects.toMatchObject({ errorCode: "CH_004", statusCode: 409 });
  });

  it("chỉ người quản lý kênh tạo được (thành viên thường bị chặn trước khi ghi gì)", async () => {
    const { service, repo } = setup();
    await expect(service.create(MEMBER, MSG, {})).rejects.toBeInstanceOf(ScopeForbiddenError);
    expect(repo.requests).toHaveLength(0);
  });

  it("hạn phải ở tương lai và tối đa deadlineMaxDays ngày", async () => {
    const { service, clock } = setup();
    await expect(service.create(ADMIN, MSG, { deadlineAt: new Date(clock.now.getTime() - 1000) })).rejects.toMatchObject({ statusCode: 400 });
    const tooFar = new Date(clock.now.getTime() + (LIMITS.announcement.deadlineMaxDays + 1) * 24 * HOUR);
    await expect(service.create(ADMIN, MSG, { deadlineAt: tooFar })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("ANN_002: quá perChannelActiveMax yêu cầu còn hiệu lực; yêu cầu đã hết hạn/huỷ không chiếm chỗ", async () => {
    const { service, repo, lookup, clock } = setup();
    for (let i = 0; i < LIMITS.announcement.perChannelActiveMax; i += 1) {
      const id = (i + 1).toString(16).padStart(24, "0");
      lookup.messages.set(id, { ...lookup.messages.get(MSG)!, id });
      await service.create(ADMIN, id, {});
    }
    await expect(service.create(ADMIN, MSG, {})).rejects.toMatchObject({ errorCode: "ANN_002", statusCode: 409 });

    await service.cancel(ADMIN, (1).toString(16).padStart(24, "0")); // nhả một chỗ
    expect((await service.create(ADMIN, MSG, {})).created).toBe(true);
    expect(repo.requests).toHaveLength(LIMITS.announcement.perChannelActiveMax + 1);
    clock.now = new Date(clock.now.getTime() + HOUR);
  });

  it("huỷ rồi tạo lại: khôi phục CÙNG yêu cầu, giữ biên nhận cũ, không thông báo lại toàn kênh", async () => {
    const { service, repo } = setup();
    await service.create(ADMIN, MSG, {});
    await service.confirm(MEMBER, MSG);
    await service.cancel(ADMIN, MSG);
    const again = await service.create(ADMIN, MSG, {});
    expect(again.created).toBe(true);
    expect(repo.requests).toHaveLength(1);
    expect(repo.requests[0].cancelledAt).toBeNull();
    expect(repo.receipts).toHaveLength(1);
    expect(repo.events.filter((e) => e.jobName === "announcement.notify")).toHaveLength(1);
  });
});

describe("AnnouncementService.confirm / cancel / view", () => {
  it("RC-01: xác nhận hai lần → một biên nhận, số đếm không tăng; chỉ lần đầu phát socket", async () => {
    const { service, repo, emitted } = setup();
    await service.create(ADMIN, MSG, {});
    emitted.length = 0;
    const first = await service.confirm(MEMBER, MSG);
    const second = await service.confirm(MEMBER, MSG);
    expect(second.confirmedAt).toEqual(first.confirmedAt);
    expect(repo.receipts).toHaveLength(1);
    expect(repo.requests[0].confirmedCount).toBe(1);
    expect(emitted.map((e) => e.event)).toEqual([SocketEvent.ANNOUNCEMENT_CONFIRMED, SocketEvent.ANNOUNCEMENT_UPDATED]);
    expect(emitted[0]).toMatchObject({ target: ADMIN.id, payload: { messageId: MSG, confirmedCount: 1 } });
    expect(emitted[1]).toMatchObject({ target: MEMBER.id, payload: { confirmedByMe: true } });
  });

  it("ANN_003 (410): yêu cầu đã huỷ hoặc quá hạn không xác nhận được", async () => {
    const { service, clock } = setup();
    await service.create(ADMIN, MSG, { deadlineAt: new Date(clock.now.getTime() + 2 * HOUR) });
    clock.now = new Date(clock.now.getTime() + 3 * HOUR);
    await expect(service.confirm(MEMBER, MSG)).rejects.toMatchObject({ errorCode: "ANN_003", statusCode: 410 });

    const { service: s2 } = setup();
    await s2.create(ADMIN, MSG, {});
    await s2.cancel(ADMIN, MSG);
    await expect(s2.confirm(MEMBER, MSG)).rejects.toMatchObject({ errorCode: "ANN_003", statusCode: 410 });
  });

  it("người không đọc được kênh → bị chặn; không có yêu cầu → 404", async () => {
    const { service } = setup();
    await expect(service.confirm(MEMBER, MSG)).rejects.toMatchObject({ statusCode: 404 });
    await service.create(ADMIN, MSG, {});
    await expect(service.confirm(OTHER, MSG)).rejects.toBeInstanceOf(ScopeForbiddenError);
  });

  it("cancel: người yêu cầu hoặc quản trị; đã huỷ → idempotent (không phát lại); người khác bị chặn", async () => {
    const { service, repo, emitted } = setup();
    await service.create(ADMIN, MSG, {});
    await expect(service.cancel(MEMBER, MSG)).rejects.toBeInstanceOf(ScopeForbiddenError);
    emitted.length = 0;
    const at = await service.cancel(ADMIN, MSG);
    expect(repo.requests[0].cancelledAt).toEqual(at);
    expect(emitted).toEqual([expect.objectContaining({ event: SocketEvent.ANNOUNCEMENT_UPDATED, payload: expect.objectContaining({ required: false, cancelled: true }) })]);
    emitted.length = 0;
    expect(await service.cancel(ADMIN, MSG)).toEqual(at);
    expect(emitted).toEqual([]);
  });

  it("get/list: người thường thấy confirmedByMe nhưng không thấy số liệu; người yêu cầu thấy confirmedCount", async () => {
    const { service } = setup();
    await service.create(ADMIN, MSG, {});
    await service.confirm(MEMBER, MSG);
    const asMember = await service.get(MEMBER, MSG);
    expect(asMember).toMatchObject({ confirmedByMe: true, canViewReceipts: false });
    expect(asMember).not.toHaveProperty("confirmedCount");
    const asAdmin = await service.listByChannel(ADMIN, CHANNEL);
    expect(asAdmin).toHaveLength(1);
    expect(asAdmin[0]).toMatchObject({ confirmedByMe: false, canViewReceipts: true, confirmedCount: 1 });
    await service.cancel(ADMIN, MSG);
    expect(await service.listByChannel(MEMBER, CHANNEL)).toEqual([]);
    await expect(service.get(MEMBER, MSG)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("AnnouncementReceiptsService", () => {
  it("pending = người đọc được kênh − người yêu cầu − đã xác nhận; confirmed hiện người đã xác nhận (RC-02: không tự có biên nhận)", async () => {
    const { service, receipts } = setup();
    await service.create(ADMIN, MSG, {});
    const before = await receipts.list(ADMIN, MSG, { status: "pending", limit: 30 });
    expect(before.data.map((p) => p.userId).sort()).toEqual([MEMBER.id, OTHER.id].sort());
    expect(before.meta).toMatchObject({ confirmedCount: 0, audienceCount: 2 });

    await service.confirm(MEMBER, MSG);
    const pending = await receipts.list(ADMIN, MSG, { status: "pending", limit: 30 });
    expect(pending.data.map((p) => p.userId)).toEqual([OTHER.id]);
    expect(pending.meta).toMatchObject({ confirmedCount: 1, audienceCount: 2 });
    const confirmed = await receipts.list(ADMIN, MSG, { status: "confirmed", limit: 30 });
    expect(confirmed.data).toEqual([expect.objectContaining({ userId: MEMBER.id, name: "An", confirmedAt: expect.any(Date) })]);
  });

  it("người có ảnh → avatarUrl là URL ký sẵn (THUMB) ở cả danh sách chưa/đã xác nhận; chưa có ảnh → null", async () => {
    const { service, receipts, lookup } = setup();
    const assetId = "65f0000000000000000000a7";
    lookup.avatars.set(MEMBER.id, assetId);
    await service.create(ADMIN, MSG, {});
    const pending = await receipts.list(ADMIN, MSG, { status: "pending", limit: 30 });
    expect(pending.data.find((p) => p.userId === MEMBER.id)?.avatarUrl).toContain(`/api/v1/assets/${assetId}/image?v=THUMB`);
    expect(pending.data.find((p) => p.userId === OTHER.id)?.avatarUrl).toBeNull();

    await service.confirm(MEMBER, MSG);
    const confirmed = await receipts.list(ADMIN, MSG, { status: "confirmed", limit: 30 });
    expect(confirmed.data[0]?.avatarUrl).toContain(`/api/v1/assets/${assetId}/image?v=THUMB`);
  });

  it("RC-03: người mất quyền kênh không nằm trong pending/confirmed và không tính vào audienceCount", async () => {
    const { service, receipts, lookup } = setup();
    await service.create(ADMIN, MSG, {});
    await service.confirm(MEMBER, MSG);
    lookup.readers.set(CHANNEL, [ADMIN.id]); // MEMBER và OTHER đều mất quyền
    const pending = await receipts.list(ADMIN, MSG, { status: "pending", limit: 30 });
    expect(pending.data).toEqual([]);
    expect(pending.meta.audienceCount).toBe(0);
    const confirmed = await receipts.list(ADMIN, MSG, { status: "confirmed", limit: 30 });
    expect(confirmed.data).toEqual([]);
  });

  it("chỉ người yêu cầu và quản trị kênh được xem; phân trang pending theo chỉ số", async () => {
    const { service, receipts, lookup } = setup();
    await service.create(ADMIN, MSG, {});
    await expect(receipts.list(MEMBER, MSG, { status: "pending", limit: 30 })).rejects.toBeInstanceOf(ScopeForbiddenError);

    lookup.readers.set(CHANNEL, [ADMIN.id, ...Array.from({ length: 5 }, (_, i) => `${i + 4}`.repeat(24))]);
    const p1 = await receipts.list(ADMIN, MSG, { status: "pending", limit: 2 });
    expect(p1.data).toHaveLength(2);
    expect(p1.meta.hasMore).toBe(true);
    const p2 = await receipts.list(ADMIN, MSG, { status: "pending", limit: 2, cursor: p1.meta.nextCursor! });
    const p3 = await receipts.list(ADMIN, MSG, { status: "pending", limit: 2, cursor: p2.meta.nextCursor! });
    expect([...p1.data, ...p2.data, ...p3.data]).toHaveLength(5);
    expect(new Set([...p1.data, ...p2.data, ...p3.data].map((p) => p.userId)).size).toBe(5);
    expect(p3.meta.hasMore).toBe(false);
  });
});
