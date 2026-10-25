/**
 * Unit — controller factory của `chat-extensions` (api-patterns.md): chỉ parse request → gọi service → trả response chuẩn. Kiểm mã HTTP theo be.md §4: tạo khảo sát 201 / replay 200 kèm
 * `Idempotent-Replayed`, xoá tin hẹn/nhắc 204, to-task 201 hoặc 200 (replay), phân trang cursor, `serverNow` trên khảo sát, response tạo khảo sát = MessageView + `poll`.
 */
import type { Request, Response } from "express";
import type { ChatExtensionsContainer } from "../chat-extensions.container";
import { createMessageConversionController } from "../controllers/message-conversion.controller";
import { createMessageReminderController } from "../controllers/message-reminder.controller";
import { createPollController } from "../controllers/poll.controller";
import { createScheduledMessageController } from "../controllers/scheduled-message.controller";

interface Sent {
  status: number;
  body?: { success: boolean; data?: unknown; meta?: unknown; message?: string };
  headers: Record<string, string>;
  ended: boolean;
}

function fakeRes(): { res: Response; sent: Sent } {
  const sent: Sent = { status: 0, headers: {}, ended: false };
  const res = {
    status(code: number) {
      sent.status = code;
      return res;
    },
    json(body: Sent["body"]) {
      sent.body = body;
      return res;
    },
    end() {
      sent.ended = true;
      return res;
    },
    setHeader(name: string, value: string) {
      sent.headers[name] = value;
      return res;
    },
  } as unknown as Response;
  return { res, sent };
}

const user = { id: "u1".repeat(12), email: "u@e.com" };
const req = (over: Partial<{ params: Record<string, string>; body: unknown; query: unknown; headers: Record<string, string> }> = {}): Request =>
  ({ user, params: over.params ?? {}, body: over.body ?? {}, query: over.query ?? {}, header: (name: string) => over.headers?.[name] }) as unknown as Request;

/** `catchAsync` trả hàm không-async (bọc Promise) — chờ vi tác vụ để handler xong. */
const run = async (handler: (req: Request, res: Response, next: () => void) => unknown, request: Request, res: Response): Promise<void> => {
  await new Promise<void>((resolve) => {
    const result = handler(request, res, () => resolve());
    void Promise.resolve(result).then(() => setImmediate(resolve));
  });
};

const pollView = { id: "p1", version: 3, options: [], status: "OPEN" };

describe("poll.controller", () => {
  const polls = { create: jest.fn(), get: jest.fn(), vote: jest.fn(), unvote: jest.fn(), close: jest.fn(), voters: jest.fn() };
  // `resetMocks: true` (jest.config) xoá cài đặt của mock sau MỖI test — gán lại trong beforeEach.
  beforeEach(() => {
    for (const name of ["get", "vote", "unvote", "close"] as const) polls[name].mockResolvedValue(pollView);
  });
  const controller = createPollController({ polls } as unknown as Pick<ChatExtensionsContainer, "polls">);

  it("tạo khảo sát: 201 với MessageView + poll (kèm serverNow); replay → 200 + Idempotent-Replayed", async () => {
    polls.create.mockResolvedValueOnce({ message: { id: "m1", kind: "POLL" }, poll: pollView, replayed: false });
    let out = fakeRes();
    await run(controller.create, req({ params: { scopeType: "CHANNEL", scopeId: "c1" }, body: { question: "?" } }), out.res);
    expect(out.sent.status).toBe(201);
    expect(out.sent.body?.data).toMatchObject({ id: "m1", kind: "POLL", poll: { id: "p1", serverNow: expect.any(String) } });
    expect(polls.create).toHaveBeenCalledWith(user, "CHANNEL", "c1", { question: "?" });

    polls.create.mockResolvedValueOnce({ message: { id: "m1", kind: "POLL" }, poll: pollView, replayed: true });
    out = fakeRes();
    await run(controller.create, req({ params: { scopeType: "CHANNEL", scopeId: "c1" } }), out.res);
    expect(out.sent.status).toBe(200);
    expect(out.sent.headers["Idempotent-Replayed"]).toBe("true");
  });

  it("get/vote/unvote/close: 200 kèm serverNow; vote truyền đúng optionIds", async () => {
    for (const [name, request] of [
      ["get", req({ params: { pollId: "p1" } })],
      ["vote", req({ params: { pollId: "p1" }, body: { optionIds: ["a"] } })],
      ["unvote", req({ params: { pollId: "p1" } })],
      ["close", req({ params: { pollId: "p1" } })],
    ] as const) {
      const out = fakeRes();
      await run(controller[name], request, out.res);
      expect(out.sent.status).toBe(200);
      expect(out.sent.body?.data).toMatchObject({ id: "p1", serverNow: expect.any(String) });
    }
    expect(polls.vote).toHaveBeenCalledWith(user, "p1", ["a"]);
  });

  it("voters: phản hồi cursor { data, meta { nextCursor, hasMore, limit } }", async () => {
    polls.voters.mockResolvedValue({ data: [{ id: "u2" }], nextCursor: "abc", hasMore: true, limit: 50 });
    const out = fakeRes();
    await run(controller.voters, req({ params: { pollId: "p1" }, query: { optionId: "a", limit: 50 } }), out.res);
    expect(out.sent.status).toBe(200);
    expect(out.sent.body).toMatchObject({ data: [{ id: "u2" }], meta: { nextCursor: "abc", hasMore: true, limit: 50 } });
  });
});

