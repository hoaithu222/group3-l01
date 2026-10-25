/**
 * Mặt tiền "Xác minh email bằng mã 6 số" DÙNG CHUNG. Nằm ở `shared/` chứ không trong `members`: luồng này có HAI nơi dùng —
 * chấp nhận lời mời email (`members`, `INV_008` `EMAIL_NOT_VERIFIED`) và Cài đặt → Bảo mật → "Xác minh email" (`me`) — mà hai feature
 * không được import chéo nhau (`docs/rules/feature-structure.md`). Cùng tiền lệ `shared/saved`.
 */
export {
  RESEND_COOLDOWN_SECONDS,
  useVerifyEmailFlow,
  VERIFY_CODE_LENGTH,
} from './useVerifyEmailFlow';
export { useConfirmEmailVerification, useSendEmailVerification } from './verify-email.queries';
export { BAD_CODE_MESSAGE, classifyVerifyEmailError } from './verify-email-errors';
export type { VerifyEmailFailure, VerifyEmailStep } from './verify-email-errors';
export { VERIFY_EMAIL_DEFAULT_INTRO, VerifyEmailSheet } from './VerifyEmailSheet';
export type { VerifyEmailSheetProps } from './VerifyEmailSheet';
