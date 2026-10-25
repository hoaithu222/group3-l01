import { useMemo, useState } from 'react';

import { useZodForm } from '@/shared/form/useZodForm';

import type { PortfolioProject } from '../api/portfolio.types';
import { useUpdateProject } from '../queries/portfolio-project.mutations';
import {
  projectDefaults,
  projectSchema,
  toUpdateInput,
} from '../schemas/portfolio-project.schemas';
import { isGone, isVersionConflict, portfolioErrorMessage } from '../utils/portfolio-errors';
import { usePortfolioLimits } from './usePortfolioLimits';

export interface UsePortfolioProjectFormArgs {
  project: PortfolioProject;
  /** Tải lại dự án mới nhất; trả `undefined` khi tải lỗi hoặc dự án không còn. */
  reload: () => Promise<PortfolioProject | undefined>;
  onSaved: () => void;
  /** Server trả 404 khi lưu: dự án đã bị xoá ở nơi khác — nơi gọi báo và rời màn. */
  onGone: () => void;
}

/**
 * Vòng đời form "Sửa dự án" (app.md p6-07 §3) — cùng khuôn `usePortfolioProfileForm`: `baseVersion` (CAS RIÊNG của dự án) chụp lúc mở màn, `RES_003` ⇒ banner "Tải lại" giữ
 * nội dung đang gõ, lỗi khác hiện TRONG form. "Làm mới số liệu" KHÔNG tăng `version` dự án (BE chỉ ghi snapshot) nên không làm lệch `baseVersion`; ngược lại đổi công tắc
 * "Hiện tên đồng đội" đi qua lần LƯU này (BE tính lại phần đồng đội ngay trong `PATCH`, rẻ, không tính vào hạn mức làm mới).
 */
export function usePortfolioProjectForm({
  onGone,
  onSaved,
  project,
  reload,
}: UsePortfolioProjectFormArgs) {
  const limits = usePortfolioLimits();
  const schema = useMemo(() => projectSchema(limits), [limits]);
  const form = useZodForm(schema, { defaultValues: projectDefaults(project) });
  const update = useUpdateProject();
  const [baseVersion, setBaseVersion] = useState(project.version);
  const [conflict, setConflict] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submit = form.handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      const saved = await update.mutateAsync({
        input: toUpdateInput(values, baseVersion),
        projectId: project.id,
      });
      setBaseVersion(saved.version);
      onSaved();
    } catch (error) {
      if (isVersionConflict(error)) setConflict(true);
      else if (isGone(error)) onGone();
      else setSubmitError(portfolioErrorMessage(error));
    }
  });

  const reloadLatest = async (): Promise<void> => {
    const fresh = await reload();
    if (!fresh) return;
    setBaseVersion(fresh.version);
    setConflict(false);
  };

  return { conflict, form, limits, pending: update.isPending, reloadLatest, submit, submitError };
}
