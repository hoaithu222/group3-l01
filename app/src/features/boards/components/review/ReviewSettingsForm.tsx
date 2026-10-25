import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Section } from '@/shared/ui/section';
import { Stepper } from '@/shared/ui/stepper';
import { Toggle } from '@/shared/ui/toggle';

import type { ReviewConfigDto } from '../../api/reviews.types';
import type { useReviewSettingsForm } from '../../hooks/useReviewSettingsForm';
import type { ReviewLimits } from '../../schemas/review.schemas';
import { RubricBuilder } from './RubricBuilder';

export interface ReviewSettingsFormProps {
  config: ReviewConfigDto;
  form: ReturnType<typeof useReviewSettingsForm>;
  limits: ReviewLimits;
}

/**
 * Form cấu hình chấm chéo của bảng (p4-05 app.md §3 `ReviewSettings`, OWNER/ADMIN): công tắc Bật · số lượt duyệt cần (1–5) kèm "Nhóm có N
 * người chấm được" · `RubricBuilder` · cảnh báo "chỉ áp cho lượt chấm mới" · Lưu. `RES_003` → banner "Cấu hình đã thay đổi" GIỮ chữ đang
 * sửa; `REVIEW_004` phần tiêu chí hiện NGAY dưới danh sách tiêu chí, phần còn lại và lỗi kiểm client hiện trong `Alert` trên nút Lưu.
 */
export function ReviewSettingsForm({ config, form, limits }: ReviewSettingsFormProps) {
  const turningOff = config.enabled && !form.enabled;
  const turningOn = !config.enabled && form.enabled;
  const shortHanded = form.enabled && form.requiredReviews > config.eligibleReviewerCount;

  return (
    <View className="gap-xl py-xs">
      {form.conflict ? (
        <Alert
          description="Cấu hình chấm chéo vừa được người khác thay đổi. Đã tải lại phiên bản mới — kiểm tra lại các thay đổi của bạn rồi bấm Lưu."
          title="Cấu hình đã thay đổi"
          tone="warning"
        />
      ) : null}

      <Section icon="view" title="Chấm chéo">
        <Card>
          <View className="gap-md">
            <Toggle
              description="Thẻ vào cột Review sẽ được tự giao cho bạn cùng nhóm chấm; thẻ chưa đủ lượt duyệt không sang Hoàn thành được."
              label="Bật chấm chéo cho bảng này"
              value={form.enabled}
              onChange={form.setEnabled}
            />
            {turningOff && config.openRoundCount > 0 ? (
              <Alert description={`Tắt chấm chéo sẽ huỷ ${config.openRoundCount} lượt đang chờ chấm; các thẻ đó sang Hoàn thành được ngay.`} tone="warning" />
            ) : null}
            {turningOn ? (
              <Alert description="Thẻ đang ở cột Review sẽ được giao cho người chấm ngay sau khi lưu." tone="info" />
            ) : null}
          </View>
        </Card>
      </Section>

      <Section icon="tick-double-01" title="Số lượt duyệt cần">
        <Card>
          <View className="gap-sm">
            <Stepper
              accessibilityLabel="Số lượt duyệt cần"
              disabled={!form.enabled}
              max={limits.requiredMax}
              min={1}
              value={form.requiredReviews}
              onChange={form.setRequiredReviews}
            />
            <Text className="text-body-md text-fg-2">{`Nhóm có ${config.eligibleReviewerCount} người chấm được (không tính người làm thẻ và khách).`}</Text>
            {shortHanded ? (
              <Alert description={`Nhóm chỉ có ${config.eligibleReviewerCount} người chấm được nên mỗi thẻ sẽ chỉ cần tối đa ${config.eligibleReviewerCount} lượt duyệt. Không có ai chấm được thì thẻ được tự duyệt.`} tone="warning" />
            ) : null}
          </View>
        </Card>
      </Section>

      <Section icon="star" title="Tiêu chí đánh giá">
        <RubricBuilder drafts={form.drafts} limits={limits} onChange={form.setDrafts} />
        {form.rubricError ? <Alert description={form.rubricError} tone="error" /> : null}
      </Section>

      <View className="gap-sm">
        <Alert description="Thay đổi chỉ áp dụng cho lượt chấm MỚI. Thẻ đang chờ chấm giữ nguyên tiêu chí và số lượt duyệt đã chụp lúc mở lượt." tone="info" />
        {form.clientError ? <Alert description={form.clientError} tone="error" /> : null}
        {form.serverError ? <Alert description={form.serverError} tone="error" /> : null}
        <Button disabled={!form.dirty} label="Lưu cấu hình" loading={form.isSaving} onPress={form.onSave} />
      </View>
    </View>
  );
}
