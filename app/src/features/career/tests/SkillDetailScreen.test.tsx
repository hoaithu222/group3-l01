import { screen } from '@testing-library/react-native';

import { careerService } from '../api/career.service';
import { SkillDetailScreen } from '../screens/SkillDetailScreen';
import { httpError, makeItem, renderWithClient } from './fixtures';

/**
 * app.md p6-06 §3: chi tiết kỹ năng — tiêu chí dạng chữ, nhãn khớp, tiến độ từng tiêu chí có SỐ + chữ, mẹo gắn nhãn; 404 ⇒ "Kỹ năng không còn"
 * (không nút thử lại — thử lại cũng vậy).
 */
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({ skillId: 'skill-react' }) }));

const skill = jest.spyOn(careerService, 'skill');
jest.spyOn(careerService, 'mySkills').mockResolvedValue([]);

beforeEach(() => jest.clearAllMocks());

describe('SkillDetailScreen', () => {
  it('tiêu chí + tiến độ từng tiêu chí + mẹo', async () => {
    skill.mockResolvedValue(makeItem());
    await renderWithClient(<SkillDetailScreen />);
    expect(await screen.findByText('• 50 task Done gắn nhãn ReactJS')).toBeOnTheScreen();
    expect(screen.getByText('• Điểm review trung bình ≥ 8')).toBeOnTheScreen();
    expect(screen.getByText('Nhãn task được tính: reactjs')).toBeOnTheScreen();
    expect(screen.getByText('32/50 task')).toBeOnTheScreen();
    expect(screen.getByText('Review TB 7,7/8')).toBeOnTheScreen();
    expect(screen.getByText('Còn 18 task ReactJS · 0,3 điểm review')).toBeOnTheScreen();
    expect(screen.getByText(/Mẹo: gắn nhãn ReactJS/)).toBeOnTheScreen();
  });

  it('404 → "Kỹ năng không còn", không nút thử lại', async () => {
    skill.mockRejectedValue(httpError(404, 'RES_001'));
    await renderWithClient(<SkillDetailScreen />);
    expect(await screen.findByText('Kỹ năng không còn')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
  });
});
