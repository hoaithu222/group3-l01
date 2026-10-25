import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useClearErrorOnEdit } from '@/shared/form/useClearErrorOnEdit';
import { useZodForm } from '@/shared/form/useZodForm';
import { Alert } from '@/shared/ui/alert';
import { Button, LinkButton } from '@/shared/ui/button';
import { IconTile } from '@/shared/ui/icon-tile';
import { FormInput } from '@/shared/ui/input';
import { Dialog } from '@/shared/ui/modal';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { PATHS } from '@/shell/config';

import {
  DELETE_ACCOUNT_CONFIRM_DIALOG_DESCRIPTION,
  DELETE_ACCOUNT_CONFIRM_DIALOG_TITLE,
  DELETE_ACCOUNT_OPEN_WORKSPACES,
  DELETE_ACCOUNT_WARNING,
} from '../constants/account-deletion.messages';
import { useRequestAccountDeletion } from '../hooks/useAccountDeletion';
import {
  deleteAccountRequestSchema,
  type DeleteAccountRequestFormValues,
} from '../schemas/account-deletion.schemas';

/**
 * "Xoá tài khoản (ân hạn)" (p0-01 mục 10) — mở từ `MeSettingsScreen`
 * (`router.push(PATHS.ME_DELETE_ACCOUNT)`), nên có `onBack`.
 *
 * Nhập mật khẩu → `Dialog` xác nhận (API thật chỉ gọi SAU khi bấm "Xác nhận" trong dialog).
 *
 * ⛔ Thành công KHÔNG ở lại màn này: BE thu hồi mọi phiên ngay nên `useRequestAccountDeletion` dọn
 * phiên và chuyển sang "Khôi phục tài khoản" — xem hook đó. Bản cũ có thêm trạng thái "đang chờ
 * xoá" + sheet huỷ ở ĐÂY dựa trên giả định phiên còn sống; giả định đó sai với BE nên đã bỏ.
 */
export function DeleteAccountScreen() {
  const { errorMessage, isOwnershipBlocked, isPending, requestDeletion, reset } =
    useRequestAccountDeletion();
  const [confirmVisible, setConfirmVisible] = useState(false);

  const form = useZodForm(deleteAccountRequestSchema, { defaultValues: { password: '' } });
  // Lỗi máy chủ (sai mật khẩu, còn là chủ nhóm) không tự tắt — xoá ngay khi người dùng sửa lại ô.
  useClearErrorOnEdit(form.watch, errorMessage !== null, reset);

  /** Validate mật khẩu trước, CHỈ mở hộp thoại xác nhận khi form hợp lệ. */
  const openConfirm = form.handleSubmit(() => setConfirmVisible(true));

  function confirmRequest(): void {
    requestDeletion(
      { password: form.getValues('password') },
      // Đóng dialog khi LỖI: `errorMessage` hiện lại NGAY DƯỚI ô mật khẩu, dialog che nó là điều
      // không nên. Thành công thì màn bị gỡ khi phiên dọn xong — không còn gì để đóng.
      { onSettled: () => setConfirmVisible(false) },
    );
  }

  return (
    <Screen header={<AppBar title="Xoá tài khoản" onBack={router.back} />} keyboardAware>
      <View className="gap-md py-xs">
        {/* Ô icon lớn tông `danger` ở đầu màn: nói ngay đây là việc phá huỷ trước khi người dùng đọc cảnh báo. Trang trí thuần. */}
        <View className="items-center py-xs">
          <IconTile name="delete" size="xl" tone="danger" />
        </View>
        <Alert description={DELETE_ACCOUNT_WARNING} tone="warning" />

        <FormInput<DeleteAccountRequestFormValues>
          autoCapitalize="none"
          autoComplete="current-password"
          control={form.control}
          label="Mật khẩu"
          name="password"
          placeholder="••••••••"
          returnKeyType="done"
          secure
          textContentType="password"
          onSubmitEditing={openConfirm}
        />

        {errorMessage ? (
          <Alert
            actions={
              isOwnershipBlocked ? (
                <LinkButton
                  label={DELETE_ACCOUNT_OPEN_WORKSPACES}
                  onPress={() => router.push(PATHS.WORKSPACES)}
                />
              ) : undefined
            }
            description={errorMessage}
            tone="error"
          />
        ) : null}

        <Button fullWidth label="Yêu cầu xoá tài khoản" variant="danger" onPress={openConfirm} />
      </View>

      <Dialog
        description={DELETE_ACCOUNT_CONFIRM_DIALOG_DESCRIPTION}
        primaryAction={{ label: 'Xác nhận', loading: isPending, onPress: confirmRequest }}
        secondaryAction={{ label: 'Huỷ', onPress: () => setConfirmVisible(false) }}
        title={DELETE_ACCOUNT_CONFIRM_DIALOG_TITLE}
        variant="warning"
        visible={confirmVisible}
        onClose={() => setConfirmVisible(false)}
      />
    </Screen>
  );
}
