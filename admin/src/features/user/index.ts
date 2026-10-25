/**
 * Phân hệ Người dùng — barrel export.
 *
 * Route (`app/router/modules/user.routes.tsx`) import THẲNG từng page qua
 * `() => import('@/features/user/pages/...')` để giữ code-splitting — barrel
 * này chỉ phục vụ import thuận tiện ở nơi khác (test, feature khác nếu cần).
 */
export { default as UserDetailPage } from './pages/UserDetailPage';
export { default as UserListPage } from './pages/UserListPage';

export {
  useChangeRole,
  useCreateUser,
  useLockUser,
  useRevokeBiometricCredential,
  useRevokeSession,
  useUnlockUser,
  useUser,
  useUserBiometricCredentials,
  useUserList,
  useUserSessions,
  userKeys,
} from './service/user.queries';
export { userApi } from './service/user.api';
export { userService } from './service/user.service';

export {
  USER_ROLE_LABEL,
  USER_ROLE_OPTIONS,
  USER_STATUS_OPTIONS,
} from './constants/user.constants';
export {
  changeRoleSchema,
  createUserSchema,
  reasonSchema,
  USER_ROLES,
} from './schemas/user.schema';
export type {
  ChangeRoleFormValues,
  CreateUserFormValues,
  ReasonFormValues,
} from './schemas/user.schema';
export type {
  AdminUser,
  BiometricCredentialStatus,
  BiometricRevokeReason,
  BiometricStatusFilter,
  ChangeRolePayload,
  CreateUserPayload,
  ReasonPayload,
  SessionAuthMethod,
  UserBiometricCredential,
  UserListParams,
  UserRole,
  UserSession,
  UserStatus,
} from './types/user.types';
