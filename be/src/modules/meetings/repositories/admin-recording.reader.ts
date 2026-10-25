import type { Prisma } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";
import type { AdminRecordingListQueryDto } from "../dtos";
import type { RecordingStatusValue, RecordingStopReasonValue } from "../entities/meeting-recap.interface";

/**
 * Bản ghi hình CHO ADMIN — chỉ METADATA vận hành (D-24, admin.md p2-06): dung lượng, thời lượng, trạng thái, hạn lưu trữ, lỗi đã làm sạch. Cố ý KHÔNG có
 * `code` họp, agenda, người tham dự, tên người đồng ý, URL ký; `select` chỉ lấy đúng các trường này nên dù sau này ai thêm DTO cũng không có dữ liệu nhạy cảm để lộ.
 */
export interface AdminRecordingRecord {
  id: string;
  meetingId: string;
  workspaceId: string;
  callId: string;
  egressId: string | null;
  layout: "GRID" | "SPEAKER";
  status: RecordingStatusValue;
  storageKey: string;
  fileSizeBytes: number | null;
  startedBy: string;
  stoppedBy: string | null;
  stopReason: RecordingStopReasonValue | null;
  startedAt: Date;
  stoppedAt: Date | null;
  durationSec: number | null;
  error: string | null;
  retentionExpiresAt: Date | null;
  deletedAt: Date | null;
  deleteReason: string | null;
  consentCount: number;
}

export interface AdminRecordingSummary {
  recordingStorageBytes: number;
  storageBytes30dAgo: number;
  readyCount: number;
  expiringIn7d: number;
  failed24h: number;
}

const SELECT = {
  id: true, meetingId: true, workspaceId: true, callId: true, egressId: true, layout: true, status: true, storageKey: true, fileSizeBytes: true, startedBy: true, stoppedBy: true,
  stopReason: true, startedAt: true, stoppedAt: true, durationSec: true, error: true, retentionExpiresAt: true, deletedAt: true, deleteReason: true, consentSnapshot: true,
} satisfies Prisma.MeetingRecordingSelect;
type Row = Prisma.MeetingRecordingGetPayload<{ select: typeof SELECT }>;

const toRecord = ({ consentSnapshot, ...r }: Row): AdminRecordingRecord => ({ ...r, consentCount: consentSnapshot.length });

/** Cổng ĐỌC-CHỈ cho admin (không có hàm ghi) — xoá đi qua `RecordingLifecycle.remove` để dùng chung luật với chủ trì/cron. */
export interface IAdminRecordingReader {
  list(q: AdminRecordingListQueryDto, now: Date): Promise<{ rows: AdminRecordingRecord[]; total: number }>;
  findById(id: string): Promise<AdminRecordingRecord | null>;
  summary(now: Date, workspaceId?: string): Promise<AdminRecordingSummary>;
  /** Tiêu đề cuộc họp (metadata) — KHÔNG mã họp. */
  meetingTitles(ids: string[]): Promise<Map<string, string>>;
  workspaceNames(ids: string[]): Promise<Map<string, string>>;
  userNames(ids: string[]): Promise<Map<string, string>>;
}

const DAY_MS = 86_400_000;

export class PrismaAdminRecordingReader implements IAdminRecordingReader {
  async list(q: AdminRecordingListQueryDto, now: Date): Promise<{ rows: AdminRecordingRecord[]; total: number }> {
    const where: Prisma.MeetingRecordingWhereInput = {
      ...(q.includeDeleted ? {} : { deletedAt: null }),
      ...(q.status && q.status.length > 0 ? { status: { in: q.status } } : {}),
      ...(q.workspaceId ? { workspaceId: q.workspaceId } : {}),
      ...(q.meetingId ? { meetingId: q.meetingId } : {}),
      ...(q.from || q.to ? { startedAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } } : {}),
      // `lte` trên trường nullable khớp cả `null` ⇒ luôn thêm `not: null`.
      ...(q.expiringWithinDays ? { status: "READY" as const, retentionExpiresAt: { not: null, lte: new Date(now.getTime() + q.expiringWithinDays * DAY_MS) } } : {}),
    };
    const desc = q.sort.startsWith("-");
    const field = q.sort.replace(/^-/, "") as "startedAt" | "durationSec" | "fileSizeBytes" | "retentionExpiresAt";
    const [rows, total] = await Promise.all([
      prisma.meetingRecording.findMany({ where, select: SELECT, orderBy: [{ [field]: desc ? "desc" : "asc" }, { id: "desc" }], skip: (q.page - 1) * q.limit, take: q.limit }),
      prisma.meetingRecording.count({ where }),
    ]);
    return { rows: rows.map(toRecord), total };
  }

  async findById(id: string): Promise<AdminRecordingRecord | null> {
    const r = await prisma.meetingRecording.findUnique({ where: { id }, select: SELECT });
    return r ? toRecord(r) : null;
  }

  async summary(now: Date, workspaceId?: string): Promise<AdminRecordingSummary> {
    const ws = workspaceId ? { workspaceId } : {};
    const d30 = new Date(now.getTime() - 30 * DAY_MS);
    const readyLive: Prisma.MeetingRecordingWhereInput = { ...ws, status: "READY", deletedAt: null };
    const [now$, ago$, readyCount, expiringIn7d, failed24h] = await Promise.all([
      prisma.meetingRecording.aggregate({ where: readyLive, _sum: { fileSizeBytes: true } }),
      // 30 ngày trước: bản đã dừng trước mốc đó và (chưa xoá, hoặc xoá SAU mốc đó).
      prisma.meetingRecording.aggregate({ where: { ...ws, status: "READY", stoppedAt: { not: null, lt: d30 }, OR: [{ deletedAt: null }, { deletedAt: { gt: d30 } }] }, _sum: { fileSizeBytes: true } }),
      prisma.meetingRecording.count({ where: readyLive }),
      prisma.meetingRecording.count({ where: { ...readyLive, retentionExpiresAt: { not: null, lte: new Date(now.getTime() + 7 * DAY_MS) } } }),
      prisma.meetingRecording.count({ where: { ...ws, status: "FAILED", updatedAt: { gte: new Date(now.getTime() - DAY_MS) } } }),
    ]);
    return { recordingStorageBytes: now$._sum.fileSizeBytes ?? 0, storageBytes30dAgo: ago$._sum.fileSizeBytes ?? 0, readyCount, expiringIn7d, failed24h };
  }

  async meetingTitles(ids: string[]): Promise<Map<string, string>> {
    const uniq = [...new Set(ids)];
    if (uniq.length === 0) return new Map();
    const rows = await prisma.meeting.findMany({ where: { id: { in: uniq } }, select: { id: true, title: true } });
    return new Map(rows.map((r) => [r.id, r.title]));
  }

  async workspaceNames(ids: string[]): Promise<Map<string, string>> {
    const uniq = [...new Set(ids)];
    if (uniq.length === 0) return new Map();
    const rows = await prisma.workspace.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  async userNames(ids: string[]): Promise<Map<string, string>> {
    const uniq = [...new Set(ids)];
    if (uniq.length === 0) return new Map();
    const rows = await prisma.user.findMany({ where: { id: { in: uniq } }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}
