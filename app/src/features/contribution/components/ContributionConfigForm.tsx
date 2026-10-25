import { useEffect, useImperativeHandle, type Ref } from 'react';
import { Text, View } from 'react-native';
import type { Control } from 'react-hook-form';

import { Alert } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { FormInput } from '@/shared/ui/input';
import { Section } from '@/shared/ui/section';

import type { ContributionConfig } from '../api/contribution.types';
import { useContributionConfigForm } from '../hooks/useContributionConfigForm';
import {
  GRACE_HOURS_MAX,
  UNESTIMATED_MAX,
  WEIGHT_TOTAL,
  type ContributionConfigInput,
} from '../schemas/contribution-config.schema';

/** Tay nắm cho nút "Lưu" ở `footer` của tấm — nút nằm NGOÀI form nên phải gọi vào `handleSubmit` qua đây. */
export interface ContributionConfigFormHandle {
  submit: () => void;
}

export interface ContributionConfigFormProps {
  boardId: string;
  /** Công thức hiện hành — giá trị ban đầu của form (chỉ đọc lúc mount: `RES_003` + "Tải lại" KHÔNG xoá thứ đang gõ). */
  config: ContributionConfig;
  reload: () => Promise<ContributionConfig | undefined>;
  /** Báo "đang lưu" lên tấm: nút "Lưu" ở `footer` quay, "Huỷ" + nền mờ bị khoá. */
  onPendingChange: (pending: boolean) => void;
  onSaved: () => void;
  ref?: Ref<ContributionConfigFormHandle>;
}

/**
 * Form "Đổi trọng số" (app.md §3): ba ô trọng số + DÒNG TỔNG tính theo từng ký tự gõ ("Tổng: 100/100" — lệch thì báo lỗi ngay tại dòng đó và `Lưu` không
 * gửi), số giờ cho phép trễ, điểm thẻ chưa gán. Cảnh báo minh bạch nằm trên cùng: đổi là tính lại TOÀN BỘ báo cáo và mọi thành viên thấy thời điểm đổi.
 * `RES_003` (người khác vừa đổi) → banner "Tải lại" giữ nguyên giá trị đang gõ. Ô là chuỗi (bàn phím di động), Zod đổi sang số ở đầu ra.
 *
 * ✅ [Huỷ | Lưu] nằm ở `footer` của `ContributionConfigSheet` (đứng yên, chia đôi bề ngang) — trước đây là hai viên thuốc nhỏ dạt trái ở CUỐI
 * vùng cuộn, bàn phím mở là che mất. Form chỉ dựng khi đã có công thức nên state của nó không nhấc lên tấm được: tấm gọi `submit` qua `ref`
 * và nhận "đang lưu" qua `onPendingChange`.
 */
export function ContributionConfigForm({
  boardId,
  config,
  reload,
  onPendingChange,
  onSaved,
  ref,
}: ContributionConfigFormProps) {
  const f = useContributionConfigForm({ boardId, config, onSaved, reload });
  // `useZodForm` trả `Control<In, unknown, Out>` còn `FormInput` nhận `Control<In>` — cùng đối tượng, chỉ khác tham số kiểu đầu ra.
  const control = f.form.control as unknown as Control<ContributionConfigInput>;

  useImperativeHandle(ref, () => ({ submit: () => void f.submit() }));
  useEffect(() => {
    onPendingChange(f.pending);
  }, [f.pending, onPendingChange]);
  // Form gỡ (tấm đóng, công thức bị xoá) giữa lúc đang lưu ⇒ trả tấm về "không lưu", lần mở sau nút không kẹt vòng quay.
  useEffect(() => () => onPendingChange(false), [onPendingChange]);

  return (
    <View className="gap-md">
      <Alert
        description="Toàn bộ báo cáo sẽ được tính lại và mọi thành viên thấy thời điểm đổi trọng số."
        tone="warning"
      />
      {f.conflict ? (
        <Alert
          actions={
            <Button
              label="Tải lại"
              size="xs"
              variant="secondary"
              onPress={() => void f.reloadLatest()}
            />
          }
          description="Giá trị bạn đang nhập vẫn được giữ. Tải lại để lưu tiếp trên bản mới."
          title="Công thức vừa được người khác thay đổi"
          tone="warning"
        />
      ) : null}
      {f.submitError ? <Alert description={f.submitError} tone="error" /> : null}
      {/* `Section tone="default"` = đúng kiểu chữ tiêu đề nhóm cũ (16 semibold `fg-1`, mốc `header`), dựng từ bộ chung. */}
      <Section title={`Trọng số (tổng ${WEIGHT_TOTAL})`} tone="default">
        <View className="gap-sm">
          <FormInput
            control={control}
            keyboardType="number-pad"
            label="Điểm thẻ (%)"
            maxLength={3}
            name="points"
            placeholder="Ví dụ: 40"
            returnKeyType="next"
          />
          <FormInput
            control={control}
            keyboardType="number-pad"
            label="Đúng hạn (%)"
            maxLength={3}
            name="onTime"
            placeholder="Ví dụ: 30"
            returnKeyType="next"
          />
          <FormInput
            control={control}
            keyboardType="number-pad"
            label="Điểm chấm (%)"
            maxLength={3}
            name="peer"
            placeholder="Ví dụ: 30"
            returnKeyType="next"
          />
          <View accessibilityLiveRegion="polite" className="gap-3xs">
            <View className="flex-row items-center gap-xs">
              <Text className="text-label-md font-semibold text-fg-1">Tổng</Text>
              <Badge
                label={`${f.total}/${WEIGHT_TOTAL}`}
                size="sm"
                variant={f.totalError ? 'error' : 'success'}
              />
            </View>
            {f.totalError ? <Text className="text-body-md text-error">{f.totalError}</Text> : null}
          </View>
        </View>
      </Section>
      <FormInput
        control={control}
        hint={`0–${GRACE_HOURS_MAX}`}
        keyboardType="number-pad"
        label="Cho phép trễ (giờ)"
        maxLength={2}
        message="Sau cuối ngày hạn vẫn tính đúng hạn."
        name="graceHours"
        placeholder="Ví dụ: 24"
        returnKeyType="next"
      />
      <FormInput
        control={control}
        hint={`0–${UNESTIMATED_MAX}, bước 0,5`}
        keyboardType="decimal-pad"
        label="Điểm cho thẻ chưa gán story points"
        maxLength={4}
        message="Thẻ chưa gán điểm được tính bằng số này."
        name="unestimated"
        placeholder="Ví dụ: 2,5"
        returnKeyType="done"
      />
    </View>
  );
}
