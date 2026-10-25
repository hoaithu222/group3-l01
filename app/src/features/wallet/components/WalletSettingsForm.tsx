import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Controller, useWatch } from 'react-hook-form';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useZodForm } from '@/shared/form/useZodForm';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Section } from '@/shared/ui/section';
import { Toggle } from '@/shared/ui/toggle';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type { ReminderTargets, WalletSettingsView } from '../api';
import { DEFAULT_REMINDER, WALLET_ERROR } from '../constants/wallet.constants';
import { cronToSchedule, scheduleToCron } from '../domain/reminder-cron';
import { useIsOffline } from '../hooks/useIsOffline';
import { useUpdateWalletSettings } from '../queries/settlement.mutations';
import { walletKeys } from '../queries/wallet.keys';
import {
  walletSettingsFormSchema,
  type WalletSettingsFormValues,
} from '../schemas/wallet-forms.schemas';
import { isVersionConflict, walletErrorCode } from '../utils/wallet-errors';
import { MoneyInput } from './MoneyInput';
import { ReminderPreview } from './ReminderPreview';
import { ReminderScheduleFields } from './ReminderScheduleFields';
import { ReminderTargetField } from './ReminderTargetField';
import { RemindNowSection } from './RemindNowSection';

export interface WalletSettingsFormProps {
  /** Số người đang nợ vượt ngưỡng — chỉ để PREVIEW tin nhắc ("3 bạn còn khoản chưa thanh toán"). */
  debtorsCount: number;
  settings: WalletSettingsView;
  targets: ReminderTargets | undefined;
  wsId: string;
}

/**
 * Cài đặt ví (OWNER/ADMIN): bật nhắc · lịch (thứ+giờ → cron) · múi giờ · ngưỡng nợ tối thiểu · nơi đăng ·
 * preview tin nhắc · "Nhắc ngay". Lưu kèm `expectedVersion` (khoá lạc quan): 409 ⇒ "Tải lại" rồi sửa lại
 * trên bản mới — form được dựng lại theo `settings.version` ở màn cha nên `defaultValues` lấy đúng số mới.
 */
export function WalletSettingsForm({
  debtorsCount,
  settings,
  targets,
  wsId,
}: WalletSettingsFormProps) {
  const queryClient = useQueryClient();
  const save = useUpdateWalletSettings(wsId);
  const offline = useIsOffline();
  const schedule = cronToSchedule(settings.reminderCron) ?? DEFAULT_REMINDER;

  const form = useZodForm<WalletSettingsFormValues, WalletSettingsFormValues>(
    walletSettingsFormSchema,
    {
      defaultValues: {
        ...schedule,
        reminderEnabled: settings.reminderEnabled,
        reminderMinDebt: settings.reminderMinDebt,
        reminderTargetId: settings.reminderTargetId,
        reminderTargetType: settings.reminderTargetType,
        timezone: settings.timezone,
      },
    },
  );
  const values = useWatch({ control: form.control });
  const type = values.reminderTargetType ?? 'NONE';

  const submit = form.handleSubmit((next) => {
    save.mutate(
      {
        expectedVersion: settings.version,
        reminderCron: scheduleToCron(next),
        reminderEnabled: next.reminderEnabled,
        reminderMinDebt: next.reminderMinDebt,
        reminderTargetId: next.reminderTargetType === 'NONE' ? null : next.reminderTargetId,
        reminderTargetType: next.reminderTargetType,
        timezone: next.timezone,
      },
      {
        onSuccess: () => {
          hapticSuccess();
          showToast('success', 'Đã lưu cài đặt ví.');
        },
      },
    );
  });

  const error = save.error;
  const conflict = isVersionConflict(error);

  return (
    <Screen
      footer={
        <BottomActionBar>
          <Button
            disabled={offline}
            fullWidth
            label={offline ? 'Kết nối lại để lưu' : 'Lưu cài đặt'}
            loading={save.isPending}
            onPress={submit}
          />
        </BottomActionBar>
      }
      header={<AppBar title="Cài đặt ví" onBack={router.back} />}
      keyboardAware
    >
      <View className="gap-xl py-xs">
        {conflict ? (
          <Alert
            actions={
              <Button
                label="Tải lại"
                size="sm"
                onPress={() =>
                  void queryClient.invalidateQueries({ queryKey: walletKeys.ws(wsId) })
                }
              />
            }
            description="Cài đặt vừa được người khác thay đổi. Tải lại để sửa trên bản mới nhất."
            tone="warning"
          />
        ) : error ? (
          <Alert
            description={toErrorMessage(error)}
            title={
              walletErrorCode(error) === WALLET_ERROR.invalidReminderTarget
                ? 'Nơi đăng không hợp lệ'
                : undefined
            }
            tone="error"
          />
        ) : null}

        <Section title="Nhắc nợ định kỳ">
          <View className="gap-lg">
            <Controller
              control={form.control}
              name="reminderEnabled"
              render={({ field }) => (
                <Toggle
                  description="Gửi thông báo riêng cho từng người còn nợ."
                  label="Bật nhắc nợ"
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />

            {values.reminderEnabled ? (
              <>
                <ReminderScheduleFields control={form.control} timezone={settings.timezone} />
                <Controller
                  control={form.control}
                  name="reminderMinDebt"
                  render={({ field, fieldState }) => (
                    <MoneyInput
                      hint="Chỉ nhắc người nợ từ mức này trở lên. Nhập 0 để nhắc mọi khoản."
                      label="Ngưỡng nợ tối thiểu"
                      max={1_000_000}
                      message={fieldState.error?.message}
                      messageTone="error"
                      value={field.value}
                      onChange={(next) => field.onChange(next ?? 0)}
                    />
                  )}
                />
                <ReminderTargetField
                  control={form.control}
                  setValue={form.setValue}
                  targets={targets}
                  type={type}
                />
                <ReminderPreview
                  debtorsCount={debtorsCount}
                  enabled={type !== 'NONE'}
                  wsId={wsId}
                />
              </>
            ) : null}
          </View>
        </Section>

        <Section title="Nhắc ngay">
          <RemindNowSection wsId={wsId} />
        </Section>
      </View>
    </Screen>
  );
}
