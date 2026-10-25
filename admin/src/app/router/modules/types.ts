/**
 * Kiểu cho Module Registry.
 *
 * NGUỒN DUY NHẤT: mọi thứ về một phân hệ (đường dẫn, tiêu đề, icon, quyền,
 * trang, route con) khai đúng một chỗ trong registry. Thêm phân hệ mới =
 * thêm 1 file `{id}.routes.tsx` + 1 dòng trong `module-registry.ts`;
 * route, menu, breadcrumb và guard tự đồng bộ theo.
 *
 * Nơi tiêu thụ:
 *  - `build-routes.tsx`   → registry → `RouteObject[]` cho React Router
 *  - Dock / menu          → lọc theo quyền để dựng danh sách điều hướng
 *  - `PermissionGuard`    → kiểm `permission` trước khi mount
 */

import type { ComponentType } from 'react';

import type { SystemIconName } from '@/shared/ui';
import type { PermissionRequirement } from '../permission/permission.types';
import type { FeatureFlagSpec } from './feature-flag.utils';

/**
 * Vai đăng nhập admin (D-05) — quyết định TẬP phân hệ hiển thị trong menu.
 *
 * `ops` là mặc định (nhân viên vận hành nội bộ). `recruiter`/`partner` là vai
 * "cổng ngoài" (nhà tuyển dụng, chủ tiệm in) — họ chỉ thấy đúng module cổng
 * của mình, không thấy menu vận hành nội bộ dù tài khoản có thêm quyền khác.
 */
export type ModuleAudience = 'ops' | 'recruiter' | 'partner';

/**
 * Cách nạp lười một page.
 *
 * Generic `ComponentType` (mặc định `<{}>`) thay vì `ComponentType<unknown>`
 * để nhận cả page có props tuỳ chọn — router mount không truyền props nên
 * page phải mount được với `{}`.
 */
export type ModulePageLoader =
  /** Dạng default-export: `() => import('@/features/x/pages/XPage')` */
  | (() => Promise<{ default: ComponentType }>)
  /** Dạng named-export: dùng kèm `exportName`. */
  | (() => Promise<Record<string, ComponentType>>);

export interface ModulePageDef {
  lazy: ModulePageLoader;
  /** Tên export khi page không phải default. */
  exportName?: string;
  /** Ghi đè quyền cho riêng page này (mặc định thừa hưởng của phân hệ). */
  permission?: PermissionRequirement;
}

/**
 * Metadata `build-routes.tsx` gắn vào `RouteObject.handle` — đọc bằng
 * `useMatches()` (React Router) TỪ BÊN TRONG page đã lazy-load, thay vì page
 * tự import `module-registry.ts`.
 *
 * ⛔ Lý do bắt buộc dùng `handle` thay vì import thẳng: `module-registry.ts`
 * import TĨNH mọi `{id}.routes.tsx`, và các file đó trỏ `page.lazy` (import
 * ĐỘNG) vào chính các page này. Page nào import ngược `module-registry.ts`
 * (hoặc bất cứ gì phái sinh từ nó, kể cả `MODULE_PATHS`/`document-title.ts`)
 * đều khép thành vòng — `npm run check:cycles` (madge) chặn cứng. `handle`
 * đi qua CÂY ROUTE đã dựng sẵn lúc runtime, không tạo cạnh import nào cả.
 */
export interface RouteHandle {
  /** Tên hiển thị của route này — `module.title` (root) hoặc `route.title` (con). */
  title?: string;
  /** `ModuleConfig.path` của phân hệ sở hữu route — dùng để điều hướng về root. */
  modulePath?: string;
  /**
   * `ModuleConfig.tabTitles` của phân hệ (chỉ route gốc) — trang có nhiều tab
   * (vd `system-config`) đọc danh sách tab từ đây thay vì import registry.
   */
  tabTitles?: Readonly<Record<string, string>>;
  /** `ModuleConfig.defaultTab` — tab dùng khi URL chưa có `?tab=`. */
  defaultTab?: string;
}

/**
 * Một route con của phân hệ (vd `/user/add`, `/user/:id/edit`).
 *
 * `path` nhận cả dạng tương đối (`'add'`, `':id'`) — sẽ ghép với `module.path`
 * — lẫn tuyệt đối (`'/user/add'`) dùng nguyên.
 */
export interface ModuleRouteDef extends ModulePageDef {
  path: string;
  title: string;
  /** Tên trên TAB TRÌNH DUYỆT nếu muốn khác `title`. */
  tabTitle?: string;
  hideInMenu?: boolean;
  children?: ModuleRouteDef[];
}

