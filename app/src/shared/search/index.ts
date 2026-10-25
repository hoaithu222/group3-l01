/**
 * Mặt tiền "tìm kiếm" DÙNG CHUNG (p5-04). Nằm ở `shared/` chứ không trong `discovery`: tìm trong kênh/hội thoại (p1-09) và
 * tìm toàn nhóm (p5-04, `workspace-search`) cùng cần tô nổi kết quả, kiểm từ khoá, phân loại lỗi 404/429 và mở đúng tin —
 * hai feature không được import chéo nhau (`docs/rules/feature-structure.md`), cùng cách `shared/saved`.
 */
export { HighlightedText, DEFAULT_HIGHLIGHT_CLASS } from './HighlightedText';
export type { HighlightedTextProps } from './HighlightedText';
export { splitByHighlights } from './highlight';
export type { TextHighlight, TextSegment } from './highlight';
export { buildMessageHref, openMessage } from './open-message';
export type { OpenMessageScopeType, OpenMessageTarget } from './open-message';
export { PartialResultNotice } from './PartialResultNotice';
export { RateLimitNotice } from './RateLimitNotice';
export type { RateLimitNoticeProps } from './RateLimitNotice';
export { describeSearchError } from './search-error';
export type { SearchErrorInfo, SearchErrorKind } from './search-error';
export { DEFAULT_SEARCH_LIMITS, SEARCH_ISSUE_HINT, validateSearchText } from './search-text';
export type { SearchLimits, SearchTextCheck, SearchTextIssue } from './search-text';
