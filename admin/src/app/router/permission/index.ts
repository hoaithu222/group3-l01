export { default as PermissionGuard } from './PermissionGuard';
export {
  collectCommandActions,
  resolveAudience,
  useAccessibleModules,
  useModuleCommandActions,
} from './useAccessibleModules';
export type { ModuleCommandEntry } from './useAccessibleModules';
export { permissionKey } from './permission.types';
export type { PermissionAction, PermissionRequirement } from './permission.types';
