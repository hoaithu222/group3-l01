import { useState, type ReactNode } from 'react';

import { Alert } from '@/shared/ui/alert';
import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { SearchInput } from '@/shared/ui/search';

import { MultiPickRows, type PickOption } from './MultiPickRows';

export type { PickOption } from './MultiPickRows';

export interface MultiPickSheetProps {
  /**
   * Hàng hành động THÊM ở cuối danh sách (vd `ListItem` "Tạo nhãn mới") — tuỳ chọn. Nằm trong `SheetList` nên tự có lề 16;
   * hàng chọn cuối cùng tự kẻ ngăn phía trên nó. ⛔ Đừng truyền `Button` trần: nút ôm chữ lơ lửng lệch hẳn nhịp các hàng.
   */
  extra?: ReactNode;
  emptyMessage: string;
  /** Câu lỗi lưu (409/TASK_013…) — hiện NGAY trong tấm, giữ nguyên lựa chọn đang có. */
  error?: string | null;
  loading?: boolean;
  /** Số lượng chọn tối đa (`assigneesMax`, `labelsPerTaskMax`). */
  max: number;
  options: readonly PickOption[];
  saving?: boolean;
  /** Có thì ô tìm là tìm PHÍA SERVER (người làm, ≤ 20 kết quả); không thì lọc cục bộ. */
  searchPlaceholder?: string;
  selectedIds: readonly string[];
  title: string;
  visible: boolean;
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
  onSearch?: (text: string) => void;
}

/**
 * Tấm chọn NHIỀU mục dùng chung cho "Người làm" và "Nhãn" (app.md §2 `AssigneePickerSheet` /
 * `LabelPickerSheet`): ô tìm IME-safe (uncontrolled) ghim ở đầu, danh sách hàng `ListItem` bấm-để-tick, "Xong" áp
 * MỘT lần — không gọi `PATCH` cho mỗi lần tick (mỗi lần tăng `version`, hai lần liền sẽ tự xung đột).
 *
 * Hàng là `ListItem` trong `SheetList` (tấm tràn viền, thân ở `MultiPickRows`): CẢ hàng là vùng chạm ≥ 44dp — trước
 * đây ô `leading` nằm NGOÀI `Checkbox` nên chạm vào avatar không tick được, và các hàng cách nhau `gap-xs` không kẻ ngăn.
 *
 * `SelectSheet` của bộ chung chỉ chọn MỘT giá trị nên không dùng được. Lựa chọn nạp lại từ
 * `selectedIds` MỖI LẦN tấm mở (điều chỉnh state ngay lúc render khi `visible` đổi — mẫu của React
 * thay cho `useEffect` nạp lại, vốn vẽ một nhịp với lựa chọn cũ).
 */
export function MultiPickSheet({
  emptyMessage,
  error,
  extra,
  loading = false,
  max,
  options,
  saving,
  searchPlaceholder,
  selectedIds,
  title,
  visible,
  onClose,
  onConfirm,
  onSearch,
}: MultiPickSheetProps) {
  const [picked, setPicked] = useState<string[]>([...selectedIds]);
  const [localFilter, setLocalFilter] = useState('');
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setPicked([...selectedIds]);
      setLocalFilter('');
    }
  }

  const toggle = (id: string) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  return (
    <BottomSheet
      alert={error ? <Alert description={error} tone="error" /> : undefined}
      footer={
        // ⛔ `fullWidth`: thiếu nó nút ôm chữ thành viên thuốc nhỏ dạt trái — nút CHÍNH của tấm trông như nút phụ.
        <Button
          fullWidth
          label={`Xong (${picked.length}/${max})`}
          loading={saving}
          onPress={() => onConfirm(picked)}
        />
      }
      padded={false}
      scrollable
      search={
        searchPlaceholder ? (
          <SearchInput placeholder={searchPlaceholder} onChangeText={onSearch ?? setLocalFilter} />
        ) : undefined
      }
      title={title}
      visible={visible}
      onClose={onClose}
    >
      {/* Không `pb-md`: tấm có `footer`, khe dưới hàng cuối do vùng đáy lo. */}
      <SheetList accessibilityLabel={title} accessibilityRole="list">
        <MultiPickRows
          emptyMessage={emptyMessage}
          extra={extra}
          // Tìm phía server (`onSearch`) thì ô tìm không ghi vào `localFilter` — danh sách đã là kết quả lọc sẵn.
          filter={localFilter}
          loading={loading}
          max={max}
          options={options}
          picked={picked}
          onToggle={toggle}
        />
      </SheetList>
    </BottomSheet>
  );
}
