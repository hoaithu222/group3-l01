import type { InboxItem } from '@/core/notifications';

import { activityIconFor, activityToneFor } from '../utils/activity-icon';
import { describeActivity } from '../utils/describe-item';

/**
 * p7-04: hai loại thông báo của chat mở rộng vào hộp thư (BE `chat-extensions-notification-types.ts`: `inbox: true`). Không được rơi về câu chung "Bạn có thông báo mới"
 * hay biểu tượng chuông mặc định; câu trung tính — KHÔNG nội dung tin, KHÔNG tên kênh (push/hộp thư chỉ mang id).
 */
const item = (type: string): InboxItem => ({ actor: null, context: null, id: 'n-1', refs: {}, type, unavailable: false }) as unknown as InboxItem;

describe('hộp thư Hoạt động — chat mở rộng (p7-04)', () => {
  it('message.reminder: câu riêng + chuông "noti" (không rơi về chat-bubble của tiền tố `message.`)', () => {
    expect(describeActivity(item('message.reminder')).title).toBe('Bạn có một lời nhắc tin nhắn');
    expect(activityIconFor('message.reminder')).toBe('noti');
    expect(activityToneFor('message.reminder')).toBe('warning');
    expect(activityIconFor('message.new')).toBe('chat-bubble'); // tiền tố `message.` giữ nguyên cho loại khác
  });

  it('scheduled-message.failed: câu riêng + biểu tượng hẹn giờ', () => {
    expect(describeActivity(item('scheduled-message.failed')).title).toBe('Một tin nhắn hẹn giờ của bạn không gửi được');
    expect(activityIconFor('scheduled-message.failed')).toBe('timer');
    expect(activityToneFor('scheduled-message.failed')).toBe('accent');
  });
});
