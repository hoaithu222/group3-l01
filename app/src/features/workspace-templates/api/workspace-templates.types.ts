/**
 * Kiểu DTO của "Mẫu nhóm" (p5-04) — khớp `be/src/modules/workspace-templates/workspace-templates.service.ts` (`TemplateDto`) và
 * `workspace-templates.validators.ts` (đọc TRỰC TIẾP từ mã BE; be.md chỉ để tra nhanh).
 */
import type { TemplateApplyResult } from '@/shared/workspace-templates';

export type TemplateChannelType = 'POMODORO' | 'TEXT' | 'VOICE';
export type TemplateChannelVisibility = 'PRIVATE' | 'PUBLIC';
export type TemplatePostingPolicy = 'ADMINS_ONLY' | 'MEMBERS';

export interface TemplateChannel {
  /** Mặc định được tick khi chọn mẫu. */
  defaultSelected: boolean;
  description: string;
  /** Khoá ổn định (`a-z0-9-`, ≤ 40) — thứ được gửi lên, KHÔNG phải tên hiển thị. */
  key: string;
  name: string;
  postingPolicy: TemplatePostingPolicy;
  type: TemplateChannelType;
  visibility: TemplateChannelVisibility;
}

export interface WorkspaceTemplate {
  channels: TemplateChannel[];
  code: string;
  description: string;
  name: string;
}

export type ApplyTemplateResult = TemplateApplyResult;

export interface ApplyTemplatePayload {
  /** 1–20 khoá của mẫu (BE từ chối rỗng). */
  channelKeys: string[];
  code: string;
  idempotencyKey: string;
}

/** Phần của `GET /workspaces/:id` mà màn áp mẫu đọc — kiểu HẸP trên cùng phản hồi đầy đủ (xem `getWorkspaceHead`). */
export interface TemplateWorkspaceHead {
  myRole: 'ADMIN' | 'GUEST' | 'MEMBER' | 'OWNER';
  status: 'ACTIVE' | 'ARCHIVED';
}
