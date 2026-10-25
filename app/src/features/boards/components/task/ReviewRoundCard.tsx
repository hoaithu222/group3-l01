import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Divider } from '@/shared/ui/divider';
import { Icon } from '@/shared/ui/icon';
import { formatRelative } from '@/shared/utils/format/date.utils';

import type { ReviewRoundDto, TaskReviewDto } from '../../api/reviews.types';
import { CLOSE_REASON_TEXT, roundIcon, roundStatusText, roundTitle } from '../../utils/review-status-text';
import { ReviewResultItem } from './ReviewResultItem';

export interface ReviewRoundCardProps {
  /** OWNER/ADMIN: hiện "Giao lại" cạnh review còn chờ của lượt ĐANG MỞ. */
  canReassign?: boolean;
  round: ReviewRoundDto;
  onReassign?: (review: TaskReviewDto) => void;
}

/**
 * Một lượt chấm (p4-05 app.md §2 `ReviewRoundCard`): "Lượt 2 · Chờ duyệt 1/2" + icon (chữ + icon, không chỉ màu), lý do đóng, ghi chú
 * "tự duyệt do nhóm không đủ người chấm" / "miễn chấm bởi … vì …" / "nhóm thiếu người" và danh sách kết quả từng người chấm.
 *
 * Lượt tự duyệt/miễn chấm KHÔNG có điểm (thành phần review của người làm tính N/A ở p4-06) — thẻ nói rõ điều đó thay vì để trống khó hiểu.
 */
export function ReviewRoundCard({ canReassign = false, round, onReassign }: ReviewRoundCardProps) {
  const open = round.status === 'OPEN';
  const closeText = !open && round.closeReason ? CLOSE_REASON_TEXT[round.closeReason] : null;

  return (
    <Card>
      <View className="gap-sm">
        <View className="flex-row items-center gap-xs">
          <Icon color={round.status === 'CHANGES_REQUESTED' ? 'error' : open ? 'warning' : 'success'} name={roundIcon(round.status)} />
          <View className="flex-1">
            <Text accessibilityRole="header" className="text-label-lg font-semibold text-fg-1">
              {`${roundTitle(round)} · ${roundStatusText(round)}`}
            </Text>
            <Text className="text-caption-lg text-fg-2">
              {closeText ? `${closeText} · ` : ''}
              {`mở ${formatRelative(round.openedAt)}`}
            </Text>
          </View>
        </View>

        {round.shortage && !round.autoApproved ? (
          <Text className="text-body-md text-fg-2">{`Nhóm có ít người chấm được hơn cài đặt: lượt này cần ${round.requiredReviews} thay vì ${round.configuredReviews} lượt duyệt.`}</Text>
        ) : null}
        {round.autoApproved ? (
          <Text className="text-body-md text-fg-2">Nhóm không còn ai chấm được nên thẻ được tự duyệt — lượt này không có điểm.</Text>
        ) : null}
        {round.waived ? (
          <Text className="text-body-md text-fg-2">
            {`${round.waived.by?.name || 'Quản trị viên'} đã miễn chấm: ${round.waived.reason}`}
          </Text>
        ) : null}

        {round.reviews.length > 0 ? (
          <View className="gap-sm">
            <Divider />
            {round.reviews.map((review) => (
              <ReviewResultItem
                key={review.id}
                canReassign={canReassign && open}
                review={review}
                rubric={round.rubric}
                onReassign={onReassign}
              />
            ))}
          </View>
        ) : null}
      </View>
    </Card>
  );
}
