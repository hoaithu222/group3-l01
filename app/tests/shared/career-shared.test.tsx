import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  DEFAULT_SKILL_ICON,
  ProofOfWorkSheet,
  SkillBadgeCard,
  SkillBadgeRow,
  formatScore,
  skillIconName,
  type SkillBadge,
} from '@/shared/career';

/**
 * `@/shared/career` (p6-06 — dùng lại ở p6-03/p6-07/p6-08 và thẻ thành viên): hàng ≤ 3 huy hiệu + "+N" (bỏ huy hiệu đã thu hồi), thẻ huy hiệu bị
 * thu hồi dùng câu TRUNG TÍNH, icon lạ rơi về icon mặc định, tấm minh chứng có trạng thái lỗi + "Thử lại".
 */
const METRICS = { frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 44 } };

const badge = (id: string, name: string, over: Partial<SkillBadge> = {}): SkillBadge => ({
  proof: { avgPeerScore: null, storyPoints: 10, tasksDone: 5 },
  revoked: false,
  revokedNotice: null,
  skill: { category: 'BACKEND', code: id, description: null, icon: 'service', id, name },
  unlockedAt: '2026-09-12T03:00:00.000Z',
  ...over,
});

describe('@/shared/career', () => {
  it('SkillBadgeRow: tối đa 3 + "+N"; bỏ qua huy hiệu đã thu hồi; không còn huy hiệu → không vẽ', async () => {
    const all = [badge('a', 'Node.js'), badge('b', 'Python'), badge('c', 'Java'), badge('d', 'DevOps'), badge('e', 'SQL', { revoked: true })];
    const view = await render(<SkillBadgeRow badges={all} />);
    expect(screen.getByText('+1')).toBeOnTheScreen();
    expect(screen.queryByText('SQL')).toBeNull();
    expect(screen.getByLabelText('Huy hiệu kỹ năng xác thực: Node.js, Python, Java, DevOps')).toBeOnTheScreen();
    await view.rerender(<SkillBadgeRow badges={[badge('e', 'SQL', { revoked: true })]} />);
    expect(screen.queryByText('SQL')).toBeNull();
  });

  it('SkillBadgeCard: thu hồi → câu trung tính của server, không nút khi không có onPress', async () => {
    await render(<SkillBadgeCard badge={badge('a', 'Node.js', { revoked: true, revokedNotice: 'Huy hiệu đã được thu hồi sau rà soát' })} />);
    expect(screen.getByText('Huy hiệu đã được thu hồi sau rà soát')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('skillIconName: tên lạ → icon mặc định; formatScore kiểu Việt', () => {
    expect(skillIconName('service')).toBe('service');
    expect(skillIconName('khong-co-icon-nay')).toBe(DEFAULT_SKILL_ICON);
    expect(formatScore(8.25)).toBe('8,3');
    expect(formatScore(10)).toBe('10');
    expect(formatScore(null)).toBe('—');
  });

  it('ProofOfWorkSheet: lỗi → câu trung tính + "Thử lại" gọi lại', async () => {
    const onRetry = jest.fn();
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ProofOfWorkSheet error loading={false} proof={undefined} title="Minh chứng" visible onClose={jest.fn()} onRetry={onRetry} />
      </SafeAreaProvider>,
    );
    expect(screen.getByText('Không xem được minh chứng này.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
