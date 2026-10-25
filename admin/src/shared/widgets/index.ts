/**
 * Widgets — khung app dùng chung (không thuộc feature nào).
 *
 * Mỗi widget là một thư mục có `*.theme.ts` colocate chứa token + `tv()`
 * recipe; JSX chỉ gọi `slots.xxx()` (xem `widget-composition.md`).
 *
 * ⚠️ Đây là barrel TIỆN LỢI. Layout gốc nên import thẳng theo widget
 * (`@/shared/widgets/header` · `@/shared/widgets/dock`) để không kéo cả Dock
 * vào chunk chỉ vì cần Header.
 */
/* `./header` đã có named export `Header` — KHÔNG khai lại kèm `export *`, hai
   nguồn cùng tên làm star-export thành ambiguous và bị loại im lặng. */
export * from './header';
export * from './dock';
export * from './upload-center';
export * from './charts';
export * from './audit-trail';
export * from './workspace-picker';