describe("scheduled-message.controller", () => {
  const scheduled = { create: jest.fn(), listMine: jest.fn(), update: jest.fn(), cancel: jest.fn(), sendNow: jest.fn() };
  beforeEach(() => scheduled.cancel.mockResolvedValue(undefined));
  const controller = createScheduledMessageController({ scheduled } as unknown as Pick<ChatExtensionsContainer, "scheduled">);

  it("tạo 201; sửa 200; huỷ 204 không body; gửi ngay 200; danh sách cursor", async () => {
    scheduled.create.mockResolvedValue({ id: "s1", status: "PENDING" });
    let out = fakeRes();
    await run(controller.create, req({ params: { scopeType: "CONVERSATION", scopeId: "v1" }, body: { content: "x" } }), out.res);
    expect(out.sent.status).toBe(201);
    expect(scheduled.create).toHaveBeenCalledWith(user, "CONVERSATION", "v1", { content: "x" });

    scheduled.update.mockResolvedValue({ id: "s1", version: 2 });
    out = fakeRes();
    await run(controller.update, req({ params: { id: "s1" }, body: { expectedVersion: 1, content: "y" } }), out.res);
    expect(out.sent.status).toBe(200);

    out = fakeRes();
    await run(controller.cancel, req({ params: { id: "s1" } }), out.res);
    expect(out.sent.status).toBe(204);
    expect(out.sent.ended).toBe(true);
    expect(out.sent.body).toBeUndefined();

    scheduled.sendNow.mockResolvedValue({ scheduledMessage: { id: "s1" }, message: { id: "m9" } });
    out = fakeRes();
    await run(controller.sendNow, req({ params: { id: "s1" } }), out.res);
    expect(out.sent.body?.data).toEqual({ scheduledMessage: { id: "s1" }, message: { id: "m9" } });

    scheduled.listMine.mockResolvedValue({ data: [], nextCursor: null, hasMore: false, limit: 30 });
    out = fakeRes();
    await run(controller.listMine, req({ query: { status: "PENDING", limit: 30 } }), out.res);
    expect(out.sent.body).toMatchObject({ data: [], meta: { nextCursor: null, hasMore: false, limit: 30 } });
  });
});

describe("message-reminder.controller", () => {
  const reminders = { create: jest.fn(), listMine: jest.fn(), cancel: jest.fn() };
  beforeEach(() => {
    reminders.create.mockResolvedValue({ id: "r1" });
    reminders.listMine.mockResolvedValue({ data: [], nextCursor: null, hasMore: false, limit: 30 });
    reminders.cancel.mockResolvedValue(undefined);
  });
  const controller = createMessageReminderController({ reminders } as unknown as Pick<ChatExtensionsContainer, "reminders">);

  it("đặt nhắc 201; danh sách cursor; xoá 204", async () => {
    let out = fakeRes();
    await run(controller.create, req({ params: { messageId: "m1" }, body: { remindAt: "x", timezone: "UTC" } }), out.res);
    expect(out.sent.status).toBe(201);
    expect(reminders.create).toHaveBeenCalledWith(user, "m1", { remindAt: "x", timezone: "UTC" });
    out = fakeRes();
    await run(controller.listMine, req({ query: { status: "PENDING" } }), out.res);
    expect(out.sent.body).toMatchObject({ meta: { hasMore: false } });
    out = fakeRes();
    await run(controller.cancel, req({ params: { id: "r1" } }), out.res);
    expect(out.sent.status).toBe(204);
  });
});

describe("message-conversion.controller", () => {
  const conversion = { toTask: jest.fn(), toResource: jest.fn() };
  const controller = createMessageConversionController({ conversion } as unknown as Pick<ChatExtensionsContainer, "conversion">);

  it("to-task: 201 khi tạo mới (khoá Idempotency-Key chuyển xuống service); 200 + Idempotent-Replayed khi cùng khoá đã tạo", async () => {
    conversion.toTask.mockResolvedValueOnce({ task: { id: "t1" }, created: true, sourceRef: { kind: "TASK", refId: "t1" } });
    let out = fakeRes();
    await run(controller.toTask, req({ params: { messageId: "m1" }, body: { boardId: "b" }, headers: { "Idempotency-Key": "key-12345678" } }), out.res);
    expect(out.sent.status).toBe(201);
    expect(out.sent.body?.data).toEqual({ task: { id: "t1" }, sourceRef: { kind: "TASK", refId: "t1" } });
    expect(conversion.toTask).toHaveBeenCalledWith(user, "m1", { boardId: "b" }, "key-12345678");

    conversion.toTask.mockResolvedValueOnce({ task: { id: "t1" }, created: false, sourceRef: { kind: "TASK", refId: "t1" } });
    out = fakeRes();
    await run(controller.toTask, req({ params: { messageId: "m1" }, headers: { "Idempotency-Key": "key-12345678" } }), out.res);
    expect(out.sent.status).toBe(200);
    expect(out.sent.headers["Idempotent-Replayed"]).toBe("true");
  });

  it("to-resource: 201 { resources, sourceRefs }", async () => {
    conversion.toResource.mockResolvedValue({ resources: [{ id: "r1" }], sourceRefs: [{ kind: "RESOURCE", refId: "r1" }] });
    const out = fakeRes();
    await run(controller.toResource, req({ params: { messageId: "m1" }, body: { workspaceId: "w" } }), out.res);
    expect(out.sent.status).toBe(201);
    expect(out.sent.body?.data).toEqual({ resources: [{ id: "r1" }], sourceRefs: [{ kind: "RESOURCE", refId: "r1" }] });
  });
});
