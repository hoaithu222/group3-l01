/**
 * `splitByHighlights` đã nâng lên `@/shared/search` (p5-04): tìm toàn nhóm (`workspace-search`) cũng cần và hai feature
 * không được import chéo nhau. Giữ file này làm cửa cũ để `discovery` và test hiện có không phải đổi đường dẫn.
 */
export { splitByHighlights } from '@/shared/search/highlight';
export type { TextSegment } from '@/shared/search/highlight';
