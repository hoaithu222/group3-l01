import { useEffect } from 'react';
import { useWatch } from 'react-hook-form';

import {
  Callout,
  ConditionalField,
  DynamicSchemaField,
  EmailField,
  FormModal,
  RadioGroupField,
  Text,
  TextareaField,
  useZodForm,
} from '@/shared/ui';

import { createAnonymizeUserSchema, type AnonymizeUserFormValues } from '../schemas/user.schema';
import { useAnonymizeUser } from '../service/user.queries';
import type { AdminUser } from '../types/user.types';

export interface AnonymizeUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUser;
  /**
   * `hasPermission('user','delete') && hasRole('admin')` — ẩn HẲN lựa chọn
   * NOW khi false (không chỉ disable) — khớp be.md §6 "Ẩn danh NOW" và
   * `UserService.anonymizeAdmin` (403 `USER_012` nếu role khác `admin`).
   */
  canAnonymizeNow: boolean;
}

const DEFAULT_VALUES: AnonymizeUserFormValues = { mode: 'GRACE', reason: '', confirmEmail: '' };

/**
 * Xoá tài khoản (ẩn danh hoá) — `POST /admin/users/:id/anonymize`.
 *
 * Hai chế độ, theo `docs/plans/.../p0-01.../README.md §6` (ma trận quyền):
 *   - `GRACE` (mặc định) — đặt lịch: BE thu hồi MỌI phiên + sinh trắc học ngay, đặt `PENDING_DELETION`
 *     và `deletionGraceUntil` (`LIMITS.deletion.graceDays`, hiện 7 ngày — KHÔNG có trong
 *     `/capabilities` nên chữ ở đây không ghi con số); hết hạn job `user.anonymize` ẩn danh hoá.
 *     Đây cũng là đường mà `DELETE /users/:id` (deprecated) đi. CHỈ cần `user:delete`.
 *   - `NOW` — ẩn danh hoá ngay, KHÔNG thể hoàn tác; cần thêm role `admin` +
 *     gõ lại đúng email mục tiêu (`confirmEmail`, so khớp CHÍNH XÁC phía BE).
 *
 * Theo mẫu `ChangeRoleModal`: `FormModal` + `useZodForm`, nạp lại giá trị mặc
 * định mỗi lần mở (modal không unmount giữa hai lần mở).
 */
export default function AnonymizeUserModal({
  open,
  onOpenChange,
  user,
  canAnonymizeNow,
}: AnonymizeUserModalProps) {
  const anonymizeUser = useAnonymizeUser();
  const schema = createAnonymizeUserSchema(user.email);
  const form = useZodForm<AnonymizeUserFormValues>(schema, { defaultValues: DEFAULT_VALUES });

  useEffect(() => {
    if (open) form.reset(DEFAULT_VALUES);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user.id]);

  const mode = useWatch({ control: form.control, name: 'mode' });
  const confirmEmail = useWatch({ control: form.control, name: 'confirmEmail' });
  // Nút Xác nhận chỉ bật khi mode NOW VÀ đã gõ đúng khớp email — không đợi
  // người dùng bấm submit rồi mới thấy lỗi (yêu cầu UX của hành động phá huỷ).
  const confirmDisabled = mode === 'NOW' && confirmEmail?.trim() !== user.email;

  const modeOptions = [
    {
      value: 'GRACE',
      label: (
        <span className="flex flex-col gap-0.5 py-0.5">
          <Text size="small" weight="medium">
            Đặt lịch xoá (khuyến nghị)
          </Text>
          <Text size="tiny" skin="muted">
            Người dùng bị đăng xuất khỏi mọi thiết bị ngay và không dùng được tài khoản (trạng thái
            "Chờ xoá"). Hết thời gian ân hạn, dữ liệu cá nhân tự động bị ẩn danh hoá — không thể
            hoàn tác. Bạn hoặc chính người dùng có thể huỷ yêu cầu trong thời gian ân hạn.
          </Text>
        </span>
      ),
    },
  ];
  if (canAnonymizeNow) {
    modeOptions.push({
      value: 'NOW',
      label: (
        <span className="flex flex-col gap-0.5 py-0.5">
          <Text size="small" weight="medium">
            Ẩn danh hoá ngay
          </Text>
          <Text size="tiny" skin="muted">
            Ghi đè dữ liệu cá nhân NGAY LẬP TỨC — không cần chờ ân hạn, KHÔNG THỂ hoàn tác.
          </Text>
        </span>
      ),
    });
  }

  return (
    <FormModal<AnonymizeUserFormValues>
      confirmDisabled={confirmDisabled}
      confirmLabel={mode === 'NOW' ? 'Ẩn danh hoá ngay' : 'Đặt lịch xoá'}
      confirmSkin={mode === 'NOW' ? 'danger' : undefined}
      form={form}
      open={open}
      size="sm"
      title={`Xoá tài khoản — ${user.name}`}
      onConfirm={async (data) => {
        if (!data) return;
        await anonymizeUser.mutateAsync({
          id: user.id,
          mode: data.mode,
          reason: data.reason,
          confirmEmail: data.mode === 'NOW' ? data.confirmEmail : undefined,
        });
      }}
      onOpenChange={onOpenChange}
    >
      <Callout
        description="Hành động này ảnh hưởng trực tiếp tới dữ liệu người dùng và được ghi vào nhật ký quản trị."
        intent="warning"
        title="Thao tác nhạy cảm"
      />

      <DynamicSchemaField watch="mode">
        <RadioGroupField label="Chế độ xoá" name="mode" options={modeOptions} required />

        <TextareaField
          label="Lý do"
          maxLength={500}
          name="reason"
          placeholder="Ghi rõ lý do xoá tài khoản — sẽ lưu vào nhật ký quản trị"
          required
          rows={3}
          showCount
        />

        <ConditionalField
          condition={(v) => v === 'NOW'}
          unregisterNames={['confirmEmail']}
          watch="mode"
        >
          <Callout
            description="Không thể hoàn tác sau khi xác nhận — dữ liệu cá nhân bị ghi đè ngay lập tức."
            intent="error"
            title="Ẩn danh hoá ngay lập tức"
          />
          <EmailField
            label={`Gõ lại email "${user.email}" để xác nhận`}
            name="confirmEmail"
            placeholder={user.email}
            required
          />
        </ConditionalField>
      </DynamicSchemaField>
    </FormModal>
  );
}
