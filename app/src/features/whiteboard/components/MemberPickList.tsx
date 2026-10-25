import { Avatar } from '@/shared/ui/avatar';
import { SheetList } from '@/shared/ui/bottom-sheet';
import { EmptyState } from '@/shared/ui/empty-state';
import { Icon } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';

import type { MemberOption } from '../api/whiteboard.types';

export interface MemberPickListProps {
  /** Câu lỗi khi TẢI danh sách thành viên thất bại; `null` = không lỗi. */
  errorMessage: string | null;
  /** Trần số người mỗi lượt — chạm trần thì các hàng CHƯA chọn khoá lại và nói lý do. */
  limit: number;
  loading: boolean;
  /** Thành viên CÓ THỂ mời (cha đã lọc người đã là cộng tác viên). */
  options: readonly MemberOption[];
  selected: readonly string[];
  onRetry: () => void;
  onToggle: (userId: string) => void;
}

/** Ba hàng giữ chỗ — cùng dáng "ảnh tròn + chữ" với hàng thật để tấm không đổi bố cục khi dữ liệu về. */
const SKELETON_ROWS = [0, 1, 2] as const;

/**
 * Thân của `AddCollaboratorSheet` (tấm `padded={false}`): bốn trạng thái — đang tải · lỗi tải (thử lại) · hết người để mời ·
 * danh sách chọn NHIỀU.
 *
 * ✅ Hàng `ListItem` (ảnh đại diện · tên là TIÊU ĐỀ · dấu tích khi chọn · kẻ ngăn) thay cho `Checkbox` trần: cả hàng là vùng chạm,
 * trạng thái chọn đi bằng `selected` (trình đọc màn hình) + dấu tích + nền tint — không chỉ bằng màu.
 * ⚠️ `EmptyState` tự có lề `px-md` nên KHÔNG bọc `SheetList` (bọc là thụt 32dp).
 */
export function MemberPickList({
  errorMessage,
  limit,
  loading,
  options,
  selected,
  onRetry,
  onToggle,
}: MemberPickListProps) {
  if (loading) {
    return (
      <SheetList className="gap-md">
        {SKELETON_ROWS.map((row) => (
          <SkeletonParagraphWithIcon key={row} />
        ))}
      </SheetList>
    );
  }

  if (errorMessage) {
    return (
      <EmptyState
        actions={[{ label: 'Thử lại', onPress: onRetry, variant: 'secondary' }]}
        description={errorMessage}
        icon="alert-warning"
        size="compact"
        tone="danger"
      />
    );
  }

  if (options.length === 0) {
    return (
      <EmptyState
        description="Không còn thành viên nào để thêm."
        icon="user"
        size="compact"
        tone="neutral"
      />
    );
  }

  const full = selected.length >= limit;

  return (
    <SheetList accessibilityLabel="Thành viên của nhóm" accessibilityRole="list">
      {options.map((member, index) => {
        const isSelected = selected.includes(member.userId);
        // Chạm trần: hàng ĐÃ chọn vẫn bỏ chọn được, hàng chưa chọn khoá — lý do nằm ngay dưới tên (không ai phải đoán vì sao chạm không ăn).
        const blocked = full && !isSelected;
        return (
          <ListItem
            key={member.userId}
            description={blocked ? `Đã chọn đủ ${String(limit)} người` : undefined}
            disabled={blocked}
            divider={index < options.length - 1}
            emphasis="title"
            label={member.name}
            leading={<Avatar name={member.name} size="sm" />}
            selected={isSelected}
            // Dấu tích thuần hình (không nhãn ⇒ tự ẩn khỏi trình đọc màn hình): trạng thái đã đọc qua `selected` của hàng.
            trailing={isSelected ? <Icon color="fg-brand" name="checkmark-circle" /> : undefined}
            onPress={() => onToggle(member.userId)}
          />
        );
      })}
    </SheetList>
  );
}
