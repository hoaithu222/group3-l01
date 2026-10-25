import type { InboxItem } from '@/core/notifications';

import { refText, type ActivityDescription } from './describe-helpers';
import { describeRecruiter } from './describe-recruiter';

/** Câu cố định theo `type` — loại không cần tên/số liệu từ `refs`. Khoá = chuỗi `type` BE phát (`registerNotificationType`). */
const FIXED_TITLES: Record<string, string> = {
  'integration.error': 'Một kết nối tích hợp gặp lỗi — hãy kiểm tra lại',
  'mentor.accepted': 'Đơn cố vấn của bạn đã được chấp nhận',
  'mentor.application': 'Có đơn ứng tuyển cố vấn mới cho nhóm của bạn',
  'mentor.ended': 'Đợt cố vấn đã kết thúc',
  'mentor.ending-soon': 'Đợt cố vấn sắp kết thúc',
  'mentor.post-hidden': 'Bài tìm cố vấn của nhóm đã bị ẩn',
  'mentor.rejected': 'Nhóm đã phản hồi đơn ứng tuyển cố vấn của bạn',
  // p7-04: chat mở rộng — push/hộp thư trung tính (không nội dung tin, không tên kênh).
  'message.reminder': 'Bạn có một lời nhắc tin nhắn',
  'scheduled-message.failed': 'Một tin nhắn hẹn giờ của bạn không gửi được',
  'moderation.private-viewed': 'Đội kiểm duyệt đã xem nội dung bị báo cáo',
  'portfolio.build-failed': 'Chưa tạo được trang portfolio — mở hồ sơ để thử lại',
  'portfolio.taken-down': 'Portfolio của bạn đã bị gỡ do vi phạm quy định',
  'study.mock-auto-submitted': 'Hết giờ — bài thi thử của bạn đã được nộp tự động',
  'wallet.debt-reminder': 'Nhắc: bạn còn một khoản chưa thanh toán',
  'wallet.expense-added': 'Có khoản chi mới trong ví nhóm',
  'wallet.export-ready': 'Tệp xuất ví đã sẵn sàng',
  'wallet.settlement-confirmed': 'Khoản thanh toán của bạn đã được xác nhận',
  'wallet.settlement-pending': 'Có khoản thanh toán đang chờ bạn xác nhận',
  'wallet.settlement-rejected': 'Khoản thanh toán của bạn đã bị từ chối',
  'wallet.settlement-stale': 'Có khoản thanh toán chờ xác nhận đã lâu',
};

/** Đơn in (o2o): câu theo trạng thái, kèm mã đơn nếu có (`refs.code` — không chứa PIN/tên tệp/số tiền). */
const PRINT_ORDER_TITLES: Record<string, string> = {
  accepted: 'Tiệm đã nhận đơn in',
  cancelled: 'Đơn in đã bị huỷ',
  expired: 'Đơn in đã hết hạn nhận',
  expiring: 'Đơn in sắp hết hạn nhận — ghé tiệm sớm nhé',
  new: 'Có đơn in mới đang chờ tiệm nhận',
  'picked-up': 'Tài liệu của đơn in đã được nhận',
  ready: 'Tài liệu đã in xong — mang mã PIN tới tiệm',
  rejected: 'Tiệm đã từ chối đơn in',
};

/** Họp: câu theo loại, kèm tên cuộc họp nếu BE có gửi (`refs.scopeTitle`). */
const MEETING_TITLES: Record<string, string> = {
  cancelled: 'Cuộc họp đã bị huỷ',
  invited: 'Bạn được mời tham dự một cuộc họp',
  'recap-published': 'Biên bản họp đã có',
  'recap-reminder': 'Nhắc: hãy ghi và công bố biên bản họp',
  'recap-required': 'Cuộc họp cần có biên bản',
  'recording-ready': 'Bản ghi cuộc họp đã sẵn sàng',
  reminder: 'Cuộc họp sắp bắt đầu',
  removed: 'Bạn đã bị xoá khỏi một cuộc họp',
  'role-changed': 'Vai trò của bạn trong cuộc họp đã thay đổi',
  started: 'Cuộc họp đã bắt đầu',
  updated: 'Cuộc họp đã thay đổi',
};

/**
 * Câu cho các loại còn lại mà BE phát ra hộp thư (đối chiếu `registerNotificationType` ở `be/src/modules/**`): tích hợp, cố vấn, ví,
 * đơn in, học, huy hiệu/cấp độ, kỹ năng, kiểm duyệt (xem nội dung riêng tư), họp. `null` = không phải loại của nhóm này.
 * Chỉ dùng số liệu CÔNG KHAI trong `refs` (cấp, tên huy hiệu, tên kỹ năng, số thẻ ôn, mã đơn, tên họp) — đúng những gì mẫu push của BE đưa ra.
 */
export function describeMisc(item: InboxItem): ActivityDescription | null {
  const { type } = item;
  const fixed = FIXED_TITLES[type];
  if (fixed) return { title: fixed };

  switch (type) {
    case 'gamification.level-up': {
      const level = refText(item, 'level');
      return { title: level ? `Bạn đã lên cấp ${level}` : 'Bạn vừa lên cấp mới' };
    }
    case 'gamification.badge-unlocked': {
      const name = refText(item, 'name');
      return { title: name ? `Bạn vừa nhận huy hiệu ${name}` : 'Bạn vừa nhận một huy hiệu mới' };
    }
    case 'career.skill-unlocked': {
      const name = refText(item, 'name');
      return {
        title: name ? `Bạn vừa đạt huy hiệu kỹ năng ${name}` : 'Bạn vừa đạt một huy hiệu kỹ năng',
      };
    }
    case 'career.skill-revoked': {
      const name = refText(item, 'name');
      return {
        title: name
          ? `Huy hiệu kỹ năng ${name} đã được thu hồi`
          : 'Một huy hiệu kỹ năng đã được thu hồi',
      };
    }
    case 'study.sr-due-reminder': {
      const due = refText(item, 'dueCount');
      return { title: due ? `Bạn có ${due} thẻ cần ôn hôm nay` : 'Đến giờ ôn tập hôm nay' };
    }
    default:
      break;
  }

  if (type.startsWith('print-order.')) {
    const base = PRINT_ORDER_TITLES[type.slice('print-order.'.length)] ?? 'Đơn in có cập nhật';
    const code = refText(item, 'code');
    return { title: code ? `${base} (${code})` : base };
  }
  if (type.startsWith('meeting.')) {
    const base = MEETING_TITLES[type.slice('meeting.'.length)] ?? 'Cập nhật về cuộc họp';
    const title = refText(item, 'scopeTitle');
    return { title: title ? `${base}: ${title}` : base };
  }
  return describeRecruiter(item); // p6-08: `job-offer.*` + `company.*` (`null` khi không phải loại của nhóm đó)
}
