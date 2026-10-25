import { prisma } from "../../infrastructure/database";

/**
 * Đọc CHỈ-ĐỌC riêng cho trang quản trị media (không import module `webhooks` — quy tắc không import chéo module;
 * cùng collection `WebhookEvent`, chỉ `select` tối thiểu, không đọc payload).
 */
export interface IMediaAdminRepository {
  lastLiveKitWebhookAt(): Promise<Date | null>;
}

export class PrismaMediaAdminRepository implements IMediaAdminRepository {
  async lastLiveKitWebhookAt(): Promise<Date | null> {
    const row = await prisma.webhookEvent.findFirst({
      where: { provider: "LIVEKIT" },
      orderBy: { receivedAt: "desc" },
      select: { receivedAt: true },
    });
    return row?.receivedAt ?? null;
  }
}
