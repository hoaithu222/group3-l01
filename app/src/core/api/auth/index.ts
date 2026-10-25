export { AUTH_ENDPOINTS, biometricCredentialPath, sessionPath } from './auth.api';
export {
  isAccountPendingDeletion,
  isOwnershipBlockingDeletion,
  toAuthErrorMessage,
  UserFacingError,
} from './auth-errors';
export type { AuthFormContext } from './auth-errors';
export { isNonceRejected } from './auth.nonce';
export { newPasswordSchema, PASSWORD_MAX_LENGTH, PASSWORD_RULE_HINT } from './password-policy';
export { authService } from './auth.service';
export type {
  AccountDeletionCancelPayload,
  AccountDeletionCancelResponse,
  AccountDeletionRequestPayload,
  AccountDeletionStatus,
  AuthTokens,
  BiometricClientPlatform,
  BiometricCredentialItem,
  BiometricEnrollPayload,
  BiometricEnrollResponse,
  BiometricLoginPayload,
  BiometricLoginResponse,
  BiometricSelfRevokeReason,
  ChangePasswordPayload,
  ChangePasswordResult,
  FirebaseLoginPayload,
  ForgotPasswordPayload,
  LoginPayload,
  LoginResponse,
  LogoutAllResult,
  NonceResponse,
  NormalizedSession,
  PrivacySettings,
  RegisterPayload,
  ResetPasswordPayload,
  SessionSummary,
  UpdatePhoneResult,
  UpdatePrivacyPayload,
} from './auth.types';
