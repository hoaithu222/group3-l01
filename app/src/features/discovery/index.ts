/**
 * Mặt tiền công khai của `discovery` (p1-09): lưu tin · danh sách ghim · tìm trong kênh/hội thoại.
 *
 * Các route trỏ THẲNG vào `screens/*` (cùng cách mọi feature khác). Các feature còn lại KHÔNG import feature này —
 * nối bằng ĐƯỜNG DẪN typed (`router.push`): header kênh/hội thoại mở `…/search`, `…/pins`; tab Tôi mở `PATHS.ME_SAVED`;
 * mục "Lưu/Bỏ lưu" của menu tin đi qua `@/shared/saved` (xem `docs/rules/feature-structure.md`).
 */
export { SavedScreen } from './screens/SavedScreen';
export { PinnedListScreen } from './screens/PinnedListScreen';
export { ScopeSearchScreen } from './screens/ScopeSearchScreen';
export {
  ChannelPinnedScreen,
  ChannelSearchScreen,
  ConversationPinnedScreen,
  ConversationSearchScreen,
} from './screens/scope-route-screens';
