/**
 * Header widget — public API.
 *
 *   import Header, { HeaderSlotsProvider, PageHeader } from '@/shared/widgets/header';
 *
 * `HeaderSlotsProvider` PHẢI bọc CẢ `<Header>` lẫn vùng nội dung, nếu không
 * `<PageHeader>` của page không tìm được đích portal (không crash — chỉ im lặng
 * không hiện gì).
 */
export { default } from './Header';
export { default as Header } from './Header';
export type { HeaderProps } from './Header';

/**
 * Kiểu bố cục cụm tâm (canh giữa / sát trái) — store CỤC BỘ của widget, lưu
 * localStorage. Xuất ra đây để menu người dùng của app gắn được mục "Kiểu
 * header"; KHÔNG truyền qua prop, để lựa chọn của người dùng không bị mỗi nơi
 * gọi `<Header>` ghi đè một kiểu.
 */
export {
  HEADER_LAYOUT_LABEL,
  HEADER_LAYOUT_ORDER,
  useHeaderLayout,
  useHeaderLayoutStore,
  type HeaderLayout,
} from './header-layout.store';

export { default as Logo } from './nav/Logo';
export { RealtimeStatusIndicator } from './realtime-status';
export { default as UserMenu } from './user/UserMenu';
export type { HeaderUser } from './user/UserMenu';
export { USER_MENU_ACTIONS } from './user/user-menu.constants';
export type { UserMenuActionConfig, UserMenuKey } from './user/user-menu.constants';

export * from './page-header';

export {
  HEADER_CONTROL_HEIGHT,
  HEADER_ICON_BUTTON_ACTIVE,
  HEADER_ICON_BUTTON_CLASS,
  HEADER_SCROLL_FADE_CLASS,
  headerStyles,
} from './header.theme';
/* `PAGE_CHIP_HEIGHT` + recipe của page-header re-export qua `./page-header`. */
