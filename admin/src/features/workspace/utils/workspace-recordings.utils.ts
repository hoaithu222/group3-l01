import type { TableSortDir } from '@/shared/ui';

import {
  RECORDING_ACTIVE_STATUSES,
  RECORDING_DEFAULT_SORT,
  RECORDING_EXPIRING_DAYS,
  RECORDING_PAGE_SIZE_OPTIONS,
  RECORDING_SORT_KEYS,
  RECORDING_STATUS_OPTIONS,
} from '../constants/workspace-recordings.constants';
import type {
  AdminRecordingDetail,
  AdminRecordingListParams,
  AdminRecordingRow,
  RecordingSortKey,
  RecordingSortValue,
  RecordingStatusValue,
} from '../types/workspace-recordings.types';
import { dayBoundaryIso } from './workspace-meetings.utils';

const STATUS_ORDER = RECORDING_STATUS_OPTIONS.map((o) => o.value);

/**
 * `?recStatus=READY,FAILED` → danh sách trạng thái HỢP LỆ theo thứ tự vòng đời, bỏ trùng và giá trị lạ
 * (URL do người dùng sửa được). Không còn giá trị hợp lệ nào → `[]` (không lọc).
 */
export function parseRecordingStatuses(value: string): RecordingStatusValue[] {
  const wanted = new Set(value.split(',').map((s) => s.trim()));
  return STATUS_ORDER.filter((s) => wanted.has(s));
}

/** `?recSort=-durationSec` → khoá + chiều cho `Table`; thiếu/lạ → mặc định (bắt đầu ghi mới → cũ). */
export function parseRecordingSort(value: string): { key: RecordingSortKey; dir: TableSortDir } {
  const desc = value.startsWith('-');
  const key = (desc ? value.slice(1) : value) as RecordingSortKey;
  return RECORDING_SORT_KEYS.includes(key)
    ? { key, dir: desc ? 'desc' : 'asc' }
    : { ...RECORDING_DEFAULT_SORT };
}

/**
 * `Table.onSortChange` → giá trị `?recSort=`. Bỏ sắp xếp (`null`) hoặc đúng mặc định → `null` (xoá khoá, URL sạch);
 * khoá lạ (cột không sắp được) cũng về `null`.
 */
export function toRecordingSortUrl(
  key: string | null,
  dir: TableSortDir | null,
): RecordingSortValue | null {
  if (!key || !dir || !RECORDING_SORT_KEYS.includes(key as RecordingSortKey)) return null;
  if (key === RECORDING_DEFAULT_SORT.key && dir === RECORDING_DEFAULT_SORT.dir) return null;
  return dir === 'desc' ? (`-${key}` as RecordingSortValue) : (key as RecordingSortValue);
}

/**
 * Giá trị `?recSort=` kế tiếp khi bấm tiêu đề cột. Vòng của `Table` là asc → desc → bỏ; mặc định (bắt đầu ghi mới → cũ) đã là một cách
 * sắp xếp ĐANG HIỆN nên "bỏ" trùng chính nó và người dùng không bao giờ tới được thứ tự cũ → mới: ở ca đó lật sang asc thay vì đứng yên.
 */
export function nextRecordingSort(
  current: { key: RecordingSortKey; dir: TableSortDir },
  key: string | null,
  dir: TableSortDir | null,
): RecordingSortValue | null {
  const atDefault =
    current.key === RECORDING_DEFAULT_SORT.key && current.dir === RECORDING_DEFAULT_SORT.dir;
  if (key === null && atDefault) return toRecordingSortUrl(RECORDING_DEFAULT_SORT.key, 'asc');
  return toRecordingSortUrl(key, dir);
}

/** BE kiểm `meetingId` là ObjectId 24 hex (`objectIdSchema`) — URL do người dùng sửa được nên chỉ gửi khi đúng dạng, tránh 400. */
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
export const isMeetingIdParam = (value: string | undefined): value is string =>
  !!value && OBJECT_ID.test(value);

