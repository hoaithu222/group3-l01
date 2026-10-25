import type { SplitDraft } from '../domain/split-draft';

/** Nháp chia đều cho hai người A, B — dùng chung giữa các test payload/form. */
export function splitDraftForTest(overrides: Partial<SplitDraft> = {}): SplitDraft {
  return { custom: {}, percent: {}, selected: ['A', 'B'], splitType: 'EQUAL', ...overrides };
}
