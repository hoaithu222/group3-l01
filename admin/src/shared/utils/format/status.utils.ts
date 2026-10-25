/**
 * `statusBadge(kind, value)` — map trạng thái BE (chuỗi enum) → `{ variant, label }`
 * cho `<Badge>` kit2. MỘT nguồn cho mọi bảng/drawer, tránh mỗi feature tự viết
 * lại map trạng thái → màu (drift màu giữa các màn).
 *
 * `variant` cố ý KHÔNG import `BadgeColor` từ `@/shared/ui` — `shared/utils`
 * đứng DƯỚI `shared/ui` trong đồ thị phụ thuộc (ui import ngược lại utils rất
 * nhiều, vd `formatNumber` trong `SummaryCard`), nên import type từ `ui` vào
 * đây có thể bị `check:cycles` (madge) coi là vòng. Các literal dưới đây đã
 * khớp CHÍNH XÁC tập giá trị của `BadgeColor` nên gán trực tiếp cho prop
 * `color` của `<Badge>` vẫn type-check được nhờ structural typing.
 */
export type StatusBadgeVariant = 'success' | 'warning' | 'error' | 'neutral' | 'info';

export interface StatusBadgeMeta {
  variant: StatusBadgeVariant;
  label: string;
}

const MAP: Record<string, Record<string, StatusBadgeMeta>> = {
  user: {
    ACTIVE: { variant: 'success', label: 'Hoạt động' },
    LOCKED: { variant: 'error', label: 'Đã khoá' },
    PENDING_DELETION: { variant: 'warning', label: 'Chờ xoá' },
    ANONYMIZED: { variant: 'neutral', label: 'Đã ẩn danh' },
  },
  workspace: {
    ACTIVE: { variant: 'success', label: 'Hoạt động' },
    ARCHIVED: { variant: 'neutral', label: 'Lưu trữ' },
  },
  // ── p1-02 (thành viên) ───────────────────────────────────────────────────
  workspaceRole: {
    OWNER: { variant: 'info', label: 'Chủ nhóm' },
    ADMIN: { variant: 'warning', label: 'Quản trị viên' },
    MEMBER: { variant: 'neutral', label: 'Thành viên' },
    GUEST: { variant: 'neutral', label: 'Khách' },
  },
  workspaceMember: {
    ACTIVE: { variant: 'success', label: 'Đang hoạt động' },
    PENDING: { variant: 'info', label: 'Chờ tham gia' },
    LEFT: { variant: 'neutral', label: 'Đã rời nhóm' },
    REMOVED: { variant: 'neutral', label: 'Đã bị loại' },
    BANNED: { variant: 'error', label: 'Bị chặn' },
  },
  // ── p3-04 (lời mời email đích danh) ──────────────────────────────────────
  invitation: {
    PENDING: { variant: 'info', label: 'Đang chờ' },
    ACCEPTED: { variant: 'success', label: 'Đã chấp nhận' },
    REVOKED: { variant: 'neutral', label: 'Đã thu hồi' },
    EXPIRED: { variant: 'warning', label: 'Hết hạn' },
  },
  report: {
    OPEN: { variant: 'warning', label: 'Chờ xử lý' },
    RESOLVED: { variant: 'success', label: 'Đã xử lý' },
    DISMISSED: { variant: 'neutral', label: 'Bỏ qua' },
  },
  // ── p1-03 (kênh) ─────────────────────────────────────────────────────────
  channel: {
    ACTIVE: { variant: 'success', label: 'Hoạt động' },
    ARCHIVED: { variant: 'neutral', label: 'Lưu trữ' },
  },
  // ── p1-05 (hội thoại nhóm) ───────────────────────────────────────────────
  conversation: {
    ACTIVE: { variant: 'success', label: 'Đang hoạt động' },
    ARCHIVED: { variant: 'neutral', label: 'Lưu trữ' },
    DISSOLVED: { variant: 'error', label: 'Đã giải tán' },
  },
  // ── p2-04 (lịch họp) — dùng chung với p2-07 (bảng cuộc họp toàn nền tảng) ─────
  meeting: {
    SCHEDULED: { variant: 'info', label: 'Sắp tới' },
    LIVE: { variant: 'success', label: 'Đang diễn ra' },
    ENDED: { variant: 'neutral', label: 'Đã kết thúc' },
    CANCELLED: { variant: 'error', label: 'Đã huỷ' },
  },
  // ── p2-06 (ghi hình cuộc họp) — vòng đời `MeetingRecording.status` ──────────
  recording: {
    STARTING: { variant: 'info', label: 'Đang bắt đầu' },
    RECORDING: { variant: 'warning', label: 'Đang ghi' },
    STOPPING: { variant: 'warning', label: 'Đang dừng' },
    PROCESSING: { variant: 'info', label: 'Đang xử lý' },
    READY: { variant: 'success', label: 'Sẵn sàng' },
    FAILED: { variant: 'error', label: 'Lỗi' },
  },
  // ── p2-07 (vận hành gọi & họp) — `Call.status`, `Call.endReason`, sức khoẻ hạ tầng media ────
  call: {
    RINGING: { variant: 'info', label: 'Đang đổ chuông' },
    ACTIVE: { variant: 'success', label: 'Đang diễn ra' },
    ENDED: { variant: 'neutral', label: 'Đã kết thúc' },
  },
  callEndReason: {
    COMPLETED: { variant: 'success', label: 'Hoàn tất' },
    CANCELLED: { variant: 'neutral', label: 'Người gọi huỷ' },
    NO_ANSWER: { variant: 'warning', label: 'Không trả lời' },
    DECLINED: { variant: 'warning', label: 'Bị từ chối' },
    BUSY: { variant: 'warning', label: 'Máy bận' },
    FAILED: { variant: 'error', label: 'Lỗi' },
    REVOKED: { variant: 'warning', label: 'Mất quyền' },
    ARCHIVED: { variant: 'neutral', label: 'Đã lưu trữ' },
    HOST_ENDED: { variant: 'neutral', label: 'Chủ trì kết thúc' },
    FORCE_ENDED: { variant: 'error', label: 'Quản trị kết thúc' },
    EMPTY: { variant: 'neutral', label: 'Không còn ai' },
    MAX_DURATION: { variant: 'warning', label: 'Quá thời lượng' },
  },
  mediaHealth: {
    OK: { variant: 'success', label: 'Bình thường' },
    DEGRADED: { variant: 'warning', label: 'Suy giảm' },
    DOWN: { variant: 'error', label: 'Ngừng hoạt động' },
    DISABLED: { variant: 'neutral', label: 'Đã tắt' },
    UNKNOWN: { variant: 'neutral', label: 'Chưa rõ' },
  },
  // ── p5-01 (Live Quiz) — `LiveQuizSession.status` ─────────────────────────────
  liveQuiz: {
    WAITING: { variant: 'info', label: 'Đang chờ' },
    IN_PROGRESS: { variant: 'success', label: 'Đang diễn ra' },
    FINISHED: { variant: 'neutral', label: 'Đã kết thúc' },
    CANCELLED: { variant: 'error', label: 'Đã huỷ' },
  },
  // ── p6-03 (Mentor Connect) — `MentorPost.status` và `MentorEngagement.status` ─────
  mentorPost: {
    OPEN: { variant: 'success', label: 'Đang nhận đơn' },
    FULFILLED: { variant: 'info', label: 'Đã đủ cố vấn' },
    CLOSED: { variant: 'neutral', label: 'Đã đóng' },
  },
  mentorEngagement: {
    ACTIVE: { variant: 'success', label: 'Đang hoạt động' },
    ENDED: { variant: 'neutral', label: 'Đã kết thúc' },
  },
  // ── p0-04 (outbox) ───────────────────────────────────────────────────────
  outbox: {
    PENDING: { variant: 'warning', label: 'Chờ gửi' },
    DISPATCHING: { variant: 'info', label: 'Đang gửi' },
    DISPATCHED: { variant: 'success', label: 'Đã gửi' },
    FAILED: { variant: 'error', label: 'Thất bại' },
  },
  asset: {
    UPLOADING: { variant: 'info', label: 'Đang tải' },
    PROCESSING: { variant: 'info', label: 'Đang xử lý' },
    READY: { variant: 'success', label: 'Sẵn sàng' },
    REJECTED: { variant: 'error', label: 'Bị từ chối' },
  },
  order: {
    PENDING: { variant: 'warning', label: 'Chờ xử lý' },
    PROCESSING: { variant: 'info', label: 'Đang xử lý' },
    DONE: { variant: 'success', label: 'Hoàn tất' },
    CANCELLED: { variant: 'neutral', label: 'Đã huỷ' },
  },
  company: {
    PENDING: { variant: 'warning', label: 'Chờ duyệt' },
    APPROVED: { variant: 'success', label: 'Đã duyệt' },
    REJECTED: { variant: 'error', label: 'Bị từ chối' },
  },
  // ── p7-02 (chợ tài liệu, P1) — `MarketplaceListing.status` ───────────────
  listing: {
    PENDING_REVIEW: { variant: 'warning', label: 'Chờ duyệt' },
    ACTIVE: { variant: 'success', label: 'Đang bán' },
    HIDDEN: { variant: 'error', label: 'Đã ẩn' },
    WITHDRAWN: { variant: 'neutral', label: 'Đã gỡ' },
  },
};

/** Giá trị chưa khai trong bảng → nhãn CHÍNH giá trị đó, tông trung tính (an toàn, không đoán màu). */
export function statusBadge(kind: keyof typeof MAP, value: string): StatusBadgeMeta {
  return MAP[kind][value] ?? { variant: 'neutral', label: value };
}
