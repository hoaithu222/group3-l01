/**
 * Phân loại lỗi lượt tìm đã nâng lên `@/shared/search` (p5-04, `describeSearchError`): tìm toàn nhóm cũng cần và hai
 * feature không được import chéo nhau. Tên cũ của `discovery` giữ lại làm bí danh.
 */
export { describeSearchError as describeDiscoveryError } from '@/shared/search/search-error';
export type {
  SearchErrorInfo as DiscoveryErrorInfo,
  SearchErrorKind as DiscoveryErrorKind,
} from '@/shared/search/search-error';
