/**
 * ⛔ `useLogout` KHÔNG còn ở đây — nó đã lên `@/shell/session/useLogout`.
 *
 * Đăng xuất là việc của VỎ ỨNG DỤNG (dọn store phiên, dọn cache query, điều
 * hướng), và để nó ở đây thì mọi màn hình muốn đăng xuất — `features/profile`
 * là ca đã xảy ra — phải nhập CHÉO FEATURE, điều `docs/rules/feature-structure.md`
 * cấm cứng mà không công cụ nào bắt được.
 */
export { useLogin } from './hooks/useLogin';
export { useRegister } from './hooks/useRegister';
export { useForgotPassword, useResetPassword } from './hooks/usePasswordRecovery';
export { useRestoreAccount } from './hooks/useRestoreAccount';

export { ForgotPasswordScreen } from './screens/ForgotPasswordScreen';
export { LoginScreen } from './screens/LoginScreen';
export { RegisterScreen } from './screens/RegisterScreen';
export { RestoreAccountScreen } from './screens/RestoreAccountScreen';
export { ResetPasswordScreen } from './screens/ResetPasswordScreen';