/** Tông màu cho icon + nền thẻ của phân hệ. */
export type ModuleColor =
  | 'blue'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'purple'
  | 'sky'
  | 'teal'
  | 'indigo'
  | 'pink'
  | 'fuchsia'
  | 'azure'
  | 'lime'
  | 'emerald';

/** Cấu hình một phân hệ cấp cao nhất. */
export interface ModuleConfig {
  /** Định danh, kebab-case. Cũng là `resource` mặc định khi kiểm quyền. */
  id: string;
  /** Đường tuyệt đối cho gốc phân hệ (vd `/user`). */
  path: string;
  /** Tên hiển thị ở menu, breadcrumb, tiêu đề trang. Giữ NGẮN — chỗ hiện bị cắt. */
  title: string;
  /** Tên đầy đủ cho tab trình duyệt khi `title` quá ngắn hoặc viết tắt. */
  tabTitle?: string;
  /**
   * Tên tab trình duyệt theo TAB NỘI BỘ của phân hệ (chip trên PageHeader).
   *
   * Key = ĐÚNG giá trị đi vào URL, nhận từ hai nguồn: query `?tab=` hoặc path
   * param `:tab`. Khai ở đây thay vì import hằng số từ feature, vì registry
   * được import khắp app — kéo code feature vào là vỡ code-splitting.
   */
  tabTitles?: Readonly<Record<string, string>>;
  /** Key trong `tabTitles` dùng khi URL chưa có tab nào. */
  defaultTab?: string;
  /** Mô tả một dòng, hiện dưới title ở lưới thẻ `/modules`. */
  subtitle?: string;
  /** Icon (kebab-case). Mặc định dùng biến thể `-outline`. */
  iconName: SystemIconName;
  color?: ModuleColor;
  /**
   * Chấm số việc chờ ở menu Dock. SỐ ⇒ hiện nguyên số (> 0). CHUỖI ⇒ khoá bộ đếm trực tiếp
   * (vd `'moderation-open'`) do `app/shell/useModuleBadges.ts` giải — registry chỉ khai TÊN khoá,
   * không import code feature (kéo vào là phá code-splitting).
   */
  badge?: string | number;
  /** Thứ tự hiện trong menu (tăng dần). */
  order?: number;
  /** Tắt cứng — không dựng route, không hiện menu. */
  enabled?: boolean;
  /** Quyền tối thiểu để vào (mặc định `{ resource: id, action: 'view' }`). */
  permission?: PermissionRequirement;
  /** Bỏ qua mọi kiểm quyền — chỉ cần đã đăng nhập. */
  skipPermission?: boolean;
  /** Vai được thấy phân hệ; menu/⌘K/breadcrumb lọc theo vai hiện tại. Bỏ trống = `'ops'`. */
  audience?: ModuleAudience;
  /**
   * Cờ phân hệ ở BE (`capabilities.features`). Tắt thì ẩn khỏi menu và route
   * trả trang "Chưa bật" (`FeatureDisabledPage`) thay vì mount page thật.
   * MẢNG ⇒ phân hệ dùng chung cho nhiều tính năng độc lập: hiện/vào được khi
   * BẤT KỲ cờ nào bật (vd `['integration', 'collab']`); từng tab tự kiểm cờ riêng.
   */
  featureFlag?: FeatureFlagSpec;
  hideInMenu?: boolean;
  /** Trang mặc định mount tại `path`. */
  page: ModulePageDef;
  routes?: ModuleRouteDef[];
  /** Đích khi bấm phân hệ ở Dock/thẻ, nếu khác `path`. */
  landingPath?: string;
  /**
   * Hành động nhanh của phân hệ trong ⌘K (vd "Tìm nhật ký theo người thực hiện").
   * Khai Ở ĐÂY — `AppCommandPalette` gom qua `useModuleCommandActions()` (một nguồn,
   * lọc theo quyền), KHÔNG khai riêng trong palette.
   */
  commandPaletteActions?: readonly ModuleCommandAction[];
}

/** Một hành động nhanh trong ⌘K — xem `ModuleConfig.commandPaletteActions`. */
export interface ModuleCommandAction {
  /** Duy nhất toàn app; quy ước `<moduleId>.<hành-động>` (vd `audit-log.search-actor`). */
  id: string;
  label: string;
  /** Đích điều hướng — có thể kèm query (`/audit-log?focus=actor`). */
  to: string;
  /**
   * Quyền RIÊNG của hành động. Bỏ trống = chỉ cần được vào phân hệ (đã lọc bởi
   * `useAccessibleModules`); có thì phải thoả cả hai.
   */
  permission?: PermissionRequirement;
}
