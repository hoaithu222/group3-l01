import type { IconName } from '@/shared/ui/icon';
import { includesSearch } from '@/shared/utils/format/string.utils';

import type { RecapInline } from './recap-markdown';

/**
 * Icon cho một TIÊU ĐỀ NHỎ (`### …`) của biên bản — mốc nhìn cho ba khối mà mẫu biên bản gợi ý (`RECAP_PLACEHOLDER`: Mục tiêu ·
 * Quyết định · Việc cần làm) cùng vài cách gọi hay gặp. Chỉ là TRANG TRÍ: nghĩa nằm ở chữ tiêu đề, đoán không ra thì rơi về icon tài
 * liệu chung — không bao giờ ẩn/đổi nội dung người viết.
 *
 * So khớp BỎ DẤU qua `includesSearch` (bộ so khớp chung của ô tìm kiếm): "Quyết định" ≡ "quyet dinh", người gõ không dấu vẫn có icon đúng.
 */
const RULES: readonly { icon: IconName; words: readonly string[] }[] = [
  { icon: 'checkmark-square', words: ['việc cần làm', 'hành động', 'công việc', 'action', 'todo'] },
  { icon: 'checkmark-circle', words: ['quyết định', 'kết luận', 'thống nhất', 'decision'] },
  { icon: 'star', words: ['mục tiêu', 'mục đích', 'goal'] },
  { icon: 'chat-bubble', words: ['thảo luận', 'ý kiến', 'trao đổi', 'discussion'] },
  { icon: 'calendar', words: ['buổi sau', 'tiếp theo', 'lịch', 'next'] },
];

const FALLBACK_ICON: IconName = 'document';

export function recapHeadingIcon(nodes: readonly RecapInline[]): IconName {
  const text = nodes.map((node) => node.text).join('');
  return (
    RULES.find((rule) => rule.words.some((word) => includesSearch(text, word)))?.icon ??
    FALLBACK_ICON
  );
}
