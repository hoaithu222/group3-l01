import { Text, View } from 'react-native';

import { Radio, RadioGroup } from '@/shared/ui/radio';

import type { SettlementMethod } from '../api';
import { SETTLEMENT_METHOD_LABEL } from '../constants/wallet.constants';

export interface SettleMethodFieldProps {
  value: SettlementMethod;
  onChange: (value: SettlementMethod) => void;
}

const METHODS: readonly SettlementMethod[] = ['BANK', 'CASH', 'OTHER'];

/** Hình thức trả: chuyển khoản (hiện QR) · tiền mặt · khác. Chọn MỘT — `RadioGroup` giữ `value` chung. */
export function SettleMethodField({ onChange, value }: SettleMethodFieldProps) {
  return (
    <View className="gap-xs">
      <Text className="text-label-md font-semibold text-fg-1">Hình thức</Text>
      <RadioGroup
        accessibilityLabel="Hình thức thanh toán"
        value={value}
        onChange={(next) => onChange(next as SettlementMethod)}
      >
        {METHODS.map((item) => (
          <Radio key={item} label={SETTLEMENT_METHOD_LABEL[item]} value={item} />
        ))}
      </RadioGroup>
    </View>
  );
}
