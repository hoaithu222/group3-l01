import type { InboxItem } from '@/core/notifications';

import {
  actorName,
  inScope,
  scopeLabel,
  type ActivityDescription,
  type DescribeOptions,
} from './describe-helpers';
import { describeMisc } from './describe-misc';
import { describeWorkspace } from './describe-workspace';
import { isInboxItemUnavailable } from './inbox-target';

export type { ActivityDescription, DescribeOptions } from './describe-helpers';

export const UNAVAILABLE_TITLE = 'Nội dung không còn khả dụng';

/**
 * Câu mô tả một mục hộp thư theo `type` (KHOÁ điều hướng) và `kind` (nhãn phân loại) — p1-07 `app.md` §3 "ActivityItem".
 *
 * ⛔ Mục mất quyền KHÔNG được hiện tên người/kênh/nhóm cũ (UX riêng §7): chỉ "Nội dung không còn khả dụng". BE đã xoá
 * `actor`/`scopeName`/`excerpt` nên ở đây tự nhiên không có gì để lộ — nhánh đầu này chỉ chốt lại cho chắc.
 *
 * Thứ tự tra: `switch` dưới đây (tin nhắn, thẻ, chấm chéo, kiểm duyệt, gọi…) → nhóm `workspace.*` (`describe-workspace.ts`) → các
 * loại còn lại (`describe-misc.ts`) → câu chung. ⚠️ BE phát thêm một `type` mới thì thêm câu vào MỘT trong ba nơi đó — đừng để
 * mục rơi về "Bạn có thông báo mới" (người dùng đã báo lỗi này với `workspace.member-added` / `workspace.admin-change`).
 */
export function describeActivity(item: InboxItem, options?: DescribeOptions): ActivityDescription {
  if (isInboxItemUnavailable(item)) return { title: UNAVAILABLE_TITLE };

  // ⚠️ BE chỉ điền `actor` cho mục thuộc TIN NHẮN (kênh/hội thoại). Thẻ/gọi/nhóm không có ⇒ `name` có thể trống, và các loại
  // đó có câu KHÔNG người ("Bạn được giao một thẻ") thay vì "Ai đó giao cho bạn một thẻ".
  const name = actorName(item);
  const who = name ?? 'Ai đó';
  const excerpt = item.context?.excerpt;
  const scope = inScope(item);
  const at = scopeLabel(item);

  switch (item.type) {
    case 'mention':
      return { excerpt, title: `${who} nhắc đến bạn${scope}` };
    case 'mention.role':
      return { excerpt, title: `${who} nhắc nhóm của bạn${scope}` };
    case 'thread.reply':
      return {
        excerpt,
        title:
          item.kind === 'FIRST_REPLY'
            ? `${who} đã trả lời tin nhắn của bạn${scope}`
            : `${who} trả lời luồng bạn theo dõi${scope}`,
      };
    case 'message.new':
      return { excerpt, title: `Tin nhắn mới${scope}` };
    case 'channel.private-added':
      return {
        title: at ? `Bạn được thêm vào kênh riêng tư ${at}` : 'Bạn được thêm vào một kênh riêng tư',
      };
    case 'conversation.added':
      return { title: at ? `Bạn được thêm vào nhóm ${at}` : 'Bạn được thêm vào một nhóm chat' };
    case 'channel.archived-notice':
      return { title: at ? `Kênh ${at} đã được lưu trữ` : 'Một kênh của bạn đã được lưu trữ' };
    case 'task.assigned':
      return { excerpt, title: name ? `${name} giao cho bạn một thẻ` : 'Bạn được giao một thẻ' };
    case 'task.comment':
      return {
        excerpt,
        title: name ? `${name} bình luận trên thẻ của bạn` : 'Có bình luận mới trên thẻ của bạn',
      };
    case 'task.comment-mention':
      return {
        excerpt,
        title: name
          ? `${name} nhắc đến bạn trong một bình luận`
          : 'Bạn được nhắc đến trong một bình luận',
      };
    case 'task.due-soon':
      return { title: 'Một thẻ của bạn sắp đến hạn' };
    // p4-04: thẻ của người làm bị dời lịch do thẻ trước đổi hạn / lô dời lịch nền (> 200 thẻ) đã xong.
    case 'task.rescheduled':
      return {
        excerpt,
        title: name ? `${name} đã dời lịch một thẻ của bạn` : 'Một thẻ của bạn đã được dời lịch',
      };
    case 'task.reschedule-batch-done':
      return { excerpt, title: 'Lịch các thẻ phía sau đã được dời xong' };
    // p4-05: chấm chéo — hộp thư chỉ mang id + tiêu đề thẻ, KHÔNG có điểm/nhận xét (chỉ xem ở khối Chấm chéo của thẻ, đã lọc theo người xem).
    case 'review.requested':
      return { title: 'Bạn được giao chấm một thẻ' };
    case 'review.reminder':
      return { title: 'Nhắc: có thẻ đang chờ bạn chấm' };
    case 'review.cancelled':
      return { title: 'Bạn không còn phải chấm một thẻ' };
    case 'review.changes-requested':
      return { title: 'Thẻ của bạn cần sửa theo yêu cầu của người chấm' };
    case 'review.approved':
      return { title: 'Thẻ của bạn đã đủ lượt duyệt' };
    case 'review.waived':
      return { title: 'Thẻ của bạn được miễn chấm' };
    case 'review.shortage':
      return { title: 'Nhóm thiếu người chấm cho chấm chéo' };
    // p4-06: xuất PDF báo cáo đóng góp xong / lỗi — hộp thư chỉ mang id, không có tên thành viên hay số liệu.
    case 'contribution.export-ready':
      return { title: 'Báo cáo đóng góp đã sẵn sàng' };
    case 'contribution.export-failed':
      return { title: 'Không tạo được báo cáo đóng góp' };
    case 'moderation.request':
      return { title: 'Có báo cáo mới cần bạn xem xét' };
    case 'moderation.report-resolved':
      return { title: 'Báo cáo của bạn đã được xử lý' };
    case 'moderation.content-removed':
      return { title: 'Một tin nhắn của bạn đã bị gỡ' };
    case 'moderation.warning':
      return { title: 'Bạn nhận được một lời nhắc nhở từ người kiểm duyệt' };
    case 'call.missed':
      return { title: name ? `Cuộc gọi nhỡ từ ${name}` : 'Bạn có một cuộc gọi nhỡ' };
    // p5-04: thông báo kênh cần bấm "Tôi đã đọc" — lúc yêu cầu, và lúc nhắc người CHƯA xác nhận trước hạn.
    case 'announcement.required':
      return { excerpt, title: `${who} yêu cầu bạn xác nhận đã đọc một thông báo${scope}` };
    case 'announcement.reminder':
      return { excerpt, title: `Nhắc: bạn chưa xác nhận đã đọc một thông báo${scope}` };
    default:
      break;
  }
  const grouped = describeWorkspace(item, options) ?? describeMisc(item);
  if (grouped) return grouped;
  return { excerpt, title: 'Bạn có thông báo mới' };
}
