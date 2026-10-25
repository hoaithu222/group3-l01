/**
 * Integration — `AdminPushStatsService.getStats()` trên Mongo thật (memory
 * replset) vì `groupBy`/`count` theo khoảng thời gian là truy vấn Mongo tổng
 * hợp — mock Prisma tay sẽ che lỗi truy vấn thật (cùng lý do
 * `admin-storage.service.test.ts`).
 *
 * Replset dùng chung với test file khác nên KHÔNG khẳng định số tuyệt đối: đo
 * số liệu nền trước, seed thêm rồi kiểm ĐỘ TĂNG.
 */
jest.mock("../../../../infrastructure/push", () => ({
  getPushSender: () => ({ sendMulticast: jest.fn() }),
  getVoipSender: () => ({ send: jest.fn() }),
  isPushConfigured: () => true,
  isVoipConfigured: () => true,
}));

import { prisma } from "../../../../infrastructure/database";
import { newObjectId } from "../../../../core/utils/object-id";
import { AdminPushStatsService, PUSH_STATS_CACHE_MS } from "../../admin-push-stats.service";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

type PushStatus = "SENT" | "FAILED" | "SKIPPED" | "PENDING";

describe("AdminPushStatsService (integration — Mongo memory replset)", () => {
  const recipientId = newObjectId();
  const notificationIds: string[] = [];

  async function seedNotification(): Promise<string> {
    const id = newObjectId();
    await prisma.notification.create({
      data: { id, type: "mention", sourceType: "message", sourceId: newObjectId(), dedupeKey: `admin-push-stats:${id}` },
    });
    notificationIds.push(id);
    return id;
  }

  async function seedRecipient(opts: {
    pushStatus: PushStatus;
    skipReason?: string | null;
    createdAt?: Date;
    deliveredPushAt?: Date | null;
  }): Promise<void> {
    const notificationId = await seedNotification();
    await prisma.notificationRecipient.create({
      data: {
        notificationId,
        recipientId,
        kind: "MENTION",
        dedupeKey: `dk-${newObjectId()}`,
        pushStatus: opts.pushStatus,
        skipReason: opts.skipReason ?? null,
        deliveredPushAt: opts.deliveredPushAt ?? null,
        ...(opts.createdAt && { createdAt: opts.createdAt }),
      },
    });
  }

  async function seedToken(opts: { revokedAt: Date | null; revokeReason?: string | null }): Promise<void> {
    await prisma.deviceToken.create({
      data: {
        userId: recipientId,
        deviceId: `dev-${newObjectId()}`,
        platform: "ANDROID",
        kind: "FCM",
        token: `tok-${newObjectId()}`,
        revokedAt: opts.revokedAt,
        revokeReason: opts.revokeReason ?? null,
      },
    });
  }

  afterEach(async () => {
    await prisma.notificationRecipient.deleteMany({ where: { recipientId } });
    await prisma.notification.deleteMany({ where: { id: { in: notificationIds.splice(0) } } });
    await prisma.deviceToken.deleteMany({ where: { userId: recipientId } });
  });

  it("đếm SENT/FAILED theo deliveredPushAt và SKIPPED theo createdAt trong 24 giờ, gom theo lý do", async () => {
    const service = new AdminPushStatsService(0);
    const before = await service.getStats();
    const now = Date.now();

    await seedRecipient({ pushStatus: "SENT", deliveredPushAt: new Date(now - HOUR_MS) });
    await seedRecipient({ pushStatus: "SENT", deliveredPushAt: new Date(now - 2 * HOUR_MS) });
    await seedRecipient({ pushStatus: "FAILED", deliveredPushAt: new Date(now - HOUR_MS) });
    await seedRecipient({ pushStatus: "SKIPPED", skipReason: "MUTED" });
    await seedRecipient({ pushStatus: "SKIPPED", skipReason: "MUTED" });
    await seedRecipient({ pushStatus: "SKIPPED", skipReason: "DND" });
    await seedRecipient({ pushStatus: "SKIPPED", skipReason: null }); // bản ghi cũ không có lý do
    // Ngoài cửa sổ 24 giờ + PENDING (chưa có kết quả) → KHÔNG được đếm.
    await seedRecipient({ pushStatus: "SENT", deliveredPushAt: new Date(now - 25 * HOUR_MS) });
    await seedRecipient({ pushStatus: "SKIPPED", skipReason: "VIEWING", createdAt: new Date(now - 26 * HOUR_MS) });
    await seedRecipient({ pushStatus: "PENDING" });

    const after = await service.getStats();
    expect(after.push24h.sent - before.push24h.sent).toBe(2);
    expect(after.push24h.failed - before.push24h.failed).toBe(1);
    expect(after.push24h.skipped.total - before.push24h.skipped.total).toBe(4);
    const delta = (key: string) => (after.push24h.skipped.byReason[key] ?? 0) - (before.push24h.skipped.byReason[key] ?? 0);
    expect(delta("MUTED")).toBe(2);
    expect(delta("DND")).toBe(1);
    expect(delta("UNKNOWN")).toBe(1);
    expect(delta("VIEWING")).toBe(0);
  });

  it("đếm token bị gỡ trong 7 ngày theo lý do, bỏ token còn hoạt động và token gỡ quá 7 ngày", async () => {
    const service = new AdminPushStatsService(0);
    const before = await service.getStats();
    const now = Date.now();

    await seedToken({ revokedAt: new Date(now - DAY_MS), revokeReason: "FCM_UNREGISTERED" });
    await seedToken({ revokedAt: new Date(now - 3 * DAY_MS), revokeReason: "FCM_UNREGISTERED" });
    await seedToken({ revokedAt: new Date(now - 2 * DAY_MS), revokeReason: "LOGOUT" });
    await seedToken({ revokedAt: new Date(now - DAY_MS), revokeReason: null });
    await seedToken({ revokedAt: null }); // còn hoạt động
    await seedToken({ revokedAt: new Date(now - 8 * DAY_MS), revokeReason: "STALE" }); // quá 7 ngày

    const after = await service.getStats();
    expect(after.tokensRevoked7d.total - before.tokensRevoked7d.total).toBe(4);
    const delta = (key: string) =>
      (after.tokensRevoked7d.byReason[key] ?? 0) - (before.tokensRevoked7d.byReason[key] ?? 0);
    expect(delta("FCM_UNREGISTERED")).toBe(2);
    expect(delta("LOGOUT")).toBe(1);
    expect(delta("UNKNOWN")).toBe(1);
    expect(delta("STALE")).toBe(0);
  });

  it("cache 60 giây: dữ liệu mới không hiện trong cửa sổ cache, hiện sau khi hết hạn", async () => {
    let clock = Date.now();
    const service = new AdminPushStatsService(PUSH_STATS_CACHE_MS, () => clock);

    const first = await service.getStats();
    await seedRecipient({ pushStatus: "SENT", deliveredPushAt: new Date(clock) });

    clock += PUSH_STATS_CACHE_MS - 1;
    const cached = await service.getStats();
    expect(cached).toBe(first); // cùng một đối tượng — không truy vấn lại
    expect(cached.push24h.sent).toBe(first.push24h.sent);

    clock += 2;
    const refreshed = await service.getStats();
    expect(refreshed).not.toBe(first);
    expect(refreshed.push24h.sent).toBe(first.push24h.sent + 1);
  });

  it("nhiều request đồng thời chỉ dùng một lượt truy vấn (cùng kết quả)", async () => {
    const service = new AdminPushStatsService(PUSH_STATS_CACHE_MS);
    const [a, b, c] = await Promise.all([service.getStats(), service.getStats(), service.getStats()]);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("lỗi truy vấn KHÔNG bị cache — lần gọi kế tiếp thử lại", async () => {
    const service = new AdminPushStatsService(PUSH_STATS_CACHE_MS);
    const spy = jest
      .spyOn(prisma.notificationRecipient, "count")
      .mockRejectedValueOnce(new Error("mongo down"));
    await expect(service.getStats()).rejects.toThrow("mongo down");
    spy.mockRestore();

    const retry = await service.getStats();
    expect(retry.push24h.sent).toBeGreaterThanOrEqual(0);
  });
});
