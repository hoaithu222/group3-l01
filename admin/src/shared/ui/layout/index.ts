/**
 * Bố cục khung màn hình — vỏ trang, vùng cuộn, hàng công cụ, lưới thẻ
 *
 * Thêm component mới vào nhóm này thì thêm dòng export ở đây.
 */

export { default as AppShell } from './AppShell';
export { default as DetailPanelHeader } from './DetailPanelHeader';
export type { DetailPanelHeaderProps } from './DetailPanelHeader';
export { default as SectionHeader } from './SectionHeader';
export type { SectionHeaderProps } from './SectionHeader';
export { default as TitleScreen } from './TitleScreen';
export type { TitleScreenProps, TitleIconColor } from './TitleScreen';
export { default as PageShell } from './PageShell';
export type { PageShellProps, PageShellVariant } from './PageShell';
export { default as PageBody } from './PageBody';
export type { PageBodyProps, PageBodyOverflow } from './PageBody';
export { default as Toolbar } from './Toolbar';
export type { ToolbarProps, ToolbarBorder, ToolbarPadding } from './Toolbar';
export { default as BoxGrid } from './BoxGrid';
export type { BoxGridProps, BoxGridMin } from './BoxGrid';
