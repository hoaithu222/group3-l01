import { type ReactNode } from 'react';
import { View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { Icon } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';
import { LoadingMore } from '@/shared/ui/progress';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { includesSearch } from '@/shared/utils/format/string.utils';

/** Một mục chọn được. ⚠️ Khai ở ĐÂY (không ở `MultiPickSheet`) để hai file không nhập vòng; tấm xuất lại kiểu này. */
export interface PickOption {
  id: string;
  label: string;
  /** Khe đầu hàng: avatar người (`Avatar size="sm"`), chấm màu nhãn đặt trong ô 32dp… */
  leading?: ReactNode;
}

export interface MultiPickRowsProps {
  emptyMessage: string;
  /** Hàng hành động thêm ở CUỐI danh sách (vd "Tạo nhãn mới") — hàng chọn cuối cùng tự kẻ ngăn phía trên nó. */
  extra?: ReactNode;
  /** Từ khoá lọc CỤC BỘ (tìm phía server thì luôn rỗng — danh sách đã là kết quả lọc sẵn). */
  filter: string;
  loading: boolean;
  max: number;
  options: readonly PickOption[];
  picked: readonly string[];
  onToggle: (id: string) => void;
}

/** 3 hàng khung xương — cùng dáng "icon + hai dòng" với hàng thật, danh sách không nhảy khi dữ liệu về. */
const SKELETON_ROWS = [0, 1, 2] as const;

/**
 * Thân của `MultiPickSheet`: hàng `ListItem` bấm-để-tick + đủ ba trạng thái tải / rỗng / tải thêm.
 * Tách khỏi `MultiPickSheet.tsx` để file tấm giữ dưới trần 200 dòng; nằm TRONG `SheetList` của tấm nên tự có lề 16.
 */
export function MultiPickRows({
  emptyMessage,
  extra,
  filter,
  loading,
  max,
  options,
  picked,
  onToggle,
}: MultiPickRowsProps) {
  const rows = filter.trim()
    ? options.filter((option) => includesSearch(option.label, filter))
    : options;
  const full = picked.length >= max;

  let body: ReactNode;
  if (rows.length === 0 && loading) {
    body = (
      <View className="gap-md py-sm">
        {SKELETON_ROWS.map((key) => (
          <SkeletonParagraphWithIcon key={key} />
        ))}
      </View>
    );
  } else if (rows.length === 0) {
    // Lọc cục bộ mà không khớp ≠ "bảng chưa có nhãn nào" — câu rỗng phải nói đúng lý do.
    const noMatch = filter.trim() !== '' && options.length > 0;
    body = (
      <EmptyState
        // `px-0`: khối này nằm TRONG `SheetList` (đã lề 16) — giữ `px-md` riêng của `EmptyState` là thụt 32.
        className="px-0"
        description={noMatch ? 'Không có mục nào khớp từ khoá.' : emptyMessage}
        icon="search"
        size="compact"
        tone="neutral"
      />
    );
  } else {
    body = rows.map((option, index) => {
      const checked = picked.includes(option.id);
      // Đủ tối đa thì hàng CHƯA chọn bị khoá — kèm lý do ngay tại hàng, không để người dùng bấm mãi không ăn.
      const locked = !checked && full;
      return (
        <ListItem
          key={option.id}
          description={locked ? `Đã chọn đủ ${max} mục` : undefined}
          disabled={locked}
          divider={index < rows.length - 1 || Boolean(extra)}
          emphasis="title"
          label={option.label}
          labelNumberOfLines={2}
          leading={option.leading}
          selected={checked}
          // Dấu tick là dấu hiệu NHÌN THẤY; trạng thái cho trình đọc màn hình đi qua `selected` của hàng.
          trailing={checked ? <Icon color="fg-brand" name="checkmark-circle" /> : undefined}
          onPress={() => onToggle(option.id)}
        />
      );
    });
  }

  return (
    <>
      {body}
      {/* Đã có hàng (người đang được giao) mà kết quả tìm còn đang về ⇒ báo ở chân danh sách, không xoá hàng đi vẽ khung xương. */}
      {rows.length > 0 && loading ? <LoadingMore /> : null}
      {extra}
    </>
  );
}
