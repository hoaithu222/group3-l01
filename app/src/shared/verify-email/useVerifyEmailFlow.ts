import { useEffect, useState } from 'react';

import { useConfirmEmailVerification, useSendEmailVerification } from './verify-email.queries';
import {
  BAD_CODE_MESSAGE,
  classifyVerifyEmailError,
  type VerifyEmailFailure,
  type VerifyEmailStep,
} from './verify-email-errors';

/** Chờ giữa hai lần gửi mã — BE cho tối đa 3 lần/15 phút, chờ 30 giây để người dùng không bấm dồn hết lượt. */
export const RESEND_COOLDOWN_SECONDS = 30;
export const VERIFY_CODE_LENGTH = 6;

/**
 * Luồng "Xác minh email": gửi mã → nhập 6 số → xác nhận. Xong (kể cả khi BE báo đã xác minh sẵn) thì gọi `onVerified` để màn cha đi
 * tiếp. Đếm ngược "Gửi lại mã" bằng state + timer (không `Date.now()` trong render).
 *
 * Dùng ở HAI nơi (nên nằm ở `shared/`, xem `verify-email-errors.ts`): chấp nhận lời mời email (`members`, p3-04 `INV_008`
 * `EMAIL_NOT_VERIFIED` — quay lại chấp nhận lời mời) và Cài đặt → Bảo mật → "Xác minh email" (`me` — cập nhật cờ `emailVerified`).
 */
export function useVerifyEmailFlow(onVerified: () => void) {
  const send = useSendEmailVerification();
  const confirm = useConfirmEmailVerification();
  const [step, setStep] = useState<'send' | 'code'>('send');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function fail(failure: VerifyEmailFailure): void {
    if (failure.kind === 'ALREADY_VERIFIED') {
      onVerified();
      return;
    }
    // Mã sai ⇒ xoá ô để nhập lại từ đầu (ô OTP không sửa từng số được như ô chữ).
    if (failure.kind === 'BAD_CODE') setCode('');
    setError(failure.kind === 'BAD_CODE' ? BAD_CODE_MESSAGE : failure.message);
  }

  const onError = (stepName: VerifyEmailStep) => (e: unknown) =>
    fail(classifyVerifyEmailError(e, stepName));

  return {
    code,
    confirming: confirm.isPending,
    cooldown,
    error,
    haveCode: () => {
      setError(undefined);
      setStep('code');
    },
    /** Đóng tấm: về bước đầu, xoá mã/lỗi/đếm ngược — mở lại là một lượt mới. */
    reset: () => {
      setStep('send');
      setCode('');
      setError(undefined);
      setCooldown(0);
    },
    sending: send.isPending,
    sendCode: () => {
      setError(undefined);
      send.mutate(undefined, {
        onError: onError('send'),
        onSuccess: () => {
          setStep('code');
          setCooldown(RESEND_COOLDOWN_SECONDS);
        },
      });
    },
    setCode,
    step,
    submit: (value: string) => {
      if (value.length !== VERIFY_CODE_LENGTH || confirm.isPending) return;
      setError(undefined);
      confirm.mutate(value, { onError: onError('confirm'), onSuccess: onVerified });
    },
  };
}
