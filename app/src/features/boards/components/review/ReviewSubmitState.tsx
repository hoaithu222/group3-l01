import { View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import type { IconName } from '@/shared/ui/icon';
import type { IconTileTone } from '@/shared/ui/icon-tile';
import { Skeleton } from '@/shared/ui/skeleton';

import type { ReviewSubmitState as State } from '../../hooks/useReviewSubmitForm';

export interface ReviewSubmitStateProps {
  /** Mở lại chi tiết thẻ (đóng màn chấm). */
  onBack: () => void;
  onRetry: () => void;
  state: Exclude<State, 'ready'>;
}

const COPY: Record<Exclude<State, 'loading' | 'ready'>, { description: string; title: string }> = {
  closed: {
    description: 'Thẻ đã đủ lượt duyệt, đã rời cột Review hoặc bạn không còn được giao chấm. Kết quả bạn đã nhập ở đây không được gửi.',
    title: 'Lượt chấm đã đóng',
  },
  error: { description: 'Kiểm tra kết nối rồi thử lại.', title: 'Không tải được lượt chấm' },
  noReview: {
    description: 'Chỉ người được giao mới chấm được. Thẻ có thể đã được giao lại cho bạn cùng nhóm.',
    title: 'Bạn không được giao chấm thẻ này',
  },
  notFound: { description: 'Thẻ đã bị xoá hoặc bạn không còn quyền xem.', title: 'Thẻ không còn khả dụng' },
  submitted: { description: 'Kết quả chấm không sửa được sau khi gửi. Xem lại ở khối Chấm chéo của thẻ.', title: 'Bạn đã chấm thẻ này' },
};

/**
 * Hình minh hoạ theo trạng thái: lỗi tải = cảnh báo đỏ; lượt đóng / không được giao / thẻ không còn = khoá vàng (mất quyền,
 * thử lại vô ích); "đã chấm rồi" là tin tốt nên dấu tích xanh.
 */
const ART: Record<Exclude<State, 'loading' | 'ready'>, { icon: IconName; tone: IconTileTone }> = {
  closed: { icon: 'lock', tone: 'warning' },
  error: { icon: 'alert-warning', tone: 'danger' },
  noReview: { icon: 'lock', tone: 'warning' },
  notFound: { icon: 'lock', tone: 'warning' },
  submitted: { icon: 'checkmark-circle', tone: 'success' },
};

/**
 * Trạng thái không có form của màn chấm (p4-05 app.md §3 `ReviewSubmit`): tải (khung xương) · lỗi + "Thử lại" · 404 "Thẻ không còn
 * khả dụng" · `REVIEW_001`/lượt đóng "Lượt chấm đã đóng" + nút về chi tiết · không được giao · đã chấm rồi. Câu chữ nói rõ VÌ SAO, không
 * chỉ "Đã có lỗi".
 */
export function ReviewSubmitState({ onBack, onRetry, state }: ReviewSubmitStateProps) {
  if (state === 'loading') {
    return (
      <View className="gap-md pt-xs">
        <Skeleton className="h-20 rounded-md" />
        <Skeleton className="h-32 rounded-md" />
        <Skeleton className="h-40 rounded-md" />
      </View>
    );
  }

  const copy = COPY[state];
  const art = ART[state];
  return (
    <EmptyState
      actions={state === 'error' ? [{ label: 'Thử lại', onPress: onRetry }] : [{ label: state === 'notFound' ? 'Quay lại' : 'Về chi tiết thẻ', onPress: onBack }]}
      description={copy.description}
      icon={art.icon}
      title={copy.title}
      tone={art.tone}
    />
  );
}
