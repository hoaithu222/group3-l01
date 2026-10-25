import { Text, View } from 'react-native';

import { Checkbox } from '@/shared/ui/checkbox';
import { Icon } from '@/shared/ui/icon';

import type { SplitType } from '../api';
import { formatMoney } from '../domain/money';
import { MoneyInput } from './MoneyInput';
import { PercentField } from './PercentField';

export interface SplitParticipantRowProps {
  checked: boolean;
  customValue: number | null;
  disabled?: boolean;
  /** `WALLET_001`: người này không còn thuộc nhóm — đánh dấu dòng, không tự bỏ (để người dùng thấy VÌ SAO lưu thất bại). */
  invalid?: boolean;
  isMe: boolean;
  isPayer: boolean;
  name: string;
  /** Phần của người này theo `previewSplit` (đồng) — hiện ở EQUAL và dưới ô PERCENT. */
  owed: number;
  percentBps: number | null;
  splitType: SplitType;
  onCustomChange: (value: number | null) => void;
  onPercentChange: (bps: number | null) => void;
  onToggle: () => void;
}

/**
 * Một người trong khoản chia: ô chọn + tên + (tuỳ kiểu chia) phần được chia hoặc ô nhập.
 * Người KHÔNG được chọn không hiện ô nhập — số đã gõ vẫn giữ trong bản nháp nhưng không
 * đi vào tổng (`draftToParticipants` chỉ lấy người `selected`).
 */
export function SplitParticipantRow(props: SplitParticipantRowProps) {
  const {
    checked,
    customValue,
    disabled,
    invalid,
    isMe,
    isPayer,
    name,
    owed,
    percentBps,
    splitType,
  } = props;
  const label = `${name}${isMe ? ' (Bạn)' : ''}${isPayer ? ', người trả' : ''}`;

  return (
    <View className="gap-2xs py-2xs">
      <View className="min-h-11 flex-row items-center gap-sm">
        <View className="flex-1">
          <Checkbox
            accessibilityLabel={label}
            checked={checked}
            disabled={disabled}
            label={`${name}${isMe ? ' (Bạn)' : ''}${isPayer ? ' · người trả' : ''}`}
            onChange={props.onToggle}
          />
        </View>

        {checked && splitType === 'EQUAL' ? (
          <Text className="text-label-lg font-semibold text-fg-1">{formatMoney(owed)}</Text>
        ) : null}
      </View>

      {checked && splitType === 'CUSTOM' ? (
        <MoneyInput
          accessibilityLabel={`Số tiền của ${name}`}
          disabled={disabled}
          size="sm"
          value={customValue}
          onChange={props.onCustomChange}
        />
      ) : null}
      {checked && splitType === 'PERCENT' ? (
        <View className="gap-3xs">
          <PercentField
            accessibilityLabel={`Phần trăm của ${name}`}
            disabled={disabled}
            initialBps={percentBps}
            size="sm"
            onChange={props.onPercentChange}
          />
          <Text className="text-caption-lg text-fg-2">≈ {formatMoney(owed)}</Text>
        </View>
      ) : null}

      {invalid ? (
        <View className="flex-row items-center gap-2xs">
          <Icon color="error" name="alert-warning" size="sm" />
          <Text className="text-caption-lg text-error">
            Người này không còn trong nhóm — hãy bỏ chọn
          </Text>
        </View>
      ) : null}
    </View>
  );
}
