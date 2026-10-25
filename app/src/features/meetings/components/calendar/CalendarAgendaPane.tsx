import { View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { Skeleton } from '@/shared/ui/skeleton';

import type { MeetingListItemDto } from '../../api/meetings.types';
import { AgendaList, type AgendaGroup } from './AgendaList';

export interface CalendarAgendaPaneProps {
  groups: AgendaGroup[];
  /** Chỉ có nghĩa khi `state = 'empty'` — máy tính bảng nói "ngày này", điện thoại nói "khoảng này". */
  emptyForDay: boolean;
  refreshing: boolean;
  scrollToDayKey: string;
  state: 'empty' | 'error' | 'loading' | 'ready';
  /** Có ⇒ trạng thái rỗng hiện nút "Tạo cuộc họp" (ẩn khi ngoại tuyến). */
  onCreate?: () => void;
  onJoin: (item: MeetingListItemDto) => void;
  onPress: (item: MeetingListItemDto) => void;
  onRefresh: () => void;
}

/**
 * Phần danh sách của màn Lịch (app.md p2-04 §3): tải ⇒ 3 thẻ khung (giữ header/dải tuần), lỗi ⇒ thông báo + "Thử lại" ngay tại
 * chỗ, rỗng ⇒ `EmptyState` (+ "Tạo cuộc họp"), còn lại ⇒ agenda theo ngày. Dùng chung cho điện thoại và cột phải của máy tính bảng.
 */
export function CalendarAgendaPane({
  emptyForDay,
  groups,
  onCreate,
  onJoin,
  onPress,
  onRefresh,
  refreshing,
  scrollToDayKey,
  state,
}: CalendarAgendaPaneProps) {
  if (state === 'loading') {
    return (
      <View accessibilityLabel="Đang tải lịch họp" accessible className="gap-sm px-md py-xs">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-20 rounded-md" />
        ))}
      </View>
    );
  }
  if (state === 'error') {
    return (
      <EmptyState
        actions={[{ label: 'Thử lại', onPress: onRefresh }]}
        description="Không tải được lịch họp. Kiểm tra kết nối rồi thử lại."
        icon="alert-warning"
        size="compact"
        title="Không tải được lịch"
        tone="danger"
      />
    );
  }
  if (state === 'empty') {
    return (
      <EmptyState
        actions={onCreate ? [{ label: 'Tạo cuộc họp', onPress: onCreate }] : undefined}
        description={
          emptyForDay ? 'Ngày này chưa có cuộc họp nào.' : 'Không có cuộc họp nào trong khoảng này.'
        }
        icon="calendar"
        size="compact"
        title="Lịch trống"
        tone="info"
      />
    );
  }
  return (
    <AgendaList
      groups={groups}
      refreshing={refreshing}
      scrollToDayKey={scrollToDayKey}
      onJoin={onJoin}
      onPress={onPress}
      onRefresh={onRefresh}
    />
  );
}
