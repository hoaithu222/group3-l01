/**
 * build-routes — biến `MODULE_REGISTRY` thành `RouteObject[]` cho React Router.
 *
 * Strategy:
 *  - Mỗi module được wrap bởi `<PermissionGuard requirement={...} />`
 *  - Page lazy load qua `<LazyLoad component={...} />`
 *  - Sub-routes inherit guard của module (override qua `route.permission`)
 *
 * KHÔNG đặt React.lazy() top-level — gọi inline trong builder để hỗ trợ named/default export.
 */

import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import type { RouteObject } from 'react-router-dom';

import { LazyLoad } from '../components';
import { PermissionGuard } from '../permission';

import { FeatureGate } from './FeatureGate';
import type { FeatureFlagSpec } from './feature-flag.utils';
import { MODULE_REGISTRY } from './module-registry';
import type {
  ModuleConfig,
  ModulePageDef,
  ModulePageLoader,
  ModuleRouteDef,
  RouteHandle,
} from './types';

/**
 * ⛔ Cache `React.lazy` theo (loader, exportName) — KHÔNG bỏ.
 *
 * Nhiều route trỏ CÙNG một trang (vd `/bim-3d` và `/bim-3d/:id` đều là
 * `Bim3dPage`). Nếu mỗi route gọi `lazy()` riêng thì ra hai component identity
 * khác nhau; React Router render chúng ở cùng vị trí trong cây (`_renderMatches`
 * KHÔNG gắn `key`), nên React thấy **đổi element type** → **unmount + mount lại
 * cả trang** khi đi giữa hai route đó: màn hình nháy, viewer dựng lại, cây thư
 * mục mất hết nhánh đang mở (state mở/đóng của react-arborist nằm trong store
 * tạo theo từng lần mount).
 *
 * Dùng chung một instance → element type không đổi → React chỉ reconcile.
 */
const lazyByLoader = new WeakMap<
  ModulePageLoader,
  Map<string, LazyExoticComponent<ComponentType>>
>();

/**
 * Wrap loader hỗ trợ cả default-export và named-export.
 * - Default: `() => import('./Page')` (Page có default)
 * - Named:   `{ lazy: () => import('./Page'), exportName: 'PageX' }`
 */
function toLazy(loader: ModulePageLoader, exportName?: string): LazyExoticComponent<ComponentType> {
  let byExport = lazyByLoader.get(loader);
  if (!byExport) {
    byExport = new Map();
    lazyByLoader.set(loader, byExport);
  }
  const cacheKey = exportName ?? '';
  const cached = byExport.get(cacheKey);
  if (cached) return cached;

  const created = lazy(async () => {
    const mod = await loader();
    if (exportName) {
      const named = (mod as Record<string, ComponentType>)[exportName];
      if (!named) {
        throw new Error(`[module-registry] Export '${exportName}' không tồn tại trong module`);
      }
      return { default: named };
    }
    const def = (mod as { default?: ComponentType }).default;
    if (!def) {
      throw new Error('[module-registry] Loader trả về module không có default export');
    }
    return { default: def };
  });

  byExport.set(cacheKey, created);
  return created;
}

function renderPage(page: ModulePageDef, featureFlag?: FeatureFlagSpec) {
  const element = <LazyLoad component={toLazy(page.lazy, page.exportName)} />;
  return featureFlag ? <FeatureGate flag={featureFlag}>{element}</FeatureGate> : element;
}

/** Build sub-route (relative path → join với module path). */
function buildChildRoute(
  parentPath: string,
  route: ModuleRouteDef,
  skipPermission: boolean,
  featureFlag: FeatureFlagSpec | undefined,
  modulePath: string,
): RouteObject {
  const fullPath = route.path.startsWith('/')
    ? route.path
    : `${parentPath.replace(/\/$/, '')}/${route.path}`;

  const children: RouteObject[] | undefined = route.children?.map((c) =>
    buildChildRoute(fullPath, c, skipPermission, featureFlag, modulePath),
  );

  const element =
    !skipPermission && route.permission ? (
      <PermissionGuard requirement={route.permission}>
        {renderPage(route, featureFlag)}
      </PermissionGuard>
    ) : (
      renderPage(route, featureFlag)
    );

  const handle: RouteHandle = { title: route.title, modulePath };

  return {
    path: fullPath,
    element,
    children,
    handle,
  };
}

/**
 * Build 1 module: wrap bằng PermissionGuard, mount page index tại path root,
 * mount sub-routes (nếu có) như siblings ở cùng level.
 *
 * `skipPermission === true` → KHÔNG bọc PermissionGuard, mọi user đã login đều
 * vào được. AuthGuard cấp trên vẫn áp dụng.
 */
function buildModuleRoute(module: ModuleConfig): RouteObject {
  const skipPermission = module.skipPermission === true;

  const handle: RouteHandle = {
    title: module.title,
    modulePath: module.path,
    tabTitles: module.tabTitles,
    defaultTab: module.defaultTab,
  };

  const indexRoute: RouteObject = {
    path: module.path,
    element: renderPage(module.page, module.featureFlag),
    handle,
  };

  const childRoutes: RouteObject[] = (module.routes ?? []).map((r) =>
    buildChildRoute(module.path, r, skipPermission, module.featureFlag, module.path),
  );

  if (skipPermission) {
    return {
      children: [indexRoute, ...childRoutes],
    };
  }

  // Route gốc của phân hệ chỉ đòi quyền `view`. Quyền chi tiết hơn (tạo/sửa/xoá)
  // do chính màn hình kiểm — guard ở đây chỉ trả lời "có được vào không".
  const guardReq = module.permission ?? { resource: module.id, action: 'view' as const };

  return {
    element: <PermissionGuard requirement={guardReq} />,
    children: [indexRoute, ...childRoutes],
  };
}

/**
 * Public: trả về list `RouteObject` đã wrap permission, sẵn sàng nhét vào
 * children của `AuthGuard` + Layout.
 *
 * Skip module có `enabled === false` — không tạo route.
 */
export function buildModuleRoutes(): RouteObject[] {
  return MODULE_REGISTRY.filter((m) => m.enabled !== false).map(buildModuleRoute);
}
