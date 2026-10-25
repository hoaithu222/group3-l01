import { prisma } from "../../../infrastructure/database";
import type { IMediaOpsHealthReader, WebhookCounts } from "./media-ops-read.repository.interface";

/** CHỈ-ĐỌC `WebhookEvent`/`MeetingRecording` cho `/admin/media/health` — không đọc `payload`/`error` (chỉ đếm), không import module `webhooks`. */
export class PrismaMediaOpsHealthReader implements IMediaOpsHealthReader {
  async lastLiveKitWebhookAt(): Promise<Date | null> {
    const row = await prisma.webhookEvent.findFirst({ where: { provider: "LIVEKIT" }, orderBy: { receivedAt: "desc" }, select: { receivedAt: true } });
    return row?.receivedAt ?? null;
  }

  async liveKitWebhookCountsSince(since: Date): Promise<WebhookCounts> {
    const groups = await prisma.webhookEvent.groupBy({ by: ["status"], where: { provider: "LIVEKIT", receivedAt: { gte: since } }, _count: { _all: true } });
    return { received: groups.reduce((s, g) => s + g._count._all, 0), failed: groups.find((g) => g.status === "FAILED")?._count._all ?? 0 };
  }

  failedRecordingsSince(since: Date): Promise<number> {
    return prisma.meetingRecording.count({ where: { status: "FAILED", updatedAt: { gte: since } } });
  }
}
