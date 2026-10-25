/**
 * Dock widget — public API.
 *
 *   import { Dock, type DockItemConfig } from '@/shared/widgets/dock';
 *
 *   <Dock items={[{ id: 'home', label: 'Trang chủ', icon: 'house-outline', href: '/' }]} />
 *
 * Chế độ hiển thị (ghim / thu gọn / tự ẩn / ẩn hẳn) và công tắc phóng lân cận
 * do `useDockSettings` giữ và lưu vào localStorage — KHÔNG truyền qua prop, để
 * lựa chọn của người dùng không bị mỗi nơi gọi ghi đè một kiểu.
 */
export { default as Dock } from './Dock';
export type { DockProps } from './Dock';
export { default as DockItem } from './DockItem';
export { default as DockSettingsButton } from './DockSettingsButton';
export type { DockItemConfig } from './dock-items.config';
export {
  DEFAULT_DOCK_SETTINGS,
  DOCK_MODE_OPTIONS,
  useDockSettings,
  type DockDisplayMode,
  type DockModeOption,
  type DockSettings,
} from './dock-settings';
export { useDockDisplayMode } from './useDockDisplayMode';
export {
  DOCK_BOTTOM_CLASS,
  DOCK_BOTTOM_COLLAPSED_CLASS,
  DOCK_DURATION,
  DOCK_EASE,
  DOCK_ENTER_CLASS,
  DOCK_HINT_CLASS,
  DOCK_MAGNIFY_CONTAINER_CLASS,
  DOCK_MAGNIFY_ITEM_CLASS,
  DOCK_NARROW_FIT_CLASS,
  DOCK_TRIGGER_ZONE,
  dockSettingsStyles,
  dockStyles,
} from './dock.theme';
