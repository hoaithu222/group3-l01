import { Text } from 'react-native';

import { Input, type InputProps } from '@/shared/ui/input';

import { WALLET_LIMITS } from '../constants/wallet.constants';
import { formatMoneyInput, parseMoneyInput } from '../domain/money';

export interface MoneyInputProps extends Pick<
  InputProps,
  | 'accessibilityLabel'
  | 'className'
  | 'disabled'
  | 'hint'
  | 'label'
  | 'message'
  | 'messageTone'
  | 'placeholder'
  | 'required'
  | 'size'
> {
  /** Trần số tiền — mặc định `LIMITS.wallet.expenseMax`. Gõ vượt thì giữ ở trần, không nhảy sang số lạ. */
  max?: number;
  /** Số nguyên đồng; `null` = ô trống (khác `0`). */
  value: number | null;
  onChange: (value: number | null) => void;
}

/**
 * Ô nhập SỐ TIỀN: bàn phím số, hiện phân cách nghìn khi gõ (`1.234.567`), giá trị
 * đi ra là SỐ NGUYÊN (không bao giờ chuỗi, không bao giờ số thực).
 *
 * Viết cục bộ vì bộ chung (`shared/ui`) chưa có `MoneyInput` — `ui-components.md`
 * §8 ghi rõ "ô nhập số tiền dựng bằng `Input`, `MoneyInput` riêng còn trong
 * backlog". Chỉ ví dùng, nên ở lại feature; nếu feature thứ hai cần thì đưa lên
 * `shared/ui` và đọc `src/shared/ui/AGENTS.md` trước.
 *
 * ⚠️ CONTROLLED (`value` từ state cha) — bắt buộc để chữ trên màn hình cũng được
 * định dạng lại; `Input` uncontrolled chỉ lọc giá trị gửi ra (xem `digitsOnly`).
 * Không có rủi ro mất dấu Telex như ô tìm kiếm: ô này chỉ nhận chữ số.
 */
export function MoneyInput({
  max = WALLET_LIMITS.expenseMax,
  onChange,
  value,
  ...inputProps
}: MoneyInputProps) {
  return (
    <Input
      {...inputProps}
      inputMode="numeric"
      keyboardType="number-pad"
      placeholder={inputProps.placeholder ?? '0'}
      trailing={<Text className="text-label-lg text-fg-2">VND</Text>}
      value={formatMoneyInput(value)}
      onChangeText={(text) => onChange(parseMoneyInput(text, max))}
    />
  );
}
