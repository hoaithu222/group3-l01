import { useEffect, useState } from 'react';
import { Controller } from 'react-hook-form';
import { Text, View } from 'react-native';

import { useZodForm } from '@/shared/form/useZodForm';
import { Alert } from '@/shared/ui/alert';
import { BottomSheet, SheetActions } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { FormInput } from '@/shared/ui/input';
import { hapticSelection, hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type { ReviewView } from '../api/o2o.types';
import { NOISE_OPTION_LABEL, O2O_LIMITS } from '../constants/o2o.constants';
import { useDeleteMyReview, useSaveMyReview } from '../queries/locations.mutations';
import { reviewFormSchema, type ReviewFormValues } from '../schemas/review.schema';
import { o2oErrorMessage } from '../utils/o2o-errors';
import { StarPicker } from './StarPicker';

export interface ReviewSheetProps {
  locationId: string;
  /** Đánh giá của tôi (có ⇒ đang SỬA, hiện thêm "Xoá đánh giá"). */
  mine: ReviewView | null;
  visible: boolean;
  onClose: () => void;
}

const NOISE_LEVELS = [1, 2, 3, 4, 5];
const EMPTY: ReviewFormValues = { rating: 0, noise: 0, comment: '' };

/**
 * Tờ viết/sửa đánh giá (app.md §3 `ReviewForm`): sao (1–5), độ ồn (1 rất yên tĩnh … 5 ồn), bình luận ≤ 500. Một người một đánh giá mỗi địa điểm
 * (gửi lại là GHI ĐÈ). Lỗi từ server hiện NGAY TRONG tờ (`Alert`), không toast — toast tự tắt sau 4 giây mà người dùng đang cần sửa lại.
 * Mở lại tờ thì form nạp lại từ đánh giá đang có (`reset` khi `visible` bật) — không giữ lại chữ nhập dở của lần đóng trước.
 */
export function ReviewSheet({ locationId, mine, visible, onClose }: ReviewSheetProps) {
  const form = useZodForm(reviewFormSchema, { defaultValues: EMPTY });
  const save = useSaveMyReview(locationId);
  const remove = useDeleteMyReview(locationId);
  const busy = save.isPending || remove.isPending;
  /**
   * Bước XÁC NHẬN xoá ngay trong chân tấm (không hoàn tác được). ⛔ Không mở `Dialog` chồng lên: tấm này đã là một `<Modal>` — iOS không
   * trình bày được modal thứ hai đứng NGANG HÀNG, và hai lớp phủ chồng nhau che mất nội dung người dùng đang cân nhắc xoá.
   */
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const close = () => {
    setConfirmingDelete(false);
    onClose();
  };
  const { reset } = form;
  const { reset: resetSave } = save;
  const { reset: resetRemove } = remove;
  // Lỗi server lấy thẳng từ trạng thái của mutation (không chép sang state riêng): mutation tự xoá lỗi cũ khi gọi lại.
  const serverError = save.error ?? remove.error;

  useEffect(() => {
    if (!visible) return;
    resetSave();
    resetRemove();
    reset(mine ? { rating: mine.rating, noise: mine.noise, comment: mine.comment ?? '' } : EMPTY);
  }, [visible, mine, reset, resetSave, resetRemove]);

  const submit = form.handleSubmit((values) => {
    save.mutate(
      { rating: values.rating, noise: values.noise, comment: values.comment || undefined },
      {
        onSuccess: () => {
          hapticSuccess();
          showToast('success', 'Đã lưu đánh giá.');
          close();
        },
      },
    );
  });

  const deleteReview = () => {
    remove.mutate(undefined, {
      onSuccess: () => {
        hapticSuccess();
        showToast('success', 'Đã xoá đánh giá.');
        close();
      },
    });
  };

  return (
    <BottomSheet
      // Lỗi server đứng yên dưới tiêu đề — ở cuối thân cuộn thì nằm khuất dưới ô bình luận, bấm gửi xong tưởng không có gì xảy ra.
      alert={
        serverError ? <Alert description={o2oErrorMessage(serverError)} tone="error" /> : undefined
      }
      footer={
        confirmingDelete ? (
          // ✅ `SheetActions` [Giữ đánh giá | Xác nhận xoá] + dòng nhắc ngay trên hàng nút — thay khối `Alert` cam + hai nút xếp chồng
          // (chân tấm cao vọt lên, đẩy thân tấm co lại đúng lúc người dùng đang cân nhắc).
          <SheetActions
            hint="Đánh giá của bạn sẽ bị xoá khỏi địa điểm này. Thao tác này không hoàn tác được."
            primary={{ label: 'Xác nhận xoá', loading: remove.isPending, onPress: deleteReview }}
            secondary={{
              disabled: remove.isPending,
              label: 'Giữ đánh giá',
              onPress: () => setConfirmingDelete(false),
            }}
            tone="danger"
          />
        ) : (
          <View className="gap-xs">
            <Button
              disabled={busy}
              fullWidth
              label="Gửi đánh giá"
              loading={save.isPending}
              onPress={submit}
            />
            {mine ? (
              <Button
                disabled={busy}
                fullWidth
                iconLeft="delete"
                label="Xoá đánh giá"
                variant="tertiary"
                onPress={() => setConfirmingDelete(true)}
              />
            ) : null}
          </View>
        )
      }
      scrollable
      title={mine ? 'Sửa đánh giá' : 'Viết đánh giá'}
      visible={visible}
      onClose={close}
    >
      {/* ⚠️ Không `pb-md`: tấm có `footer` — đệm đáy thừa thành dải trống giữa ô bình luận và hàng nút. */}
      <View className="gap-md py-xs">
        <Controller
          control={form.control}
          name="rating"
          render={({ field, fieldState }) => (
            <StarPicker
              error={fieldState.error?.message}
              label="Số sao"
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={form.control}
          name="noise"
          render={({ field, fieldState }) => (
            <View className="gap-2xs">
              <Text className="text-label-md font-semibold text-fg-1">Độ ồn</Text>
              <View
                accessibilityLabel="Độ ồn"
                accessibilityRole="radiogroup"
                className="flex-row flex-wrap gap-xs"
              >
                {NOISE_LEVELS.map((level) => (
                  <Chip
                    key={level}
                    label={NOISE_OPTION_LABEL[level] ?? String(level)}
                    role="radio"
                    selected={field.value === level}
                    size="sm"
                    onPress={() => {
                      if (field.value !== level) hapticSelection();
                      field.onChange(level);
                    }}
                  />
                ))}
              </View>
              {fieldState.error ? (
                <Text className="text-caption-lg text-error">{fieldState.error.message}</Text>
              ) : null}
            </View>
          )}
        />
        <FormInput
          control={form.control}
          hint={`Tối đa ${O2O_LIMITS.reviewCommentMax} ký tự`}
          label="Bình luận (không bắt buộc)"
          maxLength={O2O_LIMITS.reviewCommentMax}
          multiline
          name="comment"
          placeholder="Chia sẻ điều bạn thấy: wifi, chỗ ngồi, ổ cắm…"
        />
      </View>
    </BottomSheet>
  );
}
