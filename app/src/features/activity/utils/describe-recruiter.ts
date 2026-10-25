import type { InboxItem } from '@/core/notifications';

import { refText, type ActivityDescription } from './describe-helpers';

/** Trạng thái doanh nghiệp (`refs.status` của `company.status-changed`) — cùng câu với mẫu push của BE (`recruiter.notification-types.ts`). */
const COMPANY_STATUS_TITLES: Record<string, string> = {
  APPROVED: 'Doanh nghiệp của bạn đã được duyệt',
  PENDING: 'Doanh nghiệp của bạn đang chờ duyệt',
  REJECTED: 'Doanh nghiệp của bạn chưa được duyệt',
  SUSPENDED: 'Doanh nghiệp của bạn đang tạm ngưng',
};

/**
 * Recruiter board (p6-08): `job-offer.*` và `company.*` của BE. Hộp thư chỉ mang id + TÊN doanh nghiệp (dữ liệu công khai của công ty đã duyệt) — ⛔ không có
 * tiêu đề/nội dung lời mời hay tin nhắn (CR-47). `job-offer.responded` và `company.*` thực tế là thông báo cho phía doanh nghiệp (admin web) nhưng vẫn khai để
 * người dùng vừa là sinh viên vừa là nhân sự không thấy câu chung "Bạn có thông báo mới". `null` = không phải loại của nhóm này.
 */
export function describeRecruiter(item: InboxItem): ActivityDescription | null {
  switch (item.type) {
    case 'job-offer.received': {
      const company = refText(item, 'companyName');
      return {
        title: company ? `${company} đã gửi lời mời cho bạn` : 'Bạn có lời mời việc làm mới',
      };
    }
    case 'job-offer.message':
      return { title: 'Có tin nhắn mới trong một lời mời việc làm' };
    case 'job-offer.responded':
      return {
        title:
          refText(item, 'status') === 'INTERESTED'
            ? 'Một ứng viên quan tâm lời mời của bạn'
            : 'Một ứng viên đã phản hồi lời mời của bạn',
      };
    case 'company.status-changed':
      return {
        title:
          COMPANY_STATUS_TITLES[refText(item, 'status') ?? ''] ??
          'Trạng thái doanh nghiệp của bạn vừa thay đổi',
      };
    case 'company.needs-review':
      return { title: 'Có doanh nghiệp đang chờ vận hành duyệt' };
    default:
      return null;
  }
}
