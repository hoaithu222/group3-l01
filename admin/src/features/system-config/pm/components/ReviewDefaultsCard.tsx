import { memo, useMemo } from 'react';
import { useWatch } from 'react-hook-form';

import { Callout, Form, Text, useZodForm } from '@/shared/ui';

import JsonConfigCard from '../../components/JsonConfigCard';
import { useJsonConfigField } from '../../hooks/useJsonConfigField';
import type { SystemConfigItem } from '../../types/system-config.types';
import {
  buildReviewDefaultsSchema,
  type ReviewDefaultsFormValues,
} from '../schemas/review-defaults.schema';
import {
  mergeReviewForm,
  requiredMaxOf,
  reviewPatch,
  summarizeReview,
  toReviewForm,
  type WatchedReview,
} from '../utils/review-defaults';
import ReviewDefaultsFields from './ReviewDefaultsFields';

export interface ReviewDefaultsCardProps {
  /** Khoá `pm.review` của registry (`enabledForNewBoards`, `requiredReviews`, `reminderHours`). */
  item: SystemConfigItem;
  /** Có `system-config:update`. */
  canEdit: boolean;
  /** Tải lại danh sách và trả bản mới của khoá này. */
  onReload: (key: string) => Promise<SystemConfigItem | undefined>;
}

/**
 * Thẻ "Chấm chéo — mặc định cho bảng mới" (`pm.review`, p4-05 admin.md §2.1). Lưu = kiểm Zod (số lượt duyệt 1–trần,
 * 1–3 mốc nhắc tăng dần) → hộp thoại lý do kèm so sánh trước/sau → `PUT /admin/system-config/pm.review` với
 * `expectedVersion`; 409 → banner tải lại (xem `useJsonConfigField`).
 *
 * CHỈ là mặc định cho bảng tạo SAU khi lưu: bảng đang có giữ cấu hình chủ nhóm đã đặt. Admin không thấy tên người chấm,
 * điểm hay nhận xét ở đâu cả — chỉ có số đếm ở tab "Dự án" của nhóm.
 */
const ReviewDefaultsCard = memo(function ReviewDefaultsCard({
  item,
  canEdit,
  onReload,
}: ReviewDefaultsCardProps) {
  const requiredMax = useMemo(() => requiredMaxOf(item), [item]);
  const schema = useMemo(() => buildReviewDefaultsSchema(requiredMax), [requiredMax]);
  // `values` + keepDirtyValues: form THEO server khi chưa sửa; ô đang gõ dở được giữ nguyên.
  const serverValues = useMemo(() => toReviewForm(item), [item]);
  const form = useZodForm<ReviewDefaultsFormValues>(schema, {
    defaultValues: serverValues,
    values: serverValues,
    resetOptions: { keepDirtyValues: true },
  });
  const watched = useWatch({ control: form.control }) as WatchedReview | undefined;
  const after = mergeReviewForm(serverValues, watched);

  const g = useJsonConfigField({
    item,
    isDirty: form.formState.isDirty,
    onReload,
    onAdopt: (fresh) => form.reset(toReviewForm(fresh)),
  });

  return (
    <JsonConfigCard
      canEdit={canEdit}
      description="Cấu hình chấm chéo dùng khi nhóm tạo bảng mới — bảng đã có không đổi."
      g={g}
      isDirty={form.formState.isDirty}
      item={item}
      saveImpact={
        <div className="flex flex-col gap-1">
          <Text size="small" skin="muted">
            Trước: {summarizeReview(serverValues)}
          </Text>
          <Text size="small">Sau: {summarizeReview(after)}</Text>
        </div>
      }
      title="Chấm chéo — mặc định cho bảng mới"
      onSaveClick={form.handleSubmit((values) => g.requestSave(reviewPatch(values)))}
    >
      <Form form={form} readOnly={!canEdit} onSubmit={() => undefined}>
        <ReviewDefaultsFields canEdit={canEdit} requiredMax={requiredMax} />
      </Form>
      <Callout
        description="Chỉ áp cho bảng tạo sau khi lưu. Bảng đang có giữ cấu hình riêng do chủ nhóm đặt (tự bật/tắt, số lượt duyệt, tiêu chí đánh giá)."
        intent="info"
        variant="ghost"
      />
    </JsonConfigCard>
  );
});

export default ReviewDefaultsCard;
