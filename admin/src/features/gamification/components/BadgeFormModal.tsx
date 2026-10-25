import { memo, useCallback, useState } from 'react';

import {
  Button,
  FormModal,
  NumberField,
  SelectField,
  TextareaField,
  TextField,
  useZodForm,
} from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import { BADGE_RARITY_LABELS } from '../constants/gamification.labels';
import { useBadgeIconUpload } from '../hooks';
import {
  BADGE_DESCRIPTION_MAX,
  BADGE_NAME_MAX,
  badgeFormSchema,
  type BadgeFormValues,
} from '../schemas/badge.schema';
import {
  useCreateBadge,
  usePatchBadge,
  usePreviewBadge,
} from '../service/gamification.queries';
import type { AdminBadge } from '../types/gamification.types';
import { initValues, toCreatePayload, toCriteria, toPatchPayload } from '../utils/badge-form.utils';
import BadgeIconField from './BadgeIconField';
import CriteriaClauseList, { type CriteriaClause } from './CriteriaClauseList';

type Clause = CriteriaClause;

const RARITY_OPTIONS = Object.entries(BADGE_RARITY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export interface BadgeFormModalProps {
  open: boolean;
  /** `null` = tạo mới; có giá trị = sửa (mã khoá). */
  badge: AdminBadge | null;
  onClose: () => void;
}

/**
 * Form tạo/sửa huy hiệu (admin.md p4-03 §2.2) — `useZodForm` + `schemas/badge.schema.ts`; điều kiện
 * nhóm "Tất cả" + "Một trong" với counter chọn từ danh sách cố định (`COUNTER_KEYS` BE, không có
 * trường tự do); "Kiểm tra" → `POST /admin/badges/preview`. Lý do (10–500) bắt buộc, ghi nhật ký.
 */
const BadgeFormModal = memo(function BadgeFormModal({ open, badge, onClose }: BadgeFormModalProps) {
  const form = useZodForm<BadgeFormValues>(badgeFormSchema, { defaultValues: initValues(badge) });
  const create = useCreateBadge();
  const patch = usePatchBadge();
  const preview = usePreviewBadge();
  const icon = useBadgeIconUpload();
  /** Số người đủ điều kiện của lần "Kiểm tra" gần nhất; `null` khi điều kiện đã đổi sau đó. */
  const [eligible, setEligible] = useState<number | null>(null);

  const clauses = form.watch('clauses');
  const anyClauses = form.watch('anyClauses');
  const clausesError = form.formState.errors.clauses?.message;

  const setClauses = useCallback(
    (key: 'clauses' | 'anyClauses', next: Clause[]) => {
      form.setValue(key, next, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
      setEligible(null);
    },
    [form],
  );

  const handlePreview = useCallback(async () => {
    const res = await preview.mutateAsync(toCriteria(clauses, anyClauses));
    setEligible(res.data.eligibleUsers);
  }, [anyClauses, clauses, preview]);

  const handleSubmit = useCallback(
    async (data?: BadgeFormValues) => {
      if (!data) return;
      if (badge) await patch.mutateAsync(toPatchPayload(badge, data));
      else await create.mutateAsync(toCreatePayload(data));
    },
    [badge, create, patch],
  );

  return (
    <FormModal<BadgeFormValues>
      confirmDisabled={icon.uploading}
      confirmLabel={badge ? 'Lưu thay đổi' : 'Tạo huy hiệu'}
      form={form}
      open={open}
      scrollable
      size="sm"
      title={badge ? 'Sửa huy hiệu' : 'Tạo huy hiệu'}
      onConfirm={handleSubmit}
      onOpenChange={(o) => !o && onClose()}
    >
      <TextField
        description={badge ? 'Mã không đổi được sau khi tạo.' : 'a-z, 0-9, dấu gạch ngang (3–40).'}
        disabled={!!badge}
        label="Mã"
        name="code"
        required
      />
      <TextField label="Tên huy hiệu" maxLength={BADGE_NAME_MAX} name="name" required />
      <TextareaField
        label="Mô tả"
        maxLength={BADGE_DESCRIPTION_MAX}
        name="description"
        rows={2}
        showCount
      />
      <TextField label="Emoji" maxLength={8} name="emoji" />
      <BadgeIconField onUpload={icon.onUpload} />
      <SelectField label="Độ hiếm" name="rarity" options={RARITY_OPTIONS} required />
      <NumberField label="Thứ tự" max={10_000} min={0} name="order" required />
      <CriteriaClauseList
        clauses={clauses}
        minCount={1}
        title="Tất cả (mọi điều kiện phải đạt)"
        onChange={(next) => setClauses('clauses', next)}
      />
      {clausesError ? (
        <span className="text-caption-12 text-error" role="alert">
          {clausesError}
        </span>
      ) : null}
      <CriteriaClauseList
        clauses={anyClauses}
        minCount={0}
        title="Một trong (ít nhất một điều kiện đạt — để trống nếu không dùng)"
        onChange={(next) => setClauses('anyClauses', next)}
      />
      <div className="flex items-center gap-2">
        <Button
          disabled={clauses.length === 0}
          loading={preview.isPending}
          size="sm"
          variant="stroke"
          onClick={() => void handlePreview()}
        >
          Kiểm tra
        </Button>
        {eligible !== null ? (
          <span className="text-body-14 text-fg-2">
            Hiện có {formatNumber(eligible)} người đủ điều kiện
          </span>
        ) : null}
      </div>
      <TextareaField
        description={
          badge
            ? 'Sửa điều kiện không thu hồi huy hiệu người dùng đã đạt.'
            : 'Lý do sẽ lưu vào nhật ký quản trị.'
        }
        label="Lý do"
        maxLength={500}
        name="reason"
        required
        rows={3}
        showCount
      />
    </FormModal>
  );
});

export default BadgeFormModal;