/** Tham số gọi API từ giá trị URL (chỉ khoá có giá trị hợp lệ). */
export function toRecordingListParams(input: {
  page: number;
  limit: number;
  workspaceId?: string;
  meetingId?: string;
  status: string;
  from: string;
  to: string;
  sort: string;
  expiring: boolean;
  includeDeleted: boolean;
}): AdminRecordingListParams {
  const statuses = parseRecordingStatuses(input.status);
  const from = dayBoundaryIso(input.from, 'start');
  const to = dayBoundaryIso(input.to, 'end');
  const { key, dir } = parseRecordingSort(input.sort);
  return {
    page: input.page,
    // URL do người dùng sửa được: `?recPageSize=9999` không được làm BE trả 400 (trần 100 dòng/trang).
    limit: Math.min(input.limit, Math.max(...RECORDING_PAGE_SIZE_OPTIONS)),
    sort: dir === 'desc' ? (`-${key}` as RecordingSortValue) : key,
    ...(input.workspaceId && { workspaceId: input.workspaceId }),
    ...(isMeetingIdParam(input.meetingId) && { meetingId: input.meetingId }),
    ...(statuses.length > 0 && { status: statuses.join(',') }),
    ...(from && { from }),
    ...(to && { to }),
    ...(input.expiring && { expiringWithinDays: RECORDING_EXPIRING_DAYS }),
    ...(input.includeDeleted && { includeDeleted: true }),
  };
}

/** Bản còn đang chạy (STARTING/RECORDING/STOPPING) → BE từ chối xoá; bản đã xoá thì không còn gì để xoá. */
export function isRecordingActive(status: RecordingStatusValue): boolean {
  return RECORDING_ACTIVE_STATUSES.includes(status);
}

export function canDeleteRecording(row: Pick<AdminRecordingRow, 'status' | 'deletedAt'>): boolean {
  return !row.deletedAt && !isRecordingActive(row.status);
}

/** Lý do nút Xoá tắt — hiện trong `Tooltip`; `null` = xoá được. */
export function deleteBlockedReason(
  row: Pick<AdminRecordingRow, 'status' | 'deletedAt'>,
): string | null {
  if (row.deletedAt) return 'Bản ghi đã bị xoá.';
  if (isRecordingActive(row.status)) return 'Bản ghi đang được ghi hoặc đang dừng, chưa thể xoá.';
  return null;
}

/**
 * Trạng thái tệp trên kho lưu trữ (kết quả `HEAD` BE gửi kèm chi tiết) → chữ + sắc thái badge. `object: null` gồm cả "chưa có tệp" lẫn
 * "storage lỗi lúc kiểm" nên chỉ phân biệt được theo trạng thái bản ghi.
 */
export function objectStatusOf(
  rec: Pick<AdminRecordingDetail, 'status' | 'deletedAt' | 'object'>,
  formatSize: (bytes: number) => string,
): { label: string; tone: 'success' | 'error' | 'neutral' } {
  if (rec.deletedAt) return { label: 'Đã xoá khỏi lưu trữ', tone: 'neutral' };
  if (isRecordingActive(rec.status)) return { label: 'Chưa có tệp (đang ghi)', tone: 'neutral' };
  if (!rec.object) return { label: 'Chưa kiểm tra được kho lưu trữ lúc này', tone: 'neutral' };
  if (!rec.object.exists) return { label: 'Không thấy tệp trên kho lưu trữ', tone: 'error' };
  return {
    label: `Có tệp trên kho lưu trữ${rec.object.sizeBytes === null ? '' : ` (${formatSize(rec.object.sizeBytes)})`}`,
    tone: 'success',
  };
}

/** Thời lượng ghi: `null` → `—`; dưới 1 phút → "45 giây"; còn lại "1 giờ 05 phút" / "42 phút". */
export function formatRecordingDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return `${Math.floor(seconds)} giây`;
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} phút`;
  return `${hours} giờ ${String(minutes).padStart(2, '0')} phút`;
}

/** Dòng "Hết hạn" của bảng: đã xoá → "Đã xoá"; chưa có hạn → `—`; còn N ngày / hôm nay / đã quá hạn N ngày. */
export function retentionLabel(
  row: Pick<AdminRecordingRow, 'deletedAt' | 'retentionDaysLeft'>,
): string {
  if (row.deletedAt) return 'Đã xoá';
  const days = row.retentionDaysLeft;
  if (days === null) return '—';
  if (days > 0) return `còn ${days} ngày`;
  if (days === 0) return 'hết hạn hôm nay';
  return `đã quá hạn ${-days} ngày`;
}

/**
 * So dung lượng hiện tại với 30 ngày trước cho thẻ tóm tắt: "tăng 1,2 GB so với 30 ngày trước" / "giảm …" / "không đổi".
 * `formatSize` do nơi gọi truyền (`formatFileSize`) để hàm này không phụ thuộc kit2.
 */
export function storageDeltaText(
  current: number,
  before: number,
  formatSize: (bytes: number) => string,
): string {
  const diff = current - before;
  if (diff === 0) return 'Không đổi so với 30 ngày trước';
  return `${diff > 0 ? 'Tăng' : 'Giảm'} ${formatSize(Math.abs(diff))} so với 30 ngày trước`;
}
