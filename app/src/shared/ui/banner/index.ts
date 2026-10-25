/**
 * Barrel của nhóm `banner` — dải đầu màn "cửa vào" phân hệ. Đã nối vào `src/shared/ui/index.ts`.
 *
 * `BANNER_TONE` cố ý KHÔNG xuất ra ngoài nhóm: nó là bảng token cho hình SVG, chỉ `ModuleBanner` và hình của
 * `EmptyState` cần (nhập tương đối `../banner/banner-tone`). Nơi khác cần ô icon có tông thì dùng `IconTile`.
 */
export { ModuleBanner } from './ModuleBanner';
export type { ModuleBannerProps } from './ModuleBanner';
export type { BannerTone } from './banner-tone';
