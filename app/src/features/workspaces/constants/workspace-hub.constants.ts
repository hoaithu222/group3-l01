import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';

/**
 * Phần TĨNH của một lối vào ở tổng quan nhóm (`useWorkspaceHubEntries`): khoá · nhãn · icon · tông ô icon · mô tả không đổi theo
 * vai. Tách khỏi hook để hook chỉ giữ LUẬT (lọc theo vai trò/cờ phân hệ + điều hướng) và nằm dưới trần 150 dòng (`check:file-size`).
 */
export interface WorkspaceHubEntryDef {
  /** Mô tả khi KHÔNG phụ thuộc vai trò/dữ liệu. Vắng ⇒ hook tự đặt theo vai (Thành viên, Tích hợp, Tài liệu, Bảng trắng). */
  description?: string;
  icon: IconName;
  key: string;
  label: string;
  tone: IconTileTone;
}

/**
 * ── Tông CỐ ĐỊNH theo phân hệ, không xoay theo vị trí dòng ─────────────────────────────────────────────────────────
 * ⚠️ Trước đây `WorkspaceHubCard` xoay tông theo CHỈ SỐ dòng ⇒ tắt một cờ (vd `wallet`) là mọi dòng phía sau đổi màu, và "Lịch
 * họp" ở đây khác màu "Lịch họp" ở Trang chủ. Giờ mỗi phân hệ MỘT tông, khớp bảng nhận diện của Trang chủ khi có (Kênh = Tin
 * nhắn `brand`, Lịch họp `info`, Tìm cố vấn `warning`); dòng còn lại chọn sao cho hai dòng liền nhau khác tông. `neutral` cho
 * dòng cấu hình (Tích hợp). ⛔ Không dùng `danger`: không lối vào nào là việc phá huỷ.
 *
 * ⚠️ Kiểm tra trùng lặp dùng `copy` (hai trang chồng nhau = "bản trùng") thay vì `document` — trước đây trùng icon với dòng
 * "Tài liệu cộng tác" đứng ngay gần, hai dòng khác việc mà trông như một.
 */
export const WORKSPACE_HUB_ENTRY = {
  channels: {
    description: 'Xem và tham gia các kênh trong nhóm',
    icon: 'chat-bubble',
    key: 'channels',
    label: 'Kênh',
    tone: 'brand',
  },
  members: { icon: 'user', key: 'members', label: 'Thành viên', tone: 'accent' },
  meetings: {
    description: 'Lên lịch và xem các cuộc họp của bạn',
    icon: 'calendar',
    key: 'meetings',
    label: 'Lịch họp',
    tone: 'info',
  },
  wallet: {
    description: 'Ghi khoản chi, chia tiền và xem ai nợ ai',
    icon: 'money',
    key: 'wallet',
    label: 'Ví nhóm',
    tone: 'success',
  },
  leaderboard: {
    description: 'Ai tích cực nhất nhóm tuần này, tháng này',
    icon: 'chart-1',
    key: 'leaderboard',
    label: 'Xếp hạng',
    tone: 'warning',
  },
  integrations: { icon: 'link', key: 'integrations', label: 'Tích hợp', tone: 'neutral' },
  docs: { icon: 'document', key: 'docs', label: 'Tài liệu cộng tác', tone: 'info' },
  whiteboards: { icon: 'edit', key: 'whiteboards', label: 'Bảng trắng', tone: 'accent' },
  mentor: {
    description: 'Đăng bài tìm cố vấn và duyệt đơn ứng tuyển của nhóm',
    icon: 'support',
    key: 'mentor',
    label: 'Tìm cố vấn',
    tone: 'warning',
  },
  plagiarism: {
    description: 'So dấu vân tay văn bản/mã nguồn giữa các tài liệu trong nhóm',
    icon: 'copy',
    key: 'plagiarism',
    label: 'Kiểm tra trùng lặp',
    tone: 'success',
  },
} as const satisfies Record<string, WorkspaceHubEntryDef>;

/**
 * Lối vào lên LƯỚI Ô của "Lối vào nhanh" (`WorkspaceHubCard`) — các nơi người dùng mở HẰNG NGÀY: trò chuyện, người, lịch,
 * soạn chung, tiền, xếp hạng (cùng ý "lối tắt" của Slack/Teams). Lối vào còn lại là CÔNG CỤ cấu hình/quản trị (Tích hợp ·
 * Tìm cố vấn · Kiểm tra trùng lặp) — xuống danh sách gọn bên dưới lưới, có mô tả vì tên chưa tự nói hết việc.
 * ⚠️ Chỉ là chỗ ĐẶT; luật ẩn/hiện theo vai trò và cờ phân hệ vẫn chỉ ở `useWorkspaceHubEntries`.
 */
export const WORKSPACE_HUB_TILE_KEYS: ReadonlySet<string> = new Set([
  WORKSPACE_HUB_ENTRY.channels.key,
  WORKSPACE_HUB_ENTRY.members.key,
  WORKSPACE_HUB_ENTRY.meetings.key,
  WORKSPACE_HUB_ENTRY.wallet.key,
  WORKSPACE_HUB_ENTRY.leaderboard.key,
  WORKSPACE_HUB_ENTRY.docs.key,
  WORKSPACE_HUB_ENTRY.whiteboards.key,
]);
