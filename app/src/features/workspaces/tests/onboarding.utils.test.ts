import { NEW_WORKSPACE_DAYS } from '../constants/workspace.constants';
import { buildOnboardingSteps, isNewWorkspace } from '../utils/onboarding.utils';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-19T00:00:00.000Z');

describe('isNewWorkspace', () => {
  it('nhóm tạo trong vòng NEW_WORKSPACE_DAYS ⇒ mới', () => {
    const createdAt = new Date(NOW - (NEW_WORKSPACE_DAYS - 1) * DAY_MS).toISOString();
    expect(isNewWorkspace(createdAt, NOW)).toBe(true);
  });

  it('nhóm tạo quá NEW_WORKSPACE_DAYS ⇒ không còn mới', () => {
    const createdAt = new Date(NOW - (NEW_WORKSPACE_DAYS + 1) * DAY_MS).toISOString();
    expect(isNewWorkspace(createdAt, NOW)).toBe(false);
  });

  it('thiếu hoặc sai định dạng ⇒ KHÔNG coi là mới (thà không nhắc còn hơn nhắc mãi)', () => {
    expect(isNewWorkspace(undefined, NOW)).toBe(false);
    expect(isNewWorkspace('không phải ngày', NOW)).toBe(false);
  });
});

describe('buildOnboardingSteps', () => {
  it('thứ tự Mời → Kênh → Tin đầu, mặc định chưa bước nào xong', () => {
    const steps = buildOnboardingSteps([], 1);
    expect(steps.map((step) => step.id)).toEqual(['invite', 'channel', 'message']);
    expect(steps.every((step) => !step.done)).toBe(true);
  });

  it('bước "Mời" được SUY từ memberCount > 1, không cần người dùng mở màn mời', () => {
    expect(buildOnboardingSteps([], 2).find((step) => step.id === 'invite')?.done).toBe(true);
    expect(buildOnboardingSteps([], 1).find((step) => step.id === 'invite')?.done).toBe(false);
  });

  it('hai bước còn lại chỉ xong khi đã được ghi nhận', () => {
    const steps = buildOnboardingSteps(['channel'], 1);
    expect(steps.find((step) => step.id === 'channel')?.done).toBe(true);
    expect(steps.find((step) => step.id === 'message')?.done).toBe(false);
  });
});
