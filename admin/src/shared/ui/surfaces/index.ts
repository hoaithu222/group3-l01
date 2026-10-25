/**
 * Mặt nền — panel, khung HUD, thẻ số liệu
 *
 * Thêm component mới vào nhóm này thì thêm dòng export ở đây.
 */

export { default as Surface } from './Surface';
export type { SurfaceProps, SurfacePadding, SurfaceTone } from './Surface';
/* HudCorners: BoxInfo/SummaryCard dùng làm phần nhấn góc, và nền màn xác thực
   (`features/auth/AuthBackdrop`) cần ĐÚNG bốn ngoặc góc ghim khung nhìn mà không kèm khung — không có
   component công khai nào cho đúng thứ đó. Trước đây nó bị coi là helper nội bộ nên AuthBackdrop phải
   import sâu `@/shared/ui/surfaces/HudCorners` (phá luật "chỉ import qua barrel"); xuất ra là chỗ sửa ở gốc. */
export { default as HudCorners } from './HudCorners';
export type { HudCornerVariant, HudCornersProps } from './HudCorners';
export { default as BoxInfo } from './BoxInfo';
export type { BoxInfoProps, BoxInfoItem, BoxInfoItemColor } from './BoxInfo';
export { default as HudInfoBox } from './HudInfoBox';
export type { HudInfoBoxProps } from './HudInfoBox';
export { default as SummaryCard } from './SummaryCard';
export type { SummaryCardProps, BoldSystemIconName } from './SummaryCard';
export { default as CompactKpiCard } from './CompactKpiCard';
export type { CompactKpiCardProps, CompactKpiCardColor } from './CompactKpiCard';
export { default as CardScreenshort } from './CardScreenshort';
export type {
  CardScreenshortProps,
  CardScreenshortActionIcon,
  CardScreenshortAspect,
  CardScreenshortCaptionPos,
  CardScreenshortOverlay,
  CardScreenshortRounded,
  CardScreenshortSize,
  CardScreenshortVariant,
} from './CardScreenshort';
export { default as SummaryPill } from './SummaryPill';
export type { SummaryPillProps, SummaryPillColor, SummaryPillSize } from './SummaryPill';
export { default as BoxPanel } from './BoxPanel';
export type { BoxPanelProps, BoxPanelVariant } from './BoxPanel';
export { default as HudFrame } from './HudFrame';
export type { HudFrameProps, HudFrameTone, HudFrameIntensity, HudFrameWeight } from './HudFrame';
/* `hud-frame-decor` là lớp trang trí NỘI BỘ của HudFrame — KHÔNG xuất
   (kit2-architecture §1); bật qua `<HudFrame intensity="prime">`. */
export { default as PanelCard } from './PanelCard';
export type { PanelCardProps } from './PanelCard';
export type { PanelCardDensity, PanelCardVariant } from './panel-card.theme';
export { default as Splitter } from './Splitter';
export type { SplitterProps, SplitterOrientation } from './Splitter';
export { splitterStyles } from './splitter.theme';
