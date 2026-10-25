import { isAxiosError } from 'axios';

import { isBiometricError } from '@/core/auth/biometric';
import { toAuthErrorMessage } from '@/core/api/auth/auth-errors';
import { getErrorCode } from '@/core/api/client.helpers';
import { disableBiometric } from '@/shell/store/slices/biometric';

import {
  biometricFailedMessage,
  biometricInvalidatedMessage,
  biometricLockoutMessage,
} from '../constants/biometric.messages';

/**
 * Ánh xạ lỗi sau lượt đăng nhập sinh trắc học thất bại thành hành động + câu
 * hiển thị — tách khỏi `useBiometricLogin.ts` để giữ file đó dưới trần 150
 * dòng (`docs/rules/code-style.md`), và vì rẽ nhánh lỗi tự nó là một khối việc
 * riêng, không cần biết gì về `trigger()`/state của hook.
 */
export async function resolveBiometricLoginError(error: unknown, label: string): Promise<string | null> {
  if (isBiometricError(error)) {
    switch (error.code) {
      case 'cancelled':
        // Người dùng tự huỷ hộp quét — im lặng, KHÔNG phải lỗi (app.md §3).
        return null;
      case 'invalidated':
        await disableBiometric('INVALIDATED');
        return biometricInvalidatedMessage(label);
      case 'lockout':
        return biometricLockoutMessage(label);
      case 'failed':
      default:
        return biometricFailedMessage(label);
    }
  }

  if (isAxiosError(error)) {
    const code = getErrorCode(error);
    // BE đã revoke/hết hạn credential phía server ⇒ gỡ gắn cục bộ theo, và báo
    // đúng thông điệp app.md quy định cho hai mã này (đã có sẵn ở error-codes.ts).
    if (code === 'AUTH_014') await disableBiometric('AUTH_014');
    if (code === 'AUTH_015') await disableBiometric('AUTH_015');
  }

  // `AUTH_018` (nonce bị từ chối HAI lần) đọc thành câu thân thiện, không lộ thuật ngữ "nonce".
  return toAuthErrorMessage(error, 'login');
}
