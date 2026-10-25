import type { AxiosError } from 'axios';
import { memo, useMemo, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

import { extractErrorCode } from '@/core/api/error.handler';
import {
  Button,
  Callout,
  Form,
  FormActions,
  NumberField,
  SelectField,
  TextareaField,
  TextField,
  useZodForm,
} from '@/shared/ui';
import { useDebounce } from '@/shared/hooks';

import {
  PREVIEW_DEBOUNCE_MS,
  SKILL_CATEGORY_OPTIONS,
  SKILL_ICON_OPTIONS,
  SKILL_LIMITS as L,
} from '../constants/skill.constants';
import { skillFormSchema, type SkillFormValues } from '../schemas/skill.schema';
import { useCreateSkill, useUpdateSkill } from '../service/skill.queries';
import type { AdminSkill } from '../types/skill.types';
import {
  initValues,
  isCriteriaHarder,
  toCreatePayload,
  toCriteria,
  toUpdatePayload,
} from '../utils/skill-form.utils';
import CriteriaFields from './CriteriaFields';
import EligiblePreviewPanel from './EligiblePreviewPanel';
import LabelMatchField from './LabelMatchField';

export interface SkillFormProps {
  /** `null` = tạo mới (mã sửa được); có giá trị = sửa (mã khoá, CAS theo `version`). */
  skill: AdminSkill | null;
  canEdit: boolean;
  /** Tải lại bản mới nhất (sau 409 `RES_003`). */
  onReload?: () => void;
}

/**
 * Form tạo/sửa kỹ năng (admin.md p6-06 §2.2) + khối Xem trước bên phải (dưới trên màn hẹp). Lưu gửi `expectedVersion`; 409 `RES_003` → banner
 * "Dữ liệu đã thay đổi" và GIỮ nguyên form để người sửa so lại. Tạo mới luôn TẮT — bật ở trang chi tiết (có lý do).
 */
const SkillForm = memo(function SkillForm({ skill, canEdit, onReload }: SkillFormProps) {
  const navigate = useNavigate();
  const form = useZodForm<SkillFormValues>(skillFormSchema, { defaultValues: initValues(skill) });
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const [conflict, setConflict] = useState(false);

  const watched = useWatch({
    control: form.control,
    name: ['requiredTasksDone', 'minStoryPoints', 'minAvgPeerScore', 'requireReview'],
  });
  const [requiredTasksDone, minStoryPoints, minAvgPeerScore, requireReview] = watched;
  const draft = useMemo(
    () =>
      toCriteria({
        requiredTasksDone: Number(requiredTasksDone) || 0,
        minStoryPoints: Number(minStoryPoints) || 0,
        minAvgPeerScore: Number(minAvgPeerScore) || 0,
        requireReview: !!requireReview,
      }),
    [minAvgPeerScore, minStoryPoints, requireReview, requiredTasksDone],
  );
  const debounced = useDebounce(draft, PREVIEW_DEBOUNCE_MS);
  const harder = !!skill && isCriteriaHarder(skill.criteria, draft);

  const handleSubmit = async (values: SkillFormValues) => {
    setConflict(false);
    try {
      if (skill) {
        await update.mutateAsync(toUpdatePayload(skill, values));
        form.reset({ ...values, reason: '' });
      } else {
        const res = await create.mutateAsync(toCreatePayload(values));
        void navigate(`/skill/${encodeURIComponent(res.data.id)}`, { replace: true });
      }
    } catch (err) {
      if (extractErrorCode(err as AxiosError) === 'RES_003') setConflict(true);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Form form={form} readOnly={!canEdit} onSubmit={handleSubmit}>
        {conflict ? (
          <Callout
            action={
              onReload ? (
                <Button size="sm" variant="stroke" onClick={onReload}>
                  Tải lại
                </Button>
              ) : undefined
            }
            description="Người khác vừa sửa kỹ năng này. Nội dung bạn nhập vẫn giữ nguyên — tải lại để so rồi lưu lại."
            intent="warning"
            title="Dữ liệu đã thay đổi"
          />
        ) : null}
        <TextField
          description={
            skill ? 'Mã không đổi được sau khi tạo.' : 'a-z, 0-9, dấu gạch ngang (2–40).'
          }
          disabled={!!skill}
          label="Mã"
          name="code"
          required
        />
        <TextField label="Tên kỹ năng" maxLength={L.nameMax} name="name" required />
        <TextareaField
          label="Mô tả"
          maxLength={L.descriptionMax}
          name="description"
          rows={2}
          showCount
        />
        <SelectField label="Nhóm" name="category" options={SKILL_CATEGORY_OPTIONS} required />
        <LabelMatchField disabled={!canEdit} />
        <CriteriaFields />
        <SelectField
          description="Tên icon trong bộ icon của ứng dụng di động."
          label="Icon"
          name="icon"
          options={SKILL_ICON_OPTIONS}
          required
        />
        <NumberField label="Thứ tự" max={L.orderMax} min={0} name="order" required />
        {skill ? (
          <TextareaField
            description="Tuỳ chọn — lưu vào nhật ký quản trị (≥ 10 ký tự nếu nhập)."
            label="Lý do thay đổi"
            maxLength={500}
            name="reason"
            rows={2}
          />
        ) : null}
        {canEdit ? (
          <FormActions
            isSubmitting={form.formState.isSubmitting}
            submitLabel={skill ? 'Lưu thay đổi' : 'Tạo kỹ năng'}
          />
        ) : null}
      </Form>
      <EligiblePreviewPanel
        criteria={skill ? debounced : undefined}
        harder={harder}
        skillId={skill?.id}
      />
    </div>
  );
});

export default SkillForm;
