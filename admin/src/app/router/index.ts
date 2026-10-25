// Điểm vào router
export { AppRouter } from './AppRouter';
export { routes } from './routes';

// Đường route tĩnh nằm ở `@/app/config`; path của phân hệ do registry sinh ra.
export { MODULE_PATHS } from './modules';

// Module registry — nguồn khai báo duy nhất cho phân hệ
export {
  MODULE_REGISTRY,
  MODULE_BY_ID,
  MODULE_BY_PATH,
  buildModuleRoutes,
  placeholderPage,
  type ModuleConfig,
  type ModuleRouteDef,
  type ModulePageDef,
  type ModuleColor,
} from './modules';

// Phân quyền
export {
  PermissionGuard,
  useAccessibleModules,
  permissionKey,
  type PermissionAction,
  type PermissionRequirement,
} from './permission';

// Guard
export { AuthGuard, GuestGuard } from './guards';

// Tên tab trình duyệt — nguồn duy nhất cho `document.title`
export {
  resolveDocumentTitle,
  getModuleTabTitle,
  APP_TITLE,
  DEFAULT_DOCUMENT_TITLE,
  STATIC_ROUTE_TITLES,
} from './document-title';
export { DocumentTitleSync } from './DocumentTitleSync';
export { DisplayUrlSync } from './DisplayUrlSync';

// Helper lazy-load dùng chung
export { LazyLoad, type LazyLoadProps } from './components';
