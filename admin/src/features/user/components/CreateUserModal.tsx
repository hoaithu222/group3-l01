import { FormModal, PasswordField, SelectField, TextField, useZodForm } from '@/shared/ui';

import { USER_ROLE_OPTIONS } from '../constants/user.constants';
import { createUserSchema, type CreateUserFormValues } from '../schemas/user.schema';
import { useCreateUser } from '../service/user.queries';
import { EMAIL_TAKEN_MESSAGE, isConflictError } from '../utils/user-errors';

export interface CreateUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ROLE_OPTIONS = USER_ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

const DEFAULTS: CreateUserFormValues = { email: '', name: '', password: '', role: 'user' };

/**
 * Tạo tài khoản mới — `POST /users` (`user:create`).
 *
 * 409 = email đã có tài khoản: ngoài toast (`useCreateUser`) còn gắn lỗi thẳng vào ô email để người
 * tạo thấy ngay ô cần sửa; ném lỗi tiếp để `FormModal` giữ modal mở (`form-validation.md §4`).
 */
export default function CreateUserModal({ open, onOpenChange }: CreateUserModalProps) {
  const createUser = useCreateUser();
  const form = useZodForm<CreateUserFormValues>(createUserSchema, { defaultValues: DEFAULTS });

  return (
    <FormModal<CreateUserFormValues>
      confirmLabel="Tạo người dùng"
      form={form}
      open={open}
      size="sm"
      title="Tạo người dùng"
      onConfirm={async (data) => {
        if (!data) return;
        try {
          await createUser.mutateAsync(data);
        } catch (err) {
          if (isConflictError(err)) {
            form.setError('email', { type: 'server', message: EMAIL_TAKEN_MESSAGE });
          }
          throw err;
        }
        form.reset(DEFAULTS);
      }}
      onOpenChange={(next) => {
        if (!next) form.reset(DEFAULTS);
        onOpenChange(next);
      }}
    >
      <TextField autoFocus label="Họ tên" name="name" placeholder="Nguyễn Văn A" required />
      <TextField label="Email" name="email" placeholder="ten@congty.vn" required type="email" />
      <PasswordField label="Mật khẩu" name="password" placeholder="Từ 8 đến 128 ký tự" required />
      <SelectField label="Vai trò" name="role" options={ROLE_OPTIONS} required />
    </FormModal>
  );
}
