import { Controller, type Control, type UseFormSetValue } from 'react-hook-form';
import { Text, View } from 'react-native';

import { Radio, RadioGroup } from '@/shared/ui/radio';

import type { ReminderTargetType, ReminderTargets } from '../api';
import type { WalletSettingsFormValues } from '../schemas/wallet-forms.schemas';
import { OptionSelect } from './OptionSelect';

export interface ReminderTargetFieldProps {
  control: Control<WalletSettingsFormValues>;
  disabled?: boolean;
  setValue: UseFormSetValue<WalletSettingsFormValues>;
  /** `undefined` = danh sách đích chưa tải xong. */
  targets: ReminderTargets | undefined;
  type: ReminderTargetType;
}

const TYPE_LABEL: Record<ReminderTargetType, string> = {
  NONE: 'Không đăng vào nhóm chat/kênh',
  CONVERSATION: 'Nhóm chat',
  CHANNEL: 'Kênh',
};

/**
 * Nơi đăng tin nhắc chung: Không · một nhóm chat GROUP của nhóm · một kênh TEXT. Tin đăng vào đây KHÔNG
 * có số tiền (chỉ "N bạn còn khoản chưa thanh toán" + "Mở ví"). Đổi loại thì xoá đích cũ — đích của
 * loại này là id SAI của loại kia và BE trả `WALLET_008`.
 */
export function ReminderTargetField({
  control,
  disabled,
  setValue,
  targets,
  type,
}: ReminderTargetFieldProps) {
  const options =
    type === 'CONVERSATION' ? targets?.conversations : type === 'CHANNEL' ? targets?.channels : [];

  return (
    <View className="gap-sm">
      <Text className="text-label-md font-semibold text-fg-1">Đăng tin nhắc vào</Text>
      <Controller
        control={control}
        name="reminderTargetType"
        render={({ field }) => (
          <RadioGroup
            accessibilityLabel="Nơi đăng tin nhắc nợ"
            value={field.value}
            onChange={(value) => {
              field.onChange(value);
              setValue('reminderTargetId', null, { shouldValidate: false });
            }}
          >
            {(Object.keys(TYPE_LABEL) as ReminderTargetType[]).map((key) => (
              <Radio key={key} disabled={disabled} label={TYPE_LABEL[key]} value={key} />
            ))}
          </RadioGroup>
        )}
      />

      {type !== 'NONE' ? (
        <Controller
          control={control}
          name="reminderTargetId"
          render={({ field, fieldState }) => (
            <OptionSelect
              disabled={disabled || targets === undefined}
              label={type === 'CONVERSATION' ? 'Chọn nhóm chat' : 'Chọn kênh'}
              message={
                fieldState.error?.message ??
                (options?.length === 0 ? 'Nhóm chưa có mục nào phù hợp.' : undefined)
              }
              options={(options ?? []).map((item) => ({ label: item.label, value: item.id }))}
              placeholder={targets === undefined ? 'Đang tải…' : 'Chọn'}
              searchable
              searchPlaceholder={type === 'CONVERSATION' ? 'Tìm nhóm chat' : 'Tìm kênh'}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      ) : null}
    </View>
  );
}
