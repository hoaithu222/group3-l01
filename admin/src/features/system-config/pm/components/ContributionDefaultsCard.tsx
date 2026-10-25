import { memo, useMemo } from 'react';
import { useWatch } from 'react-hook-form';

import { Callout, Form, Text, useZodForm } from '@/shared/ui';

import JsonConfigCard from '../../components/JsonConfigCard';
import { useJsonConfigField } from '../../hooks/useJsonConfigField';
import type { SystemConfigItem } from '../../types/system-config.types';
import {
  contributionDefaultsSchema,
  type ContributionDefaultsFormValues,
} from '../schemas/contribution-defaults.schema';
import {
  contributionPatch,
  mergeContributionForm,
  summarizeContribution,
  toContributionForm,
  type WatchedContribution,
} from '../utils/contribution-defaults';
import ContributionDefaultsFields from './ContributionDefaultsFields';

export interface ContributionDefaultsCardProps {
  /** Khoá `pm.contribution` của registry (ba field `json`: weights, onTimeGraceHours, unestimatedPoints). */
  item: SystemConfigItem;
  /** Múi giờ hiệu lực của khoá `pm` (chỉ để nhắc trong ghi chú; đổi ở thẻ "Dự án"). `null` khi chưa biết. */
  timezone: string | null;
  /** Có `system-config:update`. */
  canEdit: boolean;
  /** Tải lại danh sách và trả bản mới của khoá này. */
  onReload: (key: string) => Promise<SystemConfigItem | undefined>;
}

/**
 * Thẻ "Đóng góp — mặc định cho bảng mới" (`pm.contribution`, p4-06 admin.md §2.1). Lưu = kiểm Zod (ba trọng số
 * nguyên, TỔNG 100; trễ 0–72 giờ; điểm thẻ chưa gán 0–13 bước 0,5) → hộp thoại lý do kèm so sánh trước/sau →
 * `PUT /admin/system-config/pm.contribution` với `expectedVersion`; 409 → banner tải lại (xem `useJsonConfigField`).
 *
 * CHỈ là mặc định cho bảng tạo SAU khi lưu: bảng đang có giữ công thức chủ nhóm đã đặt. Admin không thấy điểm,
 * phần trăm hay heatmap của thành viên ở đâu cả.
 */
const ContributionDefaultsCard = memo(function ContributionDefaultsCard({
  item,
  timezone,
  canEdit,
  onReload,
}: ContributionDefaultsCardProps) {
  // `values` + keepDirtyValues: form THEO server khi chưa sửa; ô đang gõ dở được giữ nguyên.
  const serverValues = useMemo(() => toContributionForm(item), [item]);
  const form = useZodForm<ContributionDefaultsFormValues>(contributionDefaultsSchema, {
    defaultValues: serverValues,
    values: serverValues,
    resetOptions: { keepDirtyValues: true },
  });
  const watched = useWatch({ control: form.control }) as WatchedContribution | undefined;
  const after = mergeContributionForm(serverValues, watched);

  const g = useJsonConfigField({
    item,
    isDirty: form.formState.isDirty,
    onReload,
    onAdopt: (fresh) => form.reset(toContributionForm(fresh)),
  });

  return (
    <JsonConfigCard
      canEdit={canEdit}
      description="Công thức tính điểm đóng góp dùng khi nhóm tạo bảng mới — bảng đã có không đổi."
      g={g}
      isDirty={form.formState.isDirty}
      item={item}
      saveImpact={
        <div className="flex flex-col gap-1">
          <Text size="small" skin="muted">
            Trước: {summarizeContribution(serverValues)}
          </Text>
          <Text size="small">Sau: {summarizeContribution(after)}</Text>
        </div>
      }
      title="Đóng góp — mặc định cho bảng mới"
      onSaveClick={form.handleSubmit((values) => g.requestSave(contributionPatch(values)))}
    >
      <Form form={form} readOnly={!canEdit} onSubmit={() => undefined}>
        <ContributionDefaultsFields />
      </Form>
      <Callout
        description={`Chỉ áp cho bảng tạo sau khi lưu. Bảng đang có giữ trọng số do chủ nhóm đặt. Múi giờ tính ngày/tuần/tháng hiện là ${timezone ?? 'mặc định của hệ thống'} — đổi ở thẻ "Dự án" phía trên; đổi múi giờ làm tính lại biểu đồ hoạt động và báo cáo theo tuần/tháng của mọi bảng.`}
        intent="info"
        variant="ghost"
      />
    </JsonConfigCard>
  );
});

export default ContributionDefaultsCard;
