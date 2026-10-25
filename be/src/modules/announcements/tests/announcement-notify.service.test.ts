const mockNotify = jest.fn();
jest.mock("../../../infrastructure/database", () => ({
  withTransaction: jest.fn(),
  prisma: {},
}));
jest.mock("../../notifications/public", () => ({
  notify: (...args: unknown[]) => mockNotify(...args),
  registerNotificationType: jest.fn(),
}));

import { withTransaction } from "../../../infrastructure/database";
import { InMemoryAnnouncementLookupRepository, InMemoryAnnouncementRepository } from "../repositories/announcement.repository.inmemory";
import { AnnouncementNotifyService } from "../services/announcement-notify.service";

const CHANNEL = "c".repeat(24);
const WS = "w".repeat(24);
const MSG = "a".repeat(24);
const REQUESTER = "1".repeat(24);
const readers = [REQUESTER, "2".repeat(24), "3".repeat(24), "4".repeat(24)];
const NOW = new Date("2026-09-25T00:00:00.000Z");

function setup(overrides: { deadlineAt?: Date | null; cancelled?: boolean } = {}) {
  const repo = new InMemoryAnnouncementRepository();
  const lookup = new InMemoryAnnouncementLookupRepository();
  lookup.messages.set(MSG, { id: MSG, scopeType: "CHANNEL", scopeId: CHANNEL, workspaceId: WS, threadId: null, kind: "USER", authorId: REQUESTER, deletedAt: null });
  repo.requests.push({
    id: "9".repeat(24),
    messageId: MSG,
    channelId: CHANNEL,
    workspaceId: WS,
    requestedBy: REQUESTER,
    deadlineAt: overrides.deadlineAt === undefined ? null : overrides.deadlineAt,
    confirmedCount: 0,
    cancelledAt: overrides.cancelled ? new Date() : null,
    cancelledBy: null,
    createdAt: NOW,
  });
  const service = new AnnouncementNotifyService(repo, lookup, async () => readers, () => NOW);
  return { repo, lookup, service };
}

const recipientsOf = (call: number): string[] => (mockNotify.mock.calls[call][1] as { recipients: { userId: string }[] }).recipients.map((r) => r.userId);

beforeEach(() => {
  (withTransaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({}));
  mockNotify.mockResolvedValue({ notificationId: "n1" });
});

describe("AnnouncementNotifyService.notifyRequired", () => {
  it("gửi announcement.required cho người đọc được kênh, trừ người yêu cầu; dedupeKey/nguồn theo yêu cầu", async () => {
    const { service } = setup();
    const stats = await service.notifyRequired(MSG);
    expect(stats).toMatchObject({ candidates: 3, notified: 3 });
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(recipientsOf(0)).toEqual(readers.slice(1));
    expect(mockNotify.mock.calls[0][1]).toMatchObject({
      type: "announcement.required",
      actorId: REQUESTER,
      scope: { type: "CHANNEL", id: CHANNEL },
      workspaceId: WS,
      source: { type: "Announcement", id: `announcement.required:${"9".repeat(24)}` },
      dedupeKey: `announcement.required:${"9".repeat(24)}`,
      refs: expect.objectContaining({ channelId: CHANNEL, messageId: MSG }),
    });
  });

  it("bỏ qua khi yêu cầu không tồn tại, đã huỷ, đã hết hạn, hoặc tin đã bị xoá", async () => {
    expect((await setup().service.notifyRequired("f".repeat(24))).skipped).toBe("not-found");
    expect((await setup({ cancelled: true }).service.notifyRequired(MSG)).skipped).toBe("cancelled");
    expect((await setup({ deadlineAt: new Date(NOW.getTime() - 1000) }).service.notifyRequired(MSG)).skipped).toBe("expired");
    const gone = setup();
    gone.lookup.messages.set(MSG, { ...gone.lookup.messages.get(MSG)!, deletedAt: new Date() });
    expect((await gone.service.notifyRequired(MSG)).skipped).toBe("message-deleted");
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("chia lô 500 người/lần giao", async () => {
    const { repo, lookup } = setup();
    const many = Array.from({ length: 1200 }, (_, i) => (i + 100).toString(16).padStart(24, "0"));
    const big = new AnnouncementNotifyService(repo, lookup, async () => [REQUESTER, ...many], () => NOW);
    const stats = await big.notifyRequired(MSG);
    expect(stats.notified).toBe(1200);
    expect(mockNotify).toHaveBeenCalledTimes(3);
    expect(recipientsOf(0)).toHaveLength(500);
    expect(recipientsOf(2)).toHaveLength(200);
  });
});

describe("AnnouncementNotifyService.remind", () => {
  const deadline = new Date(NOW.getTime() + 24 * 3600_000);

  it("chỉ nhắc người CHƯA xác nhận, khoá nguồn theo hạn", async () => {
    const { repo, service } = setup({ deadlineAt: deadline });
    repo.receipts.push({ id: "r".repeat(24), requestId: "9".repeat(24), userId: readers[1], confirmedAt: NOW });
    const stats = await service.remind(MSG, deadline.toISOString());
    expect(stats).toMatchObject({ candidates: 2, notified: 2 });
    expect(recipientsOf(0)).toEqual(readers.slice(2));
    expect(mockNotify.mock.calls[0][1]).toMatchObject({
      type: "announcement.reminder",
      source: { id: `announcement.reminder:${"9".repeat(24)}:${Math.floor(deadline.getTime() / 1000)}` },
    });
  });

  it("bỏ qua khi đổi hạn, đã huỷ, đã hết hạn hoặc mọi người đã xác nhận", async () => {
    const changed = setup({ deadlineAt: new Date(deadline.getTime() + 3600_000) });
    expect((await changed.service.remind(MSG, deadline.toISOString())).skipped).toBe("deadline-changed");
    expect((await setup({ deadlineAt: deadline, cancelled: true }).service.remind(MSG, deadline.toISOString())).skipped).toBe("cancelled");
    const past = new Date(NOW.getTime() - 1000);
    expect((await setup({ deadlineAt: past }).service.remind(MSG, past.toISOString())).skipped).toBe("expired");

    const done = setup({ deadlineAt: deadline });
    for (const userId of readers.slice(1)) done.repo.receipts.push({ id: userId, requestId: "9".repeat(24), userId, confirmedAt: NOW });
    expect((await done.service.remind(MSG, deadline.toISOString())).skipped).toBe("no-recipients");
    expect(mockNotify).not.toHaveBeenCalled();
  });
});
