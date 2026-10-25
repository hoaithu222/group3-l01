import { useEffect, useMemo, useState } from 'react';
import { useFormState } from 'react-hook-form';
import { Text, View } from 'react-native';

import { useZodForm } from '@/shared/form/useZodForm';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Section } from '@/shared/ui/section';

import type { StudyVisibility } from '../api/study.types';
import type { StudyLimits } from '../constants/study.constants';
import { useCoverSlot } from '../hooks/useCoverSlot';
import { parseTags, setFormSchema, type SetFormValues } from '../schemas/study.schemas';
import { MediaSlot } from './editor/MediaSlot';
import { SetFormInfoFields } from './editor/SetFormInfoFields';
import { SetFormTags } from './editor/SetFormTags';
import { isVisibilityValid, VisibilityPicker, type VisibilityValue } from './VisibilityPicker';

export interface SetFormResult {
  /** Chuỗi = ảnh bìa mới · `null` = gỡ ảnh bìa sẵn có · `undefined` = không đổi. */
  coverAssetId?: string | null;
  confirmPublic?: boolean;
  description: string;
  tags: string[];
  title: string;
  visibility: StudyVisibility;
}

export interface SetFormProps {
  canUseWorkspace: boolean;
  /** Khoá hàng đợi upload của ảnh bìa: `setId` (sửa) hoặc `Idempotency-Key` của lượt tạo (bộ chưa có id). */
  coverScopeId: string;
  /** Lỗi cấp form từ server (`STUDY_007/008/003`, 409…) — hiện DƯỚI form, giữ nguyên thứ đã nhập. */
  errorMessage?: string | null;
  /** `coverAssetId` sẵn có của bộ (`null` khi tạo mới). */
  initialCoverAssetId: string | null;
  initial: { description: string; tags: string[]; title: string; visibility: StudyVisibility };
  limits: StudyLimits;
  /** Báo màn cha khi form có thay đổi chưa gửi (chữ, phạm vi hoặc ảnh bìa) — để hỏi "Bỏ thay đổi?" khi bấm quay lại. Nên là hàm ỔN ĐỊNH (`setState`). */
  onDirtyChange?: (dirty: boolean) => void;
  /** Ngoại tuyến: khoá nút gửi (không có mạng thì không tạo/lưu được) và nói rõ vì sao. */
  offline?: boolean;
  submitLabel: string;
  submitting: boolean;
  workspaceName?: string;
  onSubmit: (result: SetFormResult) => void;
}

/**
 * Form thông tin bộ học (app.md p4-01 §3 `CreateSet`), dùng cho cả TẠO và SỬA. Bốn phần rõ ràng theo thứ tự nghĩ của người soạn:
 * Thông tin (tiêu đề, mô tả — có bộ đếm ký tự) · Phạm vi (ba thẻ chọn) · Thẻ #tag (hiện ngay thẻ đã hiểu) · Ảnh bìa (ô lớn, xem trước).
 * Lỗi Zod hiện tại ô (đúng nhịp `onTouched`); lỗi server hiện ở `Alert` cuối form để không mất nội dung đang gõ. Ảnh bìa tải qua hàng đợi
 * upload scope `STUDY` (`useCoverSlot`); còn tệp đang tải/lỗi thì khoá nút gửi để không tạo/lưu bộ thiếu ảnh mà người dùng tưởng đã có.
 */
export function SetForm({
  canUseWorkspace,
  coverScopeId,
  errorMessage,
  initial,
  initialCoverAssetId,
  limits,
  offline = false,
  onDirtyChange,
  onSubmit,
  submitLabel,
  submitting,
  workspaceName,
}: SetFormProps) {
  const schema = useMemo(() => setFormSchema(limits), [limits]);
  const [visibility, setVisibility] = useState<VisibilityValue>({
    confirmPublic: initial.visibility === 'PUBLIC',
    visibility: initial.visibility,
  });
  const cover = useCoverSlot(coverScopeId, initialCoverAssetId);
  const form = useZodForm<SetFormValues, SetFormValues>(schema, {
    defaultValues: {
      description: initial.description,
      tags: initial.tags.join(', '),
      title: initial.title,
    },
  });

  // `isDirty` của RHF chỉ biết các ô chữ; phạm vi và ảnh bìa nằm ngoài RHF nên tự so với giá trị ban đầu.
  const { isDirty } = useFormState({ control: form.control });
  const dirty =
    isDirty || visibility.visibility !== initial.visibility || cover.value !== undefined;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const submit = form.handleSubmit((values) =>
    onSubmit({
      coverAssetId: cover.value,
      confirmPublic: visibility.visibility === 'PUBLIC' ? visibility.confirmPublic : undefined,
      description: values.description ?? '',
      tags: parseTags(values.tags ?? '', limits),
      title: values.title,
      visibility: visibility.visibility,
    }),
  );

  const note = offline
    ? `Đang ngoại tuyến — kết nối lại để ${submitLabel.toLowerCase()}.`
    : cover.blocked
      ? `Chờ ảnh bìa tải xong (hoặc bỏ ảnh bìa lỗi) rồi mới ${submitLabel.toLowerCase()} được.`
      : null;

  return (
    <View className="gap-xl py-xs">
      {/* Bốn nhóm, mỗi nhóm một icon nhỏ trước tiêu đề — mốc để mắt quét form dài (trang trí, nghĩa nằm ở chữ tiêu đề). */}
      <Section icon="edit" title="Thông tin">
        <SetFormInfoFields
          autoFocusTitle={initial.title === ''}
          control={form.control}
          limits={limits}
          setFocus={form.setFocus}
        />
      </Section>

      <Section icon="view" title="Phạm vi">
        <Card>
          <VisibilityPicker
            canUseWorkspace={canUseWorkspace}
            disabled={submitting}
            value={visibility}
            workspaceName={workspaceName}
            onChange={setVisibility}
          />
        </Card>
      </Section>

      <Section icon="ticket" title="Thẻ (#tag)">
        <SetFormTags control={form.control} limits={limits} />
      </Section>

      <Section icon="image" title="Ảnh bìa">
        <MediaSlot
          aspect="banner"
          assetId={cover.assetId}
          hero
          label="Ảnh bìa"
          slot={cover.slot}
          onClear={cover.clear}
        />
      </Section>

      <View className="gap-sm">
        {errorMessage ? <Alert description={errorMessage} tone="error" /> : null}
        {note ? (
          <Text accessibilityLiveRegion="polite" className="text-caption-sm text-fg-2">
            {note}
          </Text>
        ) : null}
        <Button
          disabled={!isVisibilityValid(visibility) || cover.blocked || offline}
          fullWidth
          label={submitLabel}
          loading={submitting}
          onPress={submit}
        />
      </View>
    </View>
  );
}
