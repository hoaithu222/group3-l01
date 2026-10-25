import type { SavedScopeInfo } from '../api/discovery.types';

/** Nội dung một dòng tin ghim — nguồn duy nhất nằm ở `chat` (thanh ghim ở đầu phòng chat dùng chung, không viết bản thứ hai). */
export { pinnedExcerpt } from '@/features/chat';

/** Dòng "ở đâu" của một mục "Đã lưu": `#kênh` (kèm "Riêng tư") · `Nhóm chat: tên` · tên người (1-1). */
export function savedScopeLabel(scope: SavedScopeInfo): string {
  if (scope.type === 'CHANNEL') return `#${scope.name}${scope.isPrivate ? ' · Riêng tư' : ''}`;
  if (scope.kind === 'GROUP') return `Nhóm chat: ${scope.name}`;
  return scope.name || 'Tin nhắn trực tiếp';
}
