import { Text, View } from 'react-native';

import { Chip } from '@/shared/ui/chip';
import { Icon } from '@/shared/ui/icon';
import { hapticSelection } from '@/shared/utils/haptics';

import type { ExpenseCategory } from '../api';
import { categoryVisual, EXPENSE_CATEGORIES } from '../constants/wallet.constants';

export interface ExpenseCategoryChipsProps {
  disabled?: boolean;
  value: ExpenseCategory;
  onChange: (value: ExpenseCategory) => void;
}

/**
 * Danh mục — chọn MỘT (vai `radio`, không phải `checkbox`: trình đọc màn hình sẽ nói "chọn một trong nhiều").
 * Mỗi chip mở đầu bằng CÙNG icon với ô danh mục ở dòng khoản chi (`categoryVisual`) — chọn ở form nào thì thấy lại đúng hình đó ở danh sách.
 * Icon màu `fg-brand` khi đang chọn (khớp chữ của chip chọn), `fg-2` khi chưa — hình trang trí, nghĩa nằm ở nhãn.
 */
export function ExpenseCategoryChips({ disabled, onChange, value }: ExpenseCategoryChipsProps) {
  return (
    <View accessibilityRole="radiogroup" className="gap-xs">
      <Text className="text-label-md font-semibold text-fg-1">Danh mục</Text>
      <View className="flex-row flex-wrap gap-xs">
        {EXPENSE_CATEGORIES.map((category) => {
          const selected = value === category.value;
          return (
            <Chip
              key={category.value}
              disabled={disabled}
              label={category.label}
              leading={
                <Icon
                  color={selected ? 'fg-brand' : 'fg-2'}
                  name={categoryVisual(category.value).icon}
                  size="sm"
                />
              }
              role="radio"
              selected={selected}
              onPress={() => {
                if (!selected) hapticSelection();
                onChange(category.value);
              }}
            />
          );
        })}
      </View>
    </View>
  );
}
