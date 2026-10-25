import { useState } from 'react';

import { BottomSheet } from '../bottom-sheet/BottomSheet';
import { SheetList } from '../bottom-sheet/SheetList';
import { CLOSE_DURATION_MS } from '../bottom-sheet/useSheetTransition';
import { Button } from '../button/Button';
import { Icon, type IconName } from '../icon';
import { ListItem } from '../list/ListItem';

/** Một hành động trong menu "⋯". */
export interface ActionMenuItem {
  /** Chú thích phụ dưới nhãn (điều kiện, hệ quả). */
  description?: string;
  disabled?: boolean;
  /**
   * Ẩn hẳn (vd thiếu quyền). Cho nơi gọi khai TOÀN BỘ danh sách rồi để đây lọc — không phải bọc từng phần tử bằng `cond ? … : null`.
   * ⚠️ Đây là ẩn theo quyền/ngữ cảnh; hành động chỉ tạm không dùng được thì dùng `disabled` (kèm `description` nêu lý do).
   */
  hidden?: boolean;
  icon?: IconName;
  /** Khoá ổn định của hàng (không dùng nhãn: nhãn đổi theo ngôn ngữ/trạng thái). */
  key: string;
  label: string;
  onPress: () => void;
  /** `danger` = thao tác phá huỷ/không hoàn tác (chữ + icon đỏ). Tự xuống nhóm CUỐI của tấm dù khai ở đâu (`ActionMenuSheet`). */
  tone?: 'danger' | 'default';
}

export interface ActionMenuProps {
  /** Nhãn trợ năng của NÚT "⋯" (nút chỉ có icon nên bắt buộc có nhãn). */
  accessibilityLabel?: string;
  items: ActionMenuItem[];
  /** Tiêu đề tấm (vd tên đối tượng đang thao tác). Bỏ trống thì tấm chỉ có thanh kéo. */
  title?: string;
}

/**
 * Menu "⋯" dùng chung — thay cho việc nhét 3–5 nút icon lên `AppBar`.
 *
 * Bản vẽ `AppBar` chỉ có 2 khe phải (`AppBar.tsx`); nhiều hơn thì tiêu đề bị bóp và cắt "…". Quy ước: giữ 1–2 hành động
 * THƯỜNG DÙNG NHẤT làm icon riêng, gom phần còn lại vào đây. Đây là "List chức năng — overflow menu của app bar" của bộ
 * bản vẽ (tấm dưới, hàng ≥ 48dp, có ngăn cách).
 *
 * ```tsx
 * <AppBar
 *   actions={
 *     <View className="flex-row items-center gap-2xs">
 *       <Button accessibilityLabel="Tìm" iconLeft="search" iconOnly size="sm" variant="tertiary" onPress={openSearch} />
 *       <ActionMenu
 *         title="Kênh Chung"
 *         items={[
 *           { key: 'pins', icon: 'location', label: 'Tin đã ghim', onPress: openPins },
 *           { key: 'members', icon: 'user', label: 'Thành viên', onPress: openMembers },
 *           { key: 'leave', icon: 'logout', label: 'Rời kênh', tone: 'danger', hidden: !canLeave, onPress: leave },
 *         ]}
 *       />
 *     </View>
 *   }
 * />
 * ```
 *
 * ⛔ Bấm một hàng thì ĐÓNG tấm trước, RỒI mới chạy `onPress` (sau khi hiệu ứng đóng xong). Chạy ngay khi tấm còn đang đóng
 * thì hành động mở một `Modal`/tấm khác (hộp xác nhận xoá…) bị Android nuốt — hai cửa sổ tranh nhau trong một nhịp.
 * Không còn hàng nào hiện ⇒ không vẽ cả nút (không để một nút "⋯" bấm ra tấm rỗng).
 */
export function ActionMenu({
  accessibilityLabel = 'Thêm tuỳ chọn',
  items,
  title,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);

  if (items.every((item) => item.hidden)) return null;

  return (
    <>
      <Button
        accessibilityLabel={accessibilityLabel}
        iconLeft="more"
        iconOnly
        size="sm"
        variant="tertiary"
        onPress={() => setOpen(true)}
      />
      <ActionMenuSheet items={items} title={title} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

export interface ActionMenuSheetProps {
  items: ActionMenuItem[];
  title?: string;
  visible: boolean;
  onClose: () => void;
}

/**
 * Chính tấm hành động của `ActionMenu`, nhưng do NƠI GỌI điều khiển mở/đóng — dùng khi menu được mở từ chỗ khác chứ không từ
 * nút "⋯" (vd thẻ Kanban: nút "⋯" của từng thẻ; chi tiết thẻ: nút "⋯" dưới tiêu đề). Cùng hàng `ListItem` ≥ 48dp, cùng luật
 * "đóng tấm rồi mới chạy `onPress`", nên mọi menu hành động trong app trông và chạy giống nhau.
 */
export function ActionMenuSheet({ items, title, visible, onClose }: ActionMenuSheetProps) {
  const visibleItems = items.filter((item) => !item.hidden);
  // Nhóm nguy hiểm (`danger`) LUÔN ở cuối, thứ tự trong từng nhóm giữ nguyên (p0-12): xoá/rời/chặn không nằm lẫn giữa hai hành động
  // thường — bấm nhầm là mất dữ liệu. Nơi gọi đã đặt cuối thì không có gì đổi.
  const shown = [
    ...visibleItems.filter((item) => item.tone !== 'danger'),
    ...visibleItems.filter((item) => item.tone === 'danger'),
  ];

  const choose = (item: ActionMenuItem) => {
    onClose();
    // Chờ hiệu ứng đóng tấm xong rồi mới chạy. Không dùng `InteractionManager.runAfterInteractions` (RN 0.86 đánh dấu deprecated).
    setTimeout(() => item.onPress(), CLOSE_DURATION_MS + 30);
  };

  return (
    <BottomSheet padded={false} snapToContent title={title} visible={visible} onClose={onClose}>
      {/* `SheetList` (= `px-md`): tấm `padded={false}` không đệm ngang, `ListItem` cũng không (nó vốn nằm trong `Card` đã có đệm) — thiếu lề này icon dính sát mép tấm, lệch 16dp so với tiêu đề. */}
      <SheetList accessibilityRole="menu" className="pb-md">
        {shown.map((item, index) => (
          <ListItem
            key={item.key}
            description={item.description}
            disabled={item.disabled}
            divider={index < shown.length - 1}
            emphasis={item.tone === 'danger' ? 'danger' : 'title'}
            label={item.label}
            leading={
              item.icon ? (
                <Icon color={item.tone === 'danger' ? 'error' : 'fg-2'} name={item.icon} />
              ) : undefined
            }
            tone={item.tone === 'danger' ? 'error' : 'default'}
            onPress={() => choose(item)}
          />
        ))}
      </SheetList>
    </BottomSheet>
  );
}
