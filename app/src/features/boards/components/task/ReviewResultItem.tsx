import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { LinkButton } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';

import type { RubricCriterion, TaskReviewDto } from '../../api/reviews.types';
import { formatCriterionScore, formatScore } from '../../utils/review-score';
import { CANCEL_REASON_TEXT, reviewStatusText, reviewStatusVisual } from '../../utils/review-status-text';

export interface ReviewResultItemProps {
  /** Hiện nút "Giao lại" (OWNER/ADMIN, review còn chờ, lượt đang mở). */
  canReassign?: boolean;
  rubric: readonly RubricCriterion[];
  review: TaskReviewDto;
  onReassign?: (review: TaskReviewDto) => void;
}

/**
 * Kết quả của MỘT người chấm (p4-05 app.md §2 `ReviewResultItem`): avatar + tên + trạng thái (Duyệt/Yêu cầu sửa/Chưa chấm/Đã chấm…),
 * và — CHỈ khi BE trả (`review-visibility`) — điểm "8,0/10", điểm từng tiêu chí và nhận xét.
 *
 * ⛔ Component KHÔNG tự suy quyền xem: có `score10` mới vẽ điểm, có `feedback` mới vẽ nhận xét. MEMBER khác và người chấm chưa nộp nhận
 * review không có ba trường đó (và trạng thái người khác bị che thành "Đã chấm") nên đây chỉ hiện "Nguyễn Văn A — Đã chấm".
 *
 * ✅ Chốt thêm một lớp: kết quả CHỈ vẽ khi trạng thái là quyết định thật (Duyệt / Yêu cầu sửa) — đúng điều kiện `showResult` của BE
 * (`review-visibility.ts`). Review bị che (`SUBMITTED`) hay còn chờ mà lỡ mang điểm (bản cache cũ, BE đổi lọc) cũng KHÔNG lộ điểm.
 */
export function ReviewResultItem({ canReassign = false, review, rubric, onReassign }: ReviewResultItemProps) {
  const inactive = review.status === 'CANCELLED' || review.status === 'REASSIGNED';
  const decided = review.status === 'APPROVED' || review.status === 'REQUEST_CHANGES';
  const scores = decided ? (review.rubricScores ?? []) : [];
  const score10 = decided ? review.score10 : undefined;
  const feedback = decided ? review.feedback : undefined;
  const visual = reviewStatusVisual(review.status);
  const cancelText = inactive && review.cancelReason ? CANCEL_REASON_TEXT[review.cancelReason] : null;

  return (
    <View className="gap-xs">
      <View className="flex-row items-center gap-sm">
        <Avatar name={review.reviewer.name} size="sm" source={review.reviewer.avatarUrl ? { uri: review.reviewer.avatarUrl } : undefined} />
        <View className="flex-1">
          <Text className="text-label-lg font-medium text-fg-1" numberOfLines={1}>
            {review.reviewer.name || 'Thành viên đã rời'}
          </Text>
          <View className="flex-row items-center gap-3xs">
            <Icon color={visual.color} name={visual.icon} size="sm" />
            <Text className="text-body-md text-fg-2">{reviewStatusText(review)}</Text>
          </View>
        </View>
        {typeof score10 === 'number' ? (
          <Text accessibilityLabel={`Điểm ${formatScore(score10)} trên 10`} className="text-label-lg font-semibold text-fg-1">
            {`${formatScore(score10)}/10`}
          </Text>
        ) : null}
        {canReassign && review.status === 'PENDING' && onReassign ? (
          <LinkButton label="Giao lại" size="sm" onPress={() => onReassign(review)} />
        ) : null}
      </View>

      {cancelText ? <Text className="text-caption-lg text-fg-2">{cancelText}</Text> : null}

      {scores.length > 0 ? (
        <View className="gap-3xs pl-xl">
          {scores.map((score) => {
            const criterion = rubric.find((item) => item.id === score.criterionId);
            return (
              <Text key={score.criterionId} className="text-body-md text-fg-1">
                {`${criterion?.label ?? 'Tiêu chí'}: ${formatCriterionScore(score.score)}${criterion ? `/${criterion.maxScore}` : ''}`}
              </Text>
            );
          })}
        </View>
      ) : null}

      {feedback ? <Text className="pl-xl text-body-md text-fg-1">{feedback}</Text> : null}
    </View>
  );
}
