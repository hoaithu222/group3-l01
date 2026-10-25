import { prisma } from "../../../infrastructure/database";
import { createContextLogger } from "../../../infrastructure/logger";
import { enqueue } from "../../../infrastructure/queue";
import { redis } from "../../../infrastructure/redis";
import { fingerprintPurgeJobId, PLAGIARISM_FINGERPRINT_PURGE_JOB, PLAGIARISM_FINGERPRINT_QUEUE, type FingerprintIndexService } from "../services/fingerprint-index.service";

const log = createContextLogger({ service: "PlagiarismResourceEventsListener" });

/**
 * Nối outbox `resource.created|updated|deleted|purged` của module `resources` (p3-01) TỪ XA — ĐỌC-CHỈ trên bảng dùng
 * chung `OutboxEvent`, KHÔNG sửa file nào trong `be/src/modules/resources/**`.
 *
 * ⚠️ Lệch kiến trúc CÓ CHỦ Ý so với be.md (đăng ký thêm một `registerJob` xử lý sự kiện, giống `p5-04`/`p7-05` được nhắc
 * trong chú thích của `resources/jobs/resource-events.consumer.ts`): mỗi cặp (queue, jobName) BullMQ chỉ có ĐÚNG MỘT
 * processor (`registerJob` là `Map.set`, xem `shared/events/domain-events.ts`). `resource.events` (queue `notifications`)
 * đã có processor của CHÍNH module `resources` — thêm một `registerJob` thứ hai cùng cặp sẽ ÂM THẦM GHI ĐÈ nó (mất socket
 * `resource:changed`) hoặc bị nó ghi đè (tuỳ thứ tự import trong `register-jobs.ts`), và mẫu chuẩn của repo cho một
 * nguồn/nhiều đích ("sink registry sau MỘT processor") đòi sửa file BÊN TRONG `resources` để thêm điểm cắm — việc bị cấm
 * ở đợt này. Giải pháp: một CRON (`plagiarism.resource-events-poll`, mỗi 60 giây, xem
 * `jobs/plagiarism-resource-events-poll.job.ts`) tự đọc thẳng bảng `OutboxEvent` (hạ tầng DÙNG CHUNG, không phải file
 * của module `resources`) theo `type` + con trỏ (`id` — ObjectId Mongo tăng gần đúng theo thời gian tạo) lưu ở Redis.
 * Đánh đổi: độ trễ lập chỉ mục tăng thêm tối đa ~60 giây so với tức thời — chấp nhận được vì lập chỉ mục vốn đã chạy nền
 * (README §3 luồng chính: `Worker media` xử lý không đồng bộ, không ai chờ trực tiếp).
 */
const RESOURCE_EVENT_TYPES = ["resource.created", "resource.updated", "resource.deleted", "resource.purged"] as const;
const CURSOR_KEY = "plagiarism:resource-events:cursor";
const DEFAULT_BATCH = 500;

interface ResourceEventPayloadShape {
  kind?: string;
  action?: string;
  resourceId?: string;
}

export interface ResourceEventsListenerDeps {
  fingerprintIndex: FingerprintIndexService;
}

async function handleOne(deps: ResourceEventsListenerDeps, type: string, payload: ResourceEventPayloadShape): Promise<void> {
  if (payload.kind !== "RESOURCE" || !payload.resourceId) return; // Sự kiện FOLDER không có nội dung để lập chỉ mục.
  const resourceId = payload.resourceId;
  switch (type) {
    case "resource.created":
    case "resource.updated":
      await deps.fingerprintIndex.handleResourceChanged(resourceId);
      return;
    case "resource.deleted":
      await deps.fingerprintIndex.markDeleted(resourceId);
      return;
    case "resource.purged":
      await enqueue(PLAGIARISM_FINGERPRINT_QUEUE, PLAGIARISM_FINGERPRINT_PURGE_JOB, { resourceId }, { jobId: fingerprintPurgeJobId(resourceId) });
      return;
    default:
      return;
  }
}

/** Một lượt: đọc tối đa `batch` sự kiện MỚI HƠN con trỏ đã lưu, xử lý tuần tự, rồi đẩy con trỏ tới event cuối đã xử lý. */
export async function pollResourceEvents(deps: ResourceEventsListenerDeps, batch: number = DEFAULT_BATCH): Promise<number> {
  const cursor = await redis.get<string>(CURSOR_KEY);
  const rows = await prisma.outboxEvent.findMany({
    where: { type: { in: [...RESOURCE_EVENT_TYPES] }, ...(cursor && { id: { gt: cursor } }) },
    orderBy: { id: "asc" },
    take: batch,
    select: { id: true, type: true, payload: true },
  });
  for (const row of rows) {
    try {
      await handleOne(deps, row.type, row.payload as ResourceEventPayloadShape);
    } catch (err) {
      // Không chặn cả lô vì một sự kiện lỗi — log và tiếp tục; lượt poll SAU vẫn bỏ qua nó (con trỏ đã đẩy tới cuối lô ở
      // dưới). Chấp nhận: mất tối đa 1 sự kiện lập chỉ mục hiếm gặp thay vì cả cron kẹt vĩnh viễn ở một dòng hỏng.
      log.warn("[plagiarism.resource-events-poll] Lỗi xử lý 1 sự kiện — bỏ qua, tiếp tục lô", {
        eventId: row.id,
        type: row.type,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const last = rows[rows.length - 1];
  if (last) await redis.set(CURSOR_KEY, last.id);
  return rows.length;
}
