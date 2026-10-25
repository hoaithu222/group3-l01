import { z } from 'zod';

import type { PortfolioProject, UpdateProjectInput } from '../api/portfolio.types';
import type { PortfolioLimits } from '../constants/portfolio.constants';
import { graphemeLength } from '../utils/grapheme';
import { maxText } from './portfolio-fields';

/**
 * Form "Sửa dự án" (app.md p6-07 §3) — khớp `updateProjectSchema` của BE: tiêu đề 2–80, tóm tắt ≤ 500, vai trò ≤ 60, ≤ 3 điểm nổi bật (mỗi điểm ≤ 160), thời gian bắt đầu ≤ kết thúc. Điểm nổi bật
 * là mảng ĐỐI TƯỢNG `{ text }` (không phải mảng chuỗi) vì `useFieldArray` của react-hook-form chỉ nhận phần tử là object.
 */
export function projectSchema(limits: PortfolioLimits) {
  return (
    z
      .object({
        coverAssetId: z.string().nullable(),
        highlights: z
          .array(
            z.object({
              text: maxText(limits.highlightMax).refine(
                (v) => v.length > 0,
                'Điểm nổi bật không được để trống',
              ),
            }),
          )
          .max(limits.highlightsMax, `Tối đa ${limits.highlightsMax} điểm nổi bật`),
        periodFrom: z.string().nullable(),
        periodTo: z.string().nullable(),
        role: maxText(limits.roleMax),
        showTeammates: z.boolean(),
        summary: maxText(limits.summaryMax),
        title: maxText(limits.projectTitleMax).refine(
          (value) => graphemeLength(value) >= limits.projectTitleMin,
          `Tiêu đề tối thiểu ${limits.projectTitleMin} ký tự`,
        ),
        visible: z.boolean(),
      })
      // ⚠️ So THỜI ĐIỂM (`Date.parse`), không so chuỗi: giá trị từ server là `…Z`, giá trị vừa chọn là `…+07:00` — hai dạng ISO khác nhau.
      .refine(
        (v) => !v.periodFrom || !v.periodTo || Date.parse(v.periodFrom) <= Date.parse(v.periodTo),
        {
          message: 'Thời gian bắt đầu phải trước thời gian kết thúc',
          path: ['periodTo'],
        },
      )
  );
}

export type ProjectFormValues = z.infer<ReturnType<typeof projectSchema>>;

export function projectDefaults(project: PortfolioProject): ProjectFormValues {
  return {
    coverAssetId: project.coverAssetId,
    highlights: project.highlights.map((text) => ({ text })),
    periodFrom: project.periodFrom,
    periodTo: project.periodTo,
    role: project.role ?? '',
    showTeammates: project.showTeammates,
    summary: project.summary ?? '',
    title: project.title,
    visible: project.visible,
  };
}

export function toUpdateInput(
  values: ProjectFormValues,
  expectedVersion: number,
): UpdateProjectInput {
  return {
    coverAssetId: values.coverAssetId,
    expectedVersion,
    highlights: values.highlights.map((item) => item.text),
    periodFrom: values.periodFrom,
    periodTo: values.periodTo,
    role: values.role === '' ? null : values.role,
    showTeammates: values.showTeammates,
    summary: values.summary === '' ? null : values.summary,
    title: values.title,
    visible: values.visible,
  };
}
