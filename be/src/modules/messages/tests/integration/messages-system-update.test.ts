/**
 * Integration (Mongo memory replset) — sửa TẠI CHỖ tin hệ thống (p2-06: thẻ `MEETING_RECAP` công bố lại, thẻ `MEETING_STARTED` → đã kết thúc): `SystemMessageService.updatePayload`
 * tăng `version`, ghi outbox `message.updated` (reason `SYSTEM_PAYLOAD`) và processor `message.events` phát `message:updated` KÈM `systemType/systemPayload` để client vẽ lại thẻ.
 * Không cần Redis/BullMQ thật: `registerJob` bị mock để lấy lại processor, `emitToRoom` bị mock để bắt payload.
 */
type Processor = (job: { data: unknown }) => Promise<unknown>;
const mockRegistered: Array<[string, string, Processor]> = [];
jest.mock("../../../../infrastructure/queue", () => {
  const actual = jest.requireActual("../../../../infrastructure/queue");
  return {
    ...actual,
    registerJob: (queue: string, jobName: string, fn: Processor) => {
      mockRegistered.push([queue, jobName, fn]);
    },
  };
});
jest.mock("../../../../infrastructure/queue/outbox/outbox.writer", () => ({
  ...jest.requireActual("../../../../infrastructure/queue/outbox/outbox.writer"),
  outboxSignal: jest.fn().mockResolvedValue(undefined),
}));
const mockEmitToRoom = jest.fn();
jest.mock("../../../../infrastructure/socket/socket.emit", () => ({
  ...jest.requireActual("../../../../infrastructure/socket/socket.emit"),
  emitToRoom: (...args: unknown[]) => mockEmitToRoom(...args),
}));
jest.mock("../../../../infrastructure/redis", () => ({ redis: { connect: jest.fn(), disconnect: jest.fn(), get: jest.fn(), set: jest.fn(), del: jest.fn(), getClient: jest.fn() } }));

import { newObjectId } from "../../../../core/utils/object-id";
import { prisma } from "../../../../infrastructure/database";
import { SocketEvent } from "../../../../infrastructure/socket/socket.events";
import "../../events/message.outbox-handlers"; // side-effect: đăng ký processor `message.events`
import { createSystemMessageService, registerMessageScope, type MessageScope } from "../../public";
import { withTransaction } from "../../../../infrastructure/database";

const scopeId = newObjectId();
const fakeScope = {
  onMessageCommitted: () => Promise.resolve(),
  contentRoom: (id: string) => `conv:${id}`,
} as unknown as MessageScope;

const meetingId = newObjectId();
const recapId = newObjectId();
const payload = (over: Record<string, unknown> = {}) => ({ meetingId, recapId, title: "Họp tuần", excerpt: "Bản đầu", attachmentCount: 0, publishedVersion: 2, ...over });

