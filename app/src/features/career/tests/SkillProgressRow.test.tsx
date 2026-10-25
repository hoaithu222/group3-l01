import { fireEvent, render, screen } from '@testing-library/react-native';

import { SkillProgressRow } from '../components/SkillProgressRow';
import { closeness, criteriaLines, remainingText } from '../utils/skill-text';
import { makeItem } from './fixtures';

/**
 * app.md p6-06 §8: `SkillProgressRow` hiện trạng thái bằng CHỮ ("Đã đạt" / "Đang tiến bộ" / "Đã bị thu hồi") + "32/50 task"; câu tracker
 * "Còn 18 task ReactJS · 0,3 điểm review".
 */
describe('SkillProgressRow', () => {
  it('đang làm dở → "Đang tiến bộ" + "32/50 task"; bấm gọi onPress với đúng kỹ năng', async () => {
    const onPress = jest.fn();
    await render(<SkillProgressRow item={makeItem()} onPress={onPress} />);
    expect(screen.getByText('Đang tiến bộ')).toBeOnTheScreen();
    expect(screen.getByText('32/50 task')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: /ReactJS, Frontend, 32\/50 task, Đang tiến bộ/ }));
    expect(onPress).toHaveBeenCalledWith(expect.objectContaining({ id: 'skill-react' }));
  });

  it('đã có huy hiệu → "Đã đạt"; bị thu hồi → "Đã bị thu hồi"', async () => {
    const view = await render(<SkillProgressRow item={makeItem({ myBadge: { revoked: false, unlockedAt: '2026-09-12T00:00:00Z' } })} onPress={jest.fn()} />);
    expect(screen.getByText('Đã đạt')).toBeOnTheScreen();
    await view.rerender(<SkillProgressRow item={makeItem({ myBadge: { revoked: true, unlockedAt: '2026-09-12T00:00:00Z' } })} onPress={jest.fn()} />);
    expect(screen.getByText('Đã bị thu hồi')).toBeOnTheScreen();
  });

  it('vượt ngưỡng task → vẫn hiện tối đa "50/50 task"', async () => {
    const item = makeItem();
    await render(<SkillProgressRow item={{ ...item, myProgress: { ...item.myProgress, tasksDone: 61 } }} onPress={jest.fn()} />);
    expect(screen.getByText('50/50 task')).toBeOnTheScreen();
  });
});

describe('skill-text', () => {
  it('câu tracker và tiêu chí dạng chữ (số kiểu Việt)', () => {
    expect(remainingText(makeItem())).toBe('Còn 18 task ReactJS · 0,3 điểm review');
    expect(remainingText(makeItem({ myProgress: { ...makeItem().myProgress, achieved: true } }))).toBeNull();
    expect(criteriaLines('ReactJS', { minAvgPeerScore: 8, minStoryPoints: 2.5, requireReview: true, requiredTasksDone: 50 })).toEqual([
      '50 task Done gắn nhãn ReactJS',
      'Tổng story points ≥ 2,5',
      'Điểm review trung bình ≥ 8',
      'Mọi task phải qua chấm chéo',
    ]);
    expect(closeness(makeItem())).toBeCloseTo(0.64);
  });
});
