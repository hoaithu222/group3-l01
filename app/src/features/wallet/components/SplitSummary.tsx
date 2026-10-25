import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import type { SplitType } from '../api';
import { formatMoney } from '../domain/money';
import { describeSplitProblem } from '../domain/split-message';
import type { SplitPreview } from '../domain/split-preview';

export interface SplitSummaryProps {
  payerName: string;
  preview: SplitPreview;
  splitType: SplitType;
}

/**
 * Dòng KẾT QUẢ chia, cập nhật từng lần gõ: "Mỗi người 37.500 VND · An chịu phần lẻ 2 VND"
 * (EQUAL) hoặc "Còn thiếu 10.000 VND" / "Thừa 5%" (CUSTOM/PERCENT). Là vùng live-region
 * để trình đọc màn hình báo thay đổi mà không phải dò lại.
 *
 * Trạng thái sai KHÔNG chỉ là màu đỏ — có icon cảnh báo và chữ nói rõ thiếu/thừa bao nhiêu.
 */
export function SplitSummary({ payerName, preview, splitType }: SplitSummaryProps) {
  const { problem } = preview;
  const each = preview.perPerson[0]?.owed ?? 0;

  // Chưa nhập tiền/chưa chọn người là chưa-làm-xong, không phải lỗi của người dùng: không tô đỏ.
  const isHint = problem?.kind === 'INVALID_AMOUNT' || problem?.kind === 'NO_PARTICIPANTS';
  const isError = problem !== null && !isHint;

  let text: string;
  if (problem) text = describeSplitProblem(problem);
  else if (splitType === 'EQUAL') {
    const leftover =
      preview.remainder > 0 ? ` · ${payerName} chịu phần lẻ ${formatMoney(preview.remainder)}` : '';
    text = `Mỗi người ${formatMoney(each)}${leftover}`;
  } else text = splitType === 'CUSTOM' ? 'Tổng khớp với số tiền khoản chi' : 'Đủ 100%';

  const icon = isError ? 'alert-warning' : problem ? 'alert-information' : 'checkmark-circle';
  const iconColor = isError ? 'error' : problem ? 'fg-2' : 'success';

  return (
    <View
      accessibilityLiveRegion="polite"
      accessible
      className={cn(
        'flex-row items-center gap-xs rounded-sm p-sm',
        isError ? 'bg-surface-error' : 'bg-surface-neutral',
      )}
    >
      <Icon color={iconColor} name={icon} size="sm" />
      <Text
        className={cn('flex-1 text-label-md font-semibold', isError ? 'text-error' : 'text-fg-1')}
      >
        {text}
      </Text>
    </View>
  );
}
