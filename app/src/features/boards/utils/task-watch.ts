import type { TaskWatcher, TaskWatchers, TaskWatchStatus } from '../api/task-detail.types';

/** Dòng trạng thái theo dõi của TÔI — chữ (không chỉ màu/icon) để trình đọc màn hình và người mù màu cùng hiểu. */
export function watchHeadline(me: TaskWatchStatus): string {
  return me.watching ? 'Đang theo dõi thẻ này' : 'Chưa theo dõi thẻ này';
}

/**
 * Vì sao tôi đang (không) theo dõi + theo dõi thì nhận gì. `state` chỉ là NGUỒN của trạng thái: `null` = chưa chọn (người làm/người tạo vẫn
 * được theo dõi ngầm định), `AUTO_ON` do hệ thống ghi khi tôi bình luận/được nhắc tên, `EXPLICIT_*` là lựa chọn của chính tôi.
 * Tắt theo dõi CHỈ tắt thông báo bình luận + nhắc hạn — thông báo được giao việc/được nhắc tên vẫn gửi (BE `task-watch.service.ts`).
 */
export function watchExplanation(me: TaskWatchStatus): string {
  switch (me.state) {
    case 'EXPLICIT_ON':
      return 'Bạn nhận thông báo bình luận và nhắc hạn của thẻ.';
    case 'AUTO_ON':
      return 'Tự bật vì bạn đã bình luận hoặc được nhắc tên. Bạn nhận thông báo bình luận và nhắc hạn của thẻ.';
    case 'EXPLICIT_OFF':
      return 'Đã tắt thông báo bình luận và nhắc hạn. Thông báo được giao việc hoặc nhắc tên vẫn gửi bình thường.';
    default:
      return me.watching
        ? 'Bạn là người làm hoặc người tạo thẻ nên nhận thông báo bình luận và nhắc hạn.'
        : 'Theo dõi để nhận thông báo bình luận và nhắc hạn của thẻ.';
  }
}

export const WATCHER_STATE_LABEL: Record<TaskWatcher['state'], string> = {
  AUTO_ON: 'Tự động theo dõi',
  EXPLICIT_OFF: 'Đã tắt theo dõi',
  EXPLICIT_ON: 'Đã chọn theo dõi',
  IMPLICIT: 'Người làm / người tạo',
};

/** "3 người theo dõi" — số nhiều không đổi dạng trong tiếng Việt. */
export function watcherCountText(total: number): string {
  return total > 0 ? `${total} người theo dõi` : 'Chưa có người theo dõi';
}

/** Ghi trạng thái theo dõi của TÔI vào cache `watchers` (giữ danh sách; danh sách/`total` do lượt tải lại làm đúng). */
export function withMyWatchStatus(data: TaskWatchers, me: TaskWatchStatus): TaskWatchers {
  return { ...data, me };
}
