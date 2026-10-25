import { type ReactNode, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { EmptyState } from '@/shared/ui/empty-state';
import { ListItem } from '@/shared/ui/list';
import { LoadingMore } from '@/shared/ui/progress';
import { SearchInput } from '@/shared/ui/search';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { formatDate } from '@/shared/utils/format/date.utils';
import { matchesSearch } from '@/shared/utils/format/string.utils';

import type { TaskCardDto } from '../../api/boards.types';
import type { DependencyTaskDto } from '../../api/critical-path.types';
import { COLUMN_KIND_BADGE } from '../../constants/critical-path.constants';
import { COLUMN_KIND_LABEL } from '../../constants/kanban.constants';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import type { DependencyDirection } from '../../queries/dependencies.queries';
import { useBoardTasks } from '../../queries/tasks.queries';

/** Số thẻ tối đa hiện một lượt — danh sách dài hơn thì nhắc thu hẹp bằng ô tìm thay vì vẽ hàng trăm dòng. */
const MAX_ROWS = 50;

/** 3 hàng khung xương giữ chỗ lúc tải lần đầu — danh sách không nhảy khi dữ liệu về. */
const SKELETON_ROWS = [0, 1, 2] as const;

const TITLE: Record<DependencyDirection, string> = {
  predecessor: 'Chọn thẻ đang chặn thẻ này',
  successor: 'Chọn thẻ bị thẻ này chặn',
};

const HINT: Record<DependencyDirection, string> = {
  predecessor: 'Thẻ được chọn phải xong trước khi thẻ này bắt đầu.',
  successor: 'Thẻ được chọn chỉ bắt đầu sau khi thẻ này xong.',
};

export interface DependencyPickerSheetProps {
  boardId: string;
  /** Có giá trị = mở; giá trị chọn tiêu đề và hướng của phụ thuộc sắp tạo. */
  direction: DependencyDirection | null;
  error: string | null;
  /** Thẻ hiện tại + mọi thẻ đã nối — không cho chọn. */
  excludeIds: ReadonlySet<string>;
  saving: boolean;
  onClose: () => void;
  onPick: (task: DependencyTaskDto) => void;
}

const toDependencyTask = (card: TaskCardDto): DependencyTaskDto => ({
  assignees: card.assignees,
  columnKind: card.columnKind,
  dueDate: card.dueDate,
  id: card.id,
  startDate: null,
  title: card.title,
});

/**
 * Chọn MỘT thẻ cùng bảng để nối phụ thuộc (app.md §2 `DependencyPickerSheet`). Nguồn là `GET /boards/:id/tasks?q=`
 * (đã có ở Kanban — bảng khác không nối được nên không cần endpoint riêng). Ô tìm UNCONTROLLED (`SearchInput`, IME-safe)
 * debounce 300 ms; từ khoá 1 ký tự server từ chối (`q ≥ 2`) nên lọc cục bộ trên bản đầy đủ. Lỗi `TASK_005/017/018/021`
 * hiện NGAY trên đầu tấm và tấm ở yên để chọn thẻ khác.
 *
 * Hàng là `ListItem` trong `SheetList` (tấm tràn viền): tiêu đề thẻ ≤ 2 dòng, hạn ở dòng phụ, huy hiệu cột ở cột giá trị,
 * kẻ ngăn giữa các hàng; đang lưu thì khoá mọi hàng (không nối hai lần). Ba trạng thái tải / lỗi / rỗng dùng khung xương
 * và `EmptyState` của bộ chung thay cho câu "Đang tải…" trần.
 */
export function DependencyPickerSheet({
  boardId,
  direction,
  error,
  excludeIds,
  saving,
  onClose,
  onPick,
}: DependencyPickerSheetProps) {
  const [text, setText] = useState('');
  const visible = direction !== null;
  // Modal gỡ nội dung khi đóng nên ô tìm (uncontrolled) mở lại là RỖNG — xoá luôn chữ đã nhớ, kẻo danh sách vẫn
  // đang lọc theo từ khoá mà ô tìm không hiện gì. Chỉnh state ngay lúc vẽ khi `visible` đổi (mẫu của `MultiPickSheet`).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setText('');
  }
  const query = useDebouncedValue(text.trim());
  const tasks = useBoardTasks(boardId, { q: query }, visible);

  const rows = useMemo(() => {
    const cards = Object.values(tasks.data?.columns ?? {}).flat();
    return cards
      .filter((card) => !excludeIds.has(card.id) && (!query || matchesSearch(query, card.title)))
      .map(toDependencyTask);
  }, [excludeIds, query, tasks.data]);
  const shown = rows.slice(0, MAX_ROWS);

  let body: ReactNode;
  if (rows.length === 0 && tasks.isFetching) {
    body = (
      <View className="gap-md py-sm">
        {SKELETON_ROWS.map((key) => (
          <SkeletonParagraphWithIcon key={key} />
        ))}
      </View>
    );
  } else if (rows.length === 0 && tasks.isError) {
    body = (
      <EmptyState
        actions={[{ label: 'Thử lại', onPress: () => void tasks.refetch() }]}
        // `px-0`: nằm TRONG `SheetList` (đã lề 16) — giữ `px-md` riêng của `EmptyState` là thụt 32.
        className="px-0"
        description="Không tải được danh sách thẻ của bảng."
        icon="alert-warning"
        size="compact"
        tone="danger"
      />
    );
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        className="px-0"
        description={query ? 'Không có thẻ nào khớp từ khoá.' : 'Không có thẻ nào phù hợp.'}
        icon="search"
        size="compact"
        tone="neutral"
      />
    );
  } else {
    body = shown.map((task, index) => (
      <ListItem
        key={task.id}
        description={task.dueDate ? `Hạn ${formatDate(task.dueDate)}` : undefined}
        disabled={saving}
        divider={index < shown.length - 1}
        emphasis="title"
        label={task.title}
        labelNumberOfLines={2}
        value={
          <Badge
            label={COLUMN_KIND_LABEL[task.columnKind]}
            size="sm"
            variant={COLUMN_KIND_BADGE[task.columnKind]}
          />
        }
        onPress={() => onPick(task)}
      />
    ));
  }

  return (
    <BottomSheet
      alert={error ? <Alert description={error} tone="error" /> : undefined}
      description={direction ? HINT[direction] : undefined}
      padded={false}
      scrollable
      search={<SearchInput placeholder="Tìm thẻ theo tiêu đề" onChangeText={setText} />}
      title={direction ? TITLE[direction] : 'Chọn thẻ'}
      visible={visible}
      onClose={onClose}
    >
      {/* `SheetList` = lề 16 (tấm tràn viền không đệm, `ListItem` cũng không). `pb-md`: tấm không có `footer`. */}
      <SheetList accessibilityRole="list" className="pb-md">
        {body}
        {/* Đang có hàng (bản cũ giữ lại lúc gõ tìm) mà kết quả mới còn đang về ⇒ báo ở chân danh sách. */}
        {rows.length > 0 && tasks.isFetching ? <LoadingMore /> : null}
        {rows.length > MAX_ROWS ? (
          <Text className="pt-xs text-center text-caption-sm text-fg-2">
            {`Còn ${rows.length - MAX_ROWS} thẻ nữa — nhập từ khoá để thu hẹp.`}
          </Text>
        ) : null}
      </SheetList>
    </BottomSheet>
  );
}
