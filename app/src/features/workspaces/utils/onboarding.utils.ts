import { NEW_WORKSPACE_DAYS } from '../constants/workspace.constants';
import type { OnboardingStepId } from '../store/onboarding.store';

const DAY_MS = 24 * 60 * 60 * 1000;

export const ONBOARDING_STEP_IDS: readonly OnboardingStepId[] = ['invite', 'channel', 'message'];

export interface OnboardingStepView {
  id: OnboardingStepId;
  title: string;
  description: string;
  done: boolean;
}

const STEP_COPY: Record<OnboardingStepId, { title: string; description: string }> = {
  invite: { title: 'Mời thành viên', description: 'Tạo link mời để mọi người cùng vào nhóm.' },
  channel: { title: 'Xem các kênh', description: 'Kênh giúp chia nhỏ chủ đề, mở kênh để bắt đầu.' },
  message: { title: 'Gửi tin đầu tiên', description: 'Chào mọi người ở kênh chung của nhóm.' },
};

/** `createdAt` không đọc được (thiếu/sai định dạng) thì coi là KHÔNG mới — thà không nhắc còn hơn nhắc mãi. */
export function isNewWorkspace(createdAt: string | undefined, now: number = Date.now()): boolean {
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  return now - created <= NEW_WORKSPACE_DAYS * DAY_MS;
}

/**
 * Trạng thái từng bước. `invite` được SUY từ `memberCount` (đã có người khác
 * ngoài chủ nhóm ⇒ đã mời thành công), không dựa vào việc "đã mở màn mời" —
 * mở mà không tạo link chưa phải là xong. Hai bước còn lại chỉ ghi nhận được
 * "người dùng đã mở tới đó" (`recordedDone`), vì BE không trả số kênh/tin.
 */
export function buildOnboardingSteps(recordedDone: readonly OnboardingStepId[], memberCount: number): OnboardingStepView[] {
  return ONBOARDING_STEP_IDS.map((id) => ({
    id,
    ...STEP_COPY[id],
    done: recordedDone.includes(id) || (id === 'invite' && memberCount > 1),
  }));
}
