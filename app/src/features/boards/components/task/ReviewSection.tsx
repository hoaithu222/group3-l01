import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Button, LinkButton } from '@/shared/ui/button';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';

import type { TaskReviewDto, TaskReviewsDto } from '../../api/reviews.types';
import { useReassignReview, useTaskReviews, useWaiveReview } from '../../queries/reviews.queries';
import { getHttpStatus } from '../../utils/error-details';
import { reviewSettingsHref, reviewSubmitHref } from '../../utils/review-routes';
import { reviewErrorMessage } from '../../utils/review-text';
import { ReassignReviewerSheet } from '../review/ReassignReviewerSheet';
import { WaiveReviewDialog } from '../review/WaiveReviewDialog';
import { ReviewHistory } from './ReviewHistory';
import { ReviewRoundCard } from './ReviewRoundCard';

export interface ReviewSectionProps {
  /** Người làm thẻ — không được chọn làm người chấm thay. */
  assigneeIds: readonly string[];
  boardId: string;
  /** `TaskDetailDto.reviews` — cho khỏi tốn thêm một lượt gọi khi mở chi tiết. */
  initial?: TaskReviewsDto;
  /** Offline / lưu trữ / thẻ đã xoá: chỉ đọc, khoá mọi nút ghi (BE vẫn là nơi quyết). */
  readOnly: boolean;
  taskId: string;
  wsId: string;
}

/**
 * Khối "Chấm chéo" của chi tiết thẻ (p4-05 app.md §3 `ReviewSection`): lượt hiện tại ("Chờ duyệt 1/2", từng người chấm + trạng thái),
 * nút "Chấm thẻ này" cho người được giao, "Giao lại"/"Miễn chấm" cho OWNER/ADMIN, lịch sử các lượt cũ và lối vào "Cách chấm điểm"
 * (cấu hình + tiêu chí của bảng, chỉ đọc với MEMBER).
 *
 * ⛔ Quyền (`myPermissions.submit/reassign/waive`) và điểm/nhận xét đều do BE quyết theo người xem — component chỉ vẽ cái nhận được, KHÔNG
 * suy từ vai trò. Chỉ hiện khi bảng bật chấm chéo hoặc thẻ từng có lượt; 404 → ẩn. Tải: khung xương; lỗi: câu + "Thử lại".
 */
export function ReviewSection({ assigneeIds, boardId, initial, readOnly, taskId, wsId }: ReviewSectionProps) {
  const reviews = useTaskReviews(taskId, { initialData: initial });
  const reassign = useReassignReview(taskId);
  const waive = useWaiveReview(taskId, boardId);
  const [reassignTarget, setReassignTarget] = useState<TaskReviewDto | null>(null);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const data = reviews.data;

  if (!data && reviews.isPending) {
    return (
      <Section icon="view" title="Chấm chéo" tone="default">
        <View className="gap-xs">
          <Skeleton className="h-6 rounded-xs" />
          <Skeleton className="h-6 rounded-xs" />
        </View>
      </Section>
    );
  }
  if (!data) {
    if (getHttpStatus(reviews.error) === 404) return null;
    return (
      <Section icon="view" title="Chấm chéo" tone="default">
        <Alert
          actions={<Button label="Thử lại" size="sm" onPress={() => void reviews.refetch()} />}
          description="Không tải được thông tin chấm chéo của thẻ."
          tone="error"
        />
      </Section>
    );
  }
  if (!data.enabled && !data.currentRound && data.history.length === 0) return null;

  const round = data.currentRound;
  const open = round?.status === 'OPEN';
  const permissions = data.myPermissions;
  const canSubmit = permissions.submit && open && data.myReview?.status === 'PENDING';
  const excludeIds = [...assigneeIds, ...(round?.reviews.map((review) => review.reviewer.id) ?? [])];

  return (
    <Section
      action={<LinkButton label="Cách chấm điểm" onPress={() => router.push(reviewSettingsHref(wsId, boardId))} />}
      // `tone="default"` + icon: cùng khuôn tiêu đề với các khối khác của chi tiết thẻ (trước đây riêng khối này tông brand).
      icon="view"
      title="Chấm chéo"
      tone="default"
    >
      <View className="gap-sm">
        {round ? (
          <ReviewRoundCard canReassign={permissions.reassign && !readOnly} round={round} onReassign={setReassignTarget} />
        ) : (
          <Text className="text-body-md text-fg-2">Thẻ chưa vào cột Review — kéo thẻ vào cột Review để hệ thống giao cho bạn cùng nhóm chấm.</Text>
        )}

        {canSubmit ? (
          <Button
            disabled={readOnly}
            label="Chấm thẻ này"
            onPress={() => router.push(reviewSubmitHref(wsId, boardId, taskId))}
          />
        ) : null}
        {permissions.waive && open && !readOnly ? (
          <View className="flex-row">
            <LinkButton label="Miễn chấm thẻ này" tone="danger" onPress={() => setWaiveOpen(true)} />
          </View>
        ) : null}

        <ReviewHistory rounds={data.history} />
      </View>

      <ReassignReviewerSheet
        boardId={boardId}
        error={reassign.error ? reviewErrorMessage(reassign.error) : null}
        excludeIds={excludeIds}
        pending={reassign.isPending}
        review={reassignTarget}
        onClose={() => {
          setReassignTarget(null);
          reassign.reset();
        }}
        onConfirm={(payload) =>
          reassignTarget && reassign.mutate({ payload, reviewId: reassignTarget.id }, { onSuccess: () => setReassignTarget(null) })
        }
      />
      <WaiveReviewDialog
        error={waive.error ? reviewErrorMessage(waive.error) : null}
        pending={waive.isPending}
        visible={waiveOpen}
        onClose={() => {
          setWaiveOpen(false);
          waive.reset();
        }}
        onConfirm={(reason) => waive.mutate(reason, { onSuccess: () => setWaiveOpen(false) })}
      />
    </Section>
  );
}
