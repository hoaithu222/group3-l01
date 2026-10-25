import { z } from 'zod';

import type { PlagiarismConfig } from '../service/plagiarism.types';

/** Trần cứng hiển thị cạnh ô (khớp `LIMITS.plagiarism` phía BE) — form chỉ HẠ được trong khoảng này, BE vẫn kiểm lại. */
export const PLAGIARISM_LIMITS = {
  scansPerWorkspacePerDayMax: 20,
  minSectionTokensMin: 8,
  minSectionTokensMax: 200,
  boilerplatePhrasesMax: 50,
  boilerplatePhraseMin: 10,
  boilerplatePhraseMax: 300,
} as const;

export const CODE_LANGUAGE_OPTIONS = [
  { label: 'C-like (C/C++/Java/JS/TS/Go/PHP…)', value: 'c-like' },
  { label: 'Python (kể cả Ruby)', value: 'python' },
  { label: 'SQL', value: 'sql' },
  { label: 'HTML/CSS', value: 'markup' },
];

/** Giá trị FORM (kit2 chưa có ô nhập thẻ — cụm câu mẫu là MỘT chuỗi nhiều dòng, tách/gộp ở `toFormValues`/`toPayload`). */
export const plagiarismConfigFormSchema = z
  .object({
    thresholdMedium: z.number().int().min(1).max(99),
    thresholdHigh: z.number().int().min(2).max(100),
    minSectionTokens: z.number().int().min(PLAGIARISM_LIMITS.minSectionTokensMin).max(PLAGIARISM_LIMITS.minSectionTokensMax),
    commonDocFrequencyPercent: z.number().int().min(5).max(100),
    scansPerWorkspacePerDay: z.number().int().min(1).max(PLAGIARISM_LIMITS.scansPerWorkspacePerDayMax),
    codeLanguages: z.array(z.string()).min(0),
    boilerplatePhrasesText: z.string().max(PLAGIARISM_LIMITS.boilerplatePhrasesMax * (PLAGIARISM_LIMITS.boilerplatePhraseMax + 1)),
  })
  .superRefine((values, ctx) => {
    if (values.thresholdMedium >= values.thresholdHigh) {
      ctx.addIssue({ code: 'custom', path: ['thresholdHigh'], message: 'Ngưỡng Cao phải lớn hơn ngưỡng Trung bình' });
    }
    const lines = phrasesOf(values.boilerplatePhrasesText);
    if (lines.length > PLAGIARISM_LIMITS.boilerplatePhrasesMax) {
      ctx.addIssue({ code: 'custom', path: ['boilerplatePhrasesText'], message: `Tối đa ${PLAGIARISM_LIMITS.boilerplatePhrasesMax} cụm` });
    }
    const invalid = lines.find((l) => l.length < PLAGIARISM_LIMITS.boilerplatePhraseMin || l.length > PLAGIARISM_LIMITS.boilerplatePhraseMax);
    if (invalid) {
      ctx.addIssue({
        code: 'custom',
        path: ['boilerplatePhrasesText'],
        message: `Mỗi dòng ${PLAGIARISM_LIMITS.boilerplatePhraseMin}-${PLAGIARISM_LIMITS.boilerplatePhraseMax} ký tự (dòng "${invalid.slice(0, 20)}…" sai)`,
      });
    }
  });

export type PlagiarismConfigFormValues = z.infer<typeof plagiarismConfigFormSchema>;

/** Tách dòng, bỏ dòng trống — IME-safe (không `trim()` giữa chừng gõ, chỉ tách khi submit/tính lỗi). */
export function phrasesOf(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function toFormValues(config: PlagiarismConfig): PlagiarismConfigFormValues {
  return {
    thresholdMedium: config.thresholds.medium,
    thresholdHigh: config.thresholds.high,
    minSectionTokens: config.minSectionTokens,
    commonDocFrequencyPercent: config.commonDocFrequencyPercent,
    scansPerWorkspacePerDay: config.scansPerWorkspacePerDay,
    codeLanguages: config.codeLanguages,
    boilerplatePhrasesText: config.boilerplatePhrases.join('\n'),
  };
}

export function toPayload(values: PlagiarismConfigFormValues, expectedVersion: number, reason: string) {
  return {
    thresholds: { medium: values.thresholdMedium, high: values.thresholdHigh },
    minSectionTokens: values.minSectionTokens,
    commonDocFrequencyPercent: values.commonDocFrequencyPercent,
    scansPerWorkspacePerDay: values.scansPerWorkspacePerDay,
    codeLanguages: values.codeLanguages,
    boilerplatePhrases: phrasesOf(values.boilerplatePhrasesText),
    expectedVersion,
    reason,
  };
}
