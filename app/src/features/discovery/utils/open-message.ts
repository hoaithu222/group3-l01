/**
 * Mở đúng một tin đã nâng lên `@/shared/search` (p5-04): tệp đính kèm ở tìm toàn nhóm cũng mở tin gốc và hai feature
 * không được import chéo nhau. Cửa cũ giữ lại để `discovery` và test không phải đổi đường dẫn.
 */
export { buildMessageHref, openMessage } from '@/shared/search/open-message';
export type { OpenMessageTarget } from '@/shared/search/open-message';
