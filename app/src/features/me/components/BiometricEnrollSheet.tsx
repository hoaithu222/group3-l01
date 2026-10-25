import { Text, View } from 'react-native';
import { z } from 'zod';

import { useClearErrorOnEdit } from '@/shared/form/useClearErrorOnEdit';
import { useZodForm } from '@/shared/form/useZodForm';
import { Alert } from '@/shared/ui/alert';
import { BottomSheet, SheetActions } from '@/shared/ui/bottom-sheet';
import type { IconName } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { FormInput } from '@/shared/ui/input';

import {
  BIOMETRIC_SHARED_DEVICE_WARNING,
  biometricAccountContext,
  biometricEnrollSheetTitle,
} from '../constants/biometric.messages';

/** Chỉ kiểm "đã nhập chưa" — như mọi ô mật khẩu ĐĂNG NHẬP khác trong base này. */
const enrollPasswordSchema = z.object({ password: z.string().min(1) });
type EnrollPasswordValues = z.infer<typeof enrollPasswordSchema>;

export interface BiometricEnrollSheetProps {
  email: string;
  errorMessage: string | null;
  /** Icon cảm biến của máy (`faceid` / `touchid`…) — ô icon đầu sheet cho người dùng nhận ra đây là việc gì. */
  icon: IconName;
  isSubmitting: boolean;
  label: string;
  /** Gọi khi người dùng sửa lại ô mật khẩu — để nơi giữ `errorMessage` xoá lỗi cũ. */
  onClearError: () => void;
  onClose: () => void;
  onConfirm: (password: string) => void;
  visible: boolean;
}

/**
 * Sheet nhập lại mật khẩu để bật đăng nhập sinh trắc học (`app.md` §3, hàng
 * "Sheet bật").
 *
 * ⛔ Không cho đóng giữa chừng lúc đang xác thực (`dismissOnBackdrop={!isSubmitting}`,
 * `onClose` bị vô hiệu) — bỏ ngang lúc BE đang xử lý mật khẩu dễ khiến người
 * dùng bấm lại và gửi hai lượt `enroll` chồng nhau.
 */
export function BiometricEnrollSheet({
  email,
  errorMessage,
  icon,
  isSubmitting,
  label,
  onClearError,
  onClose,
  onConfirm,
  visible,
}: BiometricEnrollSheetProps) {
  const form = useZodForm(enrollPasswordSchema, { defaultValues: { password: '' } });

  const submit = form.handleSubmit((values: EnrollPasswordValues) => onConfirm(values.password));
  useClearErrorOnEdit(form.watch, errorMessage !== null, onClearError);

  const requestClose = () => {
    if (isSubmitting) return;
    form.reset();
    onClose();
  };

  return (
    <BottomSheet
      dismissOnBackdrop={!isSubmitting}
      footer={
        /* ✅ `SheetActions` thay cặp nút tự ghép: [Huỷ | Xác nhận] chia đôi đúng thứ tự của mọi tấm xác nhận khác, và "Huỷ" bị
           khoá cùng lúc nút chính quay (huỷ giữa lượt `enroll` là đóng tấm mà máy chủ vẫn đang xử lý mật khẩu). */
        <SheetActions
          primary={{
            label: isSubmitting ? 'Đang xác thực…' : 'Xác nhận',
            loading: isSubmitting,
            onPress: submit,
          }}
          secondary={{ disabled: isSubmitting, label: 'Huỷ', onPress: requestClose }}
        />
      }
      title={biometricEnrollSheetTitle(label)}
      visible={visible}
      onClose={requestClose}
    >
      {/* `padded` mặc định của `BottomSheet` đã cho lề ngang `px-4`. ⛔ Không `pb-*` ở cuối thân: vùng `footer` tự cách nội dung
          12dp (`pt-sm`) — đệm thêm là hàng nút tụt xa khối cảnh báo cuối. */}
      <View className="gap-md">
        <View className="flex-row items-center gap-sm">
          <IconTile name={icon} size="lg" tone="success" />
          <Text className="flex-1 text-body-md text-fg-2">
            {biometricAccountContext(label, email)}
          </Text>
        </View>

        <FormInput<EnrollPasswordValues>
          autoCapitalize="none"
          autoComplete="current-password"
          control={form.control}
          disabled={isSubmitting}
          label="Mật khẩu"
          name="password"
          placeholder="••••••••"
          returnKeyType="done"
          secure
          textContentType="password"
          onSubmitEditing={submit}
        />

        {/* Lỗi máy chủ (mật khẩu sai, khoá tạm, huỷ quét…) hiện NGAY DƯỚI ô mật
            khẩu — sheet còn mở để người dùng sửa lại ngay, không phải toast tự tắt. */}
        {errorMessage ? <Alert description={errorMessage} tone="error" /> : null}

        <Alert description={BIOMETRIC_SHARED_DEVICE_WARNING} tone="warning" />
      </View>
    </BottomSheet>
  );
}
