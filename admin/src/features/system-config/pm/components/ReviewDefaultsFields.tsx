import { memo } from 'react';
import { useFormContext } from 'react-hook-form';

import { Button, FieldArray, NumberField, Text, ToggleField } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import {
  REVIEW_REMINDER_HOURS_MAX,
  REVIEW_REMINDER_HOURS_MIN,
  REVIEW_REMINDERS_MAX,
  REVIEW_REQUIRED_MIN,
} from '../constants/pm.constants';
import type { ReviewDefaultsFormValues } from '../schemas/review-defaults.schema';

/** Mốc nhắc mới = mốc cuối + 24 giờ (kẹp trần) — gần như luôn thoả điều kiện "tăng dần" ngay khi thêm. */
const NEXT_REMINDER_STEP_HOURS = 24;

export interface ReviewDefaultsFieldsProps {
  /** Có `system-config:update` — thiếu thì chỉ đọc: không thêm/bớt mốc nhắc. */
  canEdit: boolean;
  /** Trần số lượt duyệt hiện hành (`fields[].ceil` của `requiredReviews`). */
  requiredMax: number;
}

/**
 * Các ô của thẻ "Chấm chéo — mặc định cho bảng mới" (p4-05 admin.md §2.1): bật cho bảng mới, số lượt duyệt, 1–3 mốc
 * nhắc người chấm (thêm/bớt bằng `FieldArray`). Phải nằm trong `<Form>` (chỉ đọc thì các ô hiện dạng chữ). Lỗi cấp
 * mảng (số mốc, "tăng dần") hiện ngay dưới danh sách; lỗi từng ô do field kit2 tự hiện.
 */
const ReviewDefaultsFields = memo(function ReviewDefaultsFields({
  canEdit,
  requiredMax,
}: ReviewDefaultsFieldsProps) {
  const { formState, getValues } = useFormContext<ReviewDefaultsFormValues>();
  const listError = formState.errors.reminders?.root?.message ?? formState.errors.reminders?.message;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ToggleField
          description="Bảng tạo sau khi lưu sẽ bật sẵn chấm chéo; chủ nhóm vẫn tự bật/tắt được từng bảng."
          label="Bật chấm chéo cho bảng mới"
          name="enabledForNewBoards"
        />
        <NumberField
          description={`Số bạn cùng nhóm phải duyệt mỗi thẻ ở cột Review (${REVIEW_REQUIRED_MIN}–${requiredMax}). Nhóm ít người hơn thì tự giảm theo số người chấm được.`}
          label="Số lượt duyệt mặc định"
          max={requiredMax}
          min={REVIEW_REQUIRED_MIN}
          name="requiredReviews"
        />
      </div>

      <FieldArray<ReviewDefaultsFormValues, 'reminders'> name="reminders">
        {({ fields, append, remove }) => (
          <div className="flex flex-col gap-3">
            <Text size="small" weight="medium">
              Nhắc người chấm (số giờ kể từ lúc được giao chấm)
            </Text>
            {fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-1 items-start gap-3 md:grid-cols-[14rem_auto]">
                <NumberField
                  label={`Nhắc lần ${index + 1} (giờ)`}
                  max={REVIEW_REMINDER_HOURS_MAX}
                  min={REVIEW_REMINDER_HOURS_MIN}
                  name={`reminders.${index}.hours`}
                />
                {canEdit && (
                  <div className="flex items-center md:pt-6">
                    <Button
                      aria-label={`Xoá mốc nhắc ${index + 1}`}
                      disabled={fields.length <= 1}
                      size="sm"
                      skin="danger"
                      startIcon={<SystemIcon name="trash-outline" size={14} />}
                      variant="ghost"
                      onClick={() => remove(index)}
                    />
                  </div>
                )}
              </div>
            ))}

            {listError && (
              <Text role="alert" size="small" skin="error">
                {listError}
              </Text>
            )}

            {canEdit && (
              <Button
                className="self-start"
                disabled={fields.length >= REVIEW_REMINDERS_MAX}
                size="sm"
                startIcon={<SystemIcon name="plus-outline" size={14} />}
                variant="stroke"
                onClick={() => {
                  const last = getValues('reminders').at(-1)?.hours;
                  const next = Number.isFinite(last)
                    ? Math.min(REVIEW_REMINDER_HOURS_MAX, (last as number) + NEXT_REMINDER_STEP_HOURS)
                    : NEXT_REMINDER_STEP_HOURS;
                  append({ hours: next });
                }}
              >
                Thêm mốc nhắc
              </Button>
            )}
            <Text size="tiny" skin="muted">
              {`Tối đa ${REVIEW_REMINDERS_MAX} mốc, mỗi mốc ${REVIEW_REMINDER_HOURS_MIN}–${REVIEW_REMINDER_HOURS_MAX} giờ và tăng dần. Chỉ nhắc khi người chấm chưa nộp và lượt chấm còn mở.`}
            </Text>
          </div>
        )}
      </FieldArray>
    </div>
  );
});

export default ReviewDefaultsFields;
