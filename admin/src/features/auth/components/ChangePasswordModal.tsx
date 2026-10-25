/**
 * Đổi mật khẩu của CHÍNH MÌNH (`PATCH /auth/change-password`) — đích của mục "Đổi mật khẩu"
 * trong menu người dùng ở Header.
 *
 * BE thu hồi MỌI phiên khác + đăng nhập sinh trắc học khi đổi thành công, còn phiên hiện tại giữ
 * nguyên — nên người dùng không phải đăng nhập lại; câu toast nói rõ hệ quả với thiết bị khác.
 */
import { memo, useCallback } from 'react';
import { isAxiosError } from 'axios';

import { Callout, FormModal, PasswordField, useZodForm } from '@/shared/ui';
import { showToast } from '@/shared/utils/toast.utils';
import { changePasswordSchema, type ChangePasswordFormValues } from '../schemas/auth.schema';
import { useChangePassword } from '../service/auth.queries';
import { resolveAuthError } from '../utils/auth-errors';

interface ChangePasswordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULTS: ChangePasswordFormValues = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

const ChangePasswordModal = memo(function ChangePasswordModal({
  open,
  onOpenChange,
}: ChangePasswordModalProps) {
  const { mutateAsync } = useChangePassword();
  const form = useZodForm<ChangePasswordFormValues>(changePasswordSchema, {
    defaultValues: DEFAULTS,
  });
  const { reset, setError } = form;
  const rootError = form.formState.errors.root?.message;

  const handleConfirm = useCallback(
    async (values?: ChangePasswordFormValues) => {
      if (!values) return;
      try {
        await mutateAsync({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        });
      } catch (error) {
        const message = resolveAuthError(error, 'change-password');
        // Đặt lỗi đúng chỗ người dùng phải sửa: 401 = mật khẩu hiện tại sai; 400 = mật khẩu mới
        // không đạt; còn lại (mất mạng, 429, 5xx) không thuộc ô nào → khung lỗi chung.
        const status = isAxiosError(error) ? error.response?.status : undefined;
        if (status === 401) setError('currentPassword', { message });
        else if (status === 400) setError('newPassword', { message });
        else setError('root', { message });
        // Ném lại: `FormModal` giữ modal mở khi `onConfirm` ném (và chỉ ghi log đã lọc bí mật).
        throw error;
      }
      showToast('success', 'Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.');
    },
    [mutateAsync, setError],
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      // Đóng (kể cả sau khi đổi xong) là xoá sạch — mật khẩu không được nằm lại trong form.
      if (!next) reset(DEFAULTS);
      onOpenChange(next);
    },
    [onOpenChange, reset],
  );

  return (
    <FormModal<ChangePasswordFormValues>
      confirmLabel="Đổi mật khẩu"
      form={form}
      open={open}
      size="sm"
      title="Đổi mật khẩu"
      onConfirm={handleConfirm}
      onOpenChange={handleOpenChange}
    >
      {rootError && <Callout intent="error">{rootError}</Callout>}
      <PasswordField
        autoComplete="current-password"
        label="Mật khẩu hiện tại"
        name="currentPassword"
        required
      />
      <PasswordField
        autoComplete="new-password"
        description="Tối thiểu 8 ký tự, gồm chữ cái và chữ số."
        label="Mật khẩu mới"
        name="newPassword"
        required
      />
      <PasswordField
        autoComplete="new-password"
        label="Nhập lại mật khẩu mới"
        name="confirmPassword"
        required
      />
    </FormModal>
  );
});

export default ChangePasswordModal;
