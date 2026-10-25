/**
 * Page-header subgroup — barrel.
 *
 * Page KHÔNG cần import qua đây: barrel gốc `@/shared/widgets/header` đã
 * re-export trọn bộ. File này phục vụ import nội bộ trong header cho gọn.
 */
export { default as PageHeader } from './PageHeader';
export type { PageHeaderProps } from './PageHeader';
export { default as PageHeaderBack } from './PageHeaderBack';
export type { PageHeaderBackProps } from './PageHeaderBack';
export { default as PageHeaderChip, ChipSurface } from './PageHeaderChip';
export type {
  PageHeaderChipAnchor,
  PageHeaderChipProps,
  PageHeaderChipSide,
} from './PageHeaderChip';
export { default as PageHeaderNav } from './PageHeaderNav';
export type { PageHeaderNavAction, PageHeaderNavConfig, PageHeaderNavItem } from './PageHeaderNav';
export { useQueryTabNav } from './useQueryTabNav';
export type { QueryTabOption, UseQueryTabNavOptions } from './useQueryTabNav';
export { default as PageHeaderTitle } from './PageHeaderTitle';
export type { PageHeaderTitleProps, PageHeaderTitleSize } from './PageHeaderTitle';
export { HeaderSlotsProvider, HeaderSlotPortal } from './page-header-slots';
export type { HeaderSlotName } from './page-header-context';
/**
 * ⛔ CHỈ CÒN HAI recipe. `pageChipStyles` cũ đã GỘP vào `pageNavStyles`: dải chip
 *    và từng chip là MỘT hệ hình khối (`root` · `item` · `surface` · `edge` ·
 *    `face` · `label`), tách làm hai recipe là kiểu gì cũng lệch nhau một bậc
 *    đệm hoặc một nấc cỡ chữ.
 */
export { PAGE_CHIP_HEIGHT, pageHeaderStyles, pageNavStyles } from './page-header.theme';
