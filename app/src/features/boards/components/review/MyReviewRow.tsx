import { View } from 'react-native';

import { Icon, type IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { formatRelative } from '@/shared/utils/format/date.utils';

import type { MyReviewItemDto } from '../../api/reviews.types';

export interface MyReviewRowProps {
  item: MyReviewItemDto;
  onPress: (item: MyReviewItemDto) => void;
}

/** Ô icon theo trạng thái lượt chấm của MÌNH — trang trí, chữ ở cột phải (`valueOf`) mới là nghĩa. */
const STATUS_ART: Record<MyReviewItemDto['status'], { icon: IconName; tone: IconTileTone }> = {
  APPROVED: { icon: 'checkmark-circle', tone: 'success' },
  PENDING: { icon: 'view', tone: 'warning' },
  REQUEST_CHANGES: { icon: 'edit', tone: 'info' },
};

/** "Chờ duyệt 1/2" khi còn chờ; quyết định của mình khi đã nộp. */
function valueOf(item: MyReviewItemDto): string {
  if (item.status === 'APPROVED') return 'Bạn đã duyệt';
  if (item.status === 'REQUEST_CHANGES') return 'Bạn yêu cầu sửa';
  return `Lượt ${item.round.round} · ${item.round.approvedCount}/${item.round.requiredReviews}`;
}

/**
 * Một hàng "Cần chấm / Đã chấm của tôi" (p4-05 app.md §3 `MyReviews`): tiêu đề thẻ, "nhóm · bảng", "được giao 2 giờ trước" (hoặc "đã chấm …")
 * và tiến độ lượt "1/2". Cả hàng là vùng chạm (≥ 44dp): cần chấm → màn chấm, đã chấm → chi tiết thẻ. Dùng `ListItem` chung — nhãn cho
 * xuống dòng (không `numberOfLines`) vì tiêu đề thẻ là thứ người chấm cần đọc đủ.
 */
export function MyReviewRow({ item, onPress }: MyReviewRowProps) {
  const pending = item.status === 'PENDING';
  const when = pending ? `được giao ${formatRelative(item.assignedAt)}` : `đã chấm ${formatRelative(item.submittedAt)}`;

  return (
    <View>
      <ListItem
        // ⚠️ `px-md`: màn `padded={false}` và `ListItem` không tự có lề ngang — thiếu lớp này chữ/ô icon dính sát mép màn.
        // Đặt ở CHÍNH hàng (không ở `contentContainerStyle`) để vạch kẻ `divider` vẫn chạy hết bề ngang.
        className="px-md"
        description={`${item.task.workspaceName} · ${item.task.boardName}`}
        divider
        // Hàng ĐIỀU HƯỚNG: tiêu đề thẻ là chữ chính, "nhóm · bảng" là chữ phụ (xem `ListItem` `emphasis`).
        emphasis="title"
        label={item.task.title}
        leading={<IconTile name={STATUS_ART[item.status].icon} size="sm" tone={STATUS_ART[item.status].tone} />}
        trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
        value={valueOf(item)}
        valueDescription={when}
        onPress={() => onPress(item)}
      />
    </View>
  );
}
