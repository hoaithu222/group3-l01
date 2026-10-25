import { Icon } from '@/shared/ui/icon';

import { ListItem } from '../list/ListItem';
import { selectOptionStyles } from './select.styles';
import type { SelectOption } from './select.types';

export interface SelectOptionRowProps {
  /** Kẻ 1px ở đáy dòng. `SelectSheet` quyết dòng nào có — xem chú thích ở đó. */
  divider?: boolean;
  option: SelectOption;
  selected: boolean;
  onSelect: (value: string) => void;
}

/**
 * Một dòng lựa chọn trong `SelectSheet`.
 *
 * ── Vì sao `ListItem` chứ không phải `Radio` ────────────────────────────────
 * `Radio` có sẵn `accessibilityState={{ selected }}` và vòng tròn chọn — nghe
 * hợp hơn. Nhưng nó chỉ nhận `label?: string`, KHÔNG có dòng mô tả, trong khi
 * tấm chọn cửa hàng (`365:30369`) là "3 hàng thẻ **2 dòng** (tên + địa chỉ)" và
 * `SelectOption.description` là một phần API. Bỏ mô tả đi là bỏ đúng màn hình
 * mà tấm này sinh ra để phục vụ; `ListItem` có `description` sẵn.
 *
 * ── Trạng thái "đang chọn" đi qua BA đường, cố ý ────────────────────────────
 * `ListItem` lo hai đường: `accessibilityState={{ selected }}` và nền tint —
 * cả hai khai cùng một chỗ nên không lệch nhau được. ⛔ Đừng dựng lại nền tint
 * ở nhóm này.
 *
 * Đường thứ ba là dấu tick, và nó KHÔNG thừa: luật `src/shared/ui/AGENTS.md`
 * cấm để MÀU là dấu hiệu duy nhất, mà `accessibilityState` thì người sáng mắt
 * không thấy.
 *
 * ⛔ `label` của `Icon` ở đây KHÔNG phải trang trí. Với mũi tên `›` cuối hàng
 * thì để trống là đúng; với dấu tick này thì để trống là xoá mất một trong ba
 * đường.
 */
export function SelectOptionRow({
  divider = false,
  option,
  selected,
  onSelect,
}: SelectOptionRowProps) {
  return (
    <ListItem
      className={selectOptionStyles().root()}
      description={option.description}
      disabled={option.disabled}
      divider={divider}
      label={option.label}
      /* Tên tỉnh/cửa hàng dài thì XUỐNG DÒNG (tối đa 2) chứ không cắt cụt: người
         dùng đang phải phân biệt "Phường 12" với "Phường 12, Quận Bình Thạnh". */
      labelNumberOfLines={2}
      selected={selected}
      trailing={
        selected ? <Icon color="fg-brand" label="Đang chọn" name="checkmark-circle" /> : null
      }
      onPress={() => onSelect(option.value)}
    />
  );
}