describe("SystemMessageService.updatePayload — sửa thẻ hệ thống tại chỗ", () => {
  const svc = createSystemMessageService();
  const dedupeKey = `sys:meeting-recap:${meetingId}`;

  beforeAll(() => {
    registerMessageScope("CONVERSATION", fakeScope);
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: "Message" } });
    await prisma.message.deleteMany({ where: { scopeType: "CONVERSATION", scopeId } });
    await prisma.counter.deleteMany({ where: { key: { startsWith: `msg:CONVERSATION:${scopeId}` } } });
  });

  it("chưa có tin → null (caller tự post); có tin → sửa payload, version + 1, outbox message.updated SYSTEM_PAYLOAD; processor phát message:updated kèm systemType/systemPayload", async () => {
    const input = { dedupeKey, systemType: "MEETING_RECAP" as const, payload: payload() };
    expect(await svc.updatePayload(input)).toBeNull();

    const posted = await svc.post({ scopeType: "CONVERSATION", scopeId, workspaceId: null, ...input });
    expect(posted).toMatchObject({ kind: "SYSTEM", systemType: "MEETING_RECAP", version: 1 });

    const updated = await svc.updatePayload({ ...input, payload: payload({ excerpt: "Bản mới", attachmentCount: 2, publishedVersion: 4 }) });
    expect(updated).toMatchObject({ id: posted.id, version: 2, systemPayload: expect.objectContaining({ excerpt: "Bản mới", attachmentCount: 2, publishedVersion: 4 }) });
    const row = await prisma.message.findUniqueOrThrow({ where: { id: posted.id } });
    expect(row.version).toBe(2);
    expect(row.systemPayload).toMatchObject({ excerpt: "Bản mới", attachmentCount: 2 });
    const event = await prisma.outboxEvent.findFirstOrThrow({ where: { type: "message.updated", aggregateId: posted.id } });
    expect(event).toMatchObject({ queue: "notifications", jobName: "message.events", dedupeKey: `message.updated:message:${posted.id}:v2` });
    expect(event.payload).toMatchObject({ event: "updated", messageId: posted.id, reason: "SYSTEM_PAYLOAD" });

    const processor = mockRegistered.find(([q, j]) => q === "notifications" && j === "message.events")![2];
    await processor({ data: event.payload });
    expect(mockEmitToRoom).toHaveBeenCalledWith(
      `conv:${scopeId}`,
      SocketEvent.MESSAGE_UPDATED,
      expect.objectContaining({ id: posted.id, version: 2, reason: "SYSTEM_PAYLOAD", systemType: "MEETING_RECAP", systemPayload: expect.objectContaining({ excerpt: "Bản mới", publishedVersion: 4 }) })
    );
  });

  it("từ chối payload sai schema (ném lỗi, không ghi); khác systemType hoặc tin đã bị gỡ → null", async () => {
    await expect(svc.updatePayload({ dedupeKey, systemType: "MEETING_RECAP", payload: { meetingId: "khong-phai-objectid" } })).rejects.toThrow(); // ZodError như `post()` — payload sai không bao giờ được ghi
    expect(await svc.updatePayload({ dedupeKey, systemType: "MEETING_STARTED", payload: { meetingId, title: "x" } })).toBeNull();

    const other = `sys:tombstone:${newObjectId()}`;
    const posted = await svc.post({ scopeType: "CONVERSATION", scopeId, workspaceId: null, dedupeKey: other, systemType: "MEETING_STARTED", payload: { meetingId, title: "Họp" } });
    await withTransaction(async (tx) => {
      await tx.message.update({ where: { id: posted.id }, data: { deletedAt: new Date() } });
    });
    expect(await svc.updatePayload({ dedupeKey: other, systemType: "MEETING_STARTED", payload: { meetingId, title: "Họp", durationSec: 60 } })).toBeNull();
  });

  it("thẻ họp đã bắt đầu → kết thúc: payload nhận thêm endedAt + durationSec (schema cũ chỉ meetingId + title vẫn hợp lệ)", async () => {
    const key = `sys:meeting-started:${newObjectId()}`;
    const posted = await svc.post({ scopeType: "CONVERSATION", scopeId, workspaceId: null, dedupeKey: key, systemType: "MEETING_STARTED", payload: { meetingId, title: "Họp" } });
    expect(posted.systemPayload).toEqual({ meetingId, title: "Họp" });
    const endedAt = new Date("2026-09-25T10:00:00.000Z");
    const closed = await svc.updatePayload({ dedupeKey: key, systemType: "MEETING_STARTED", payload: { meetingId, title: "Họp", endedAt, durationSec: 2700 } });
    expect(closed?.systemPayload).toMatchObject({ meetingId, title: "Họp", durationSec: 2700 });
    expect((await prisma.message.findUniqueOrThrow({ where: { id: posted.id } })).systemPayload).toMatchObject({ endedAt: endedAt.toISOString(), durationSec: 2700 });
  });
});
