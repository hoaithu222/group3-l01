/**
 * Mặt tiền dùng chung của "mẫu nhóm" (p5-04): kiểu kết quả áp mẫu + câu tóm tắt — để `workspaces` (tạo nhóm) và
 * `workspace-templates` (áp mẫu) không phải import chéo nhau.
 */
export { skipReasonLabel, summarizeTemplateResult } from './template-result';
export type {
  TemplateApplyResult,
  TemplateCreatedChannel,
  TemplateOutcome,
  TemplateOutcomeTone,
  TemplateSelection,
  TemplateSkipReason,
  TemplateSkippedChannel,
  TemplateStepProps,
} from './template-result';
