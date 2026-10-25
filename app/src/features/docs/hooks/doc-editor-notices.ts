import type { ToastType } from '@/shared/utils/toast.utils';

import type { NoticeCode } from '../webview/doc-editor-bridge.types';

/**
 * Thông báo từ server collab (README §3.5) → toast. `SAVE_FAILED`/`SAVE_RECOVERED` KHÔNG có ở đây: chúng đã nằm trong `status.saveFailed` và
 * hiện ở chấm trạng thái ("Chưa lưu được — sẽ thử lại" → "Đã lưu") — toast mỗi lần BE chớp tắt là spam. `READ_ONLY`/`ARCHIVED` thì `status`
 * cũng đổi (ẩn toolbar, hiện banner), toast chỉ để người đang gõ hiểu VÌ SAO ô nhập vừa khoá.
 */
export const NOTICE_TEXT: Partial<Record<NoticeCode, { text: string; type: ToastType }>> = {
  ARCHIVED: { text: 'Tài liệu vừa được lưu trữ — chỉ còn xem được.', type: 'info' },
  READ_ONLY: { text: 'Quyền của bạn vừa đổi: chỉ còn xem được tài liệu này.', type: 'info' },
  RESTORED: { text: 'Tài liệu vừa được khôi phục về một phiên bản cũ.', type: 'info' },
  TOO_LARGE: { text: 'Tài liệu quá lớn nên không thể thêm nội dung nữa.', type: 'error' },
};

/** Lý do editor từ chối lệnh (`commandResult.reason`) → câu tiếng Việt; lý do khác (lệnh không áp dụng tại con trỏ…) im lặng. */
export const COMMAND_REJECT_TEXT: Record<string, string> = {
  loading: 'Tài liệu đang tải, thử lại sau giây lát.',
  'read-only': 'Bạn chỉ có quyền xem tài liệu này.',
  'too-large': 'Tài liệu đã đầy, không thêm được nội dung.',
};
