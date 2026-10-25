import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { ProfileRowsSlot } from '@/shared/profile';
import { useFeature } from '@/shell/capabilities';

import { jobSettingsService } from '../api/career-settings.service';
import { careerService } from '../api/career.service';
import { CareerHomeScreen } from '../screens/CareerHomeScreen';
import '../register-profile';
import { makeBadge, makeItem, renderWithClient } from './fixtures';

/**
 * app.md p6-06 §1, §3: màn Nghề nghiệp — chưa có huy hiệu ⇒ lời mời "Hoàn thành task có gắn nhãn kỹ năng…" + lối vào danh mục; có huy hiệu ⇒
 * hàng huy hiệu + thẻ; tracker 3 kỹ năng gần đạt nhất. Hàng "Nghề nghiệp" ở màn Tôi đi qua khe `@/shared/profile`, ẩn khi cờ `career` tắt.
 */
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn() }));

const skills = jest.spyOn(careerService, 'skills');
const mine = jest.spyOn(careerService, 'mySkills');
jest.spyOn(careerService, 'myCareer').mockRejectedValue(new Error('không cần trong test này'));
// p6-08: màn có thêm thẻ "Tìm việc" (`JobEntryCards`) tự hỏi `GET /me/career/job-settings` — giữ test kín, không cho gọi mạng thật.
jest.spyOn(jobSettingsService, 'get').mockRejectedValue(new Error('không cần trong test này'));

beforeEach(() => {
  jest.clearAllMocks();
  (useFeature as jest.Mock).mockReturnValue(true);
});

describe('CareerHomeScreen', () => {
  it('chưa có huy hiệu → lời mời + "Xem danh mục kỹ năng"; tracker "Sắp đạt" có câu còn thiếu', async () => {
    skills.mockResolvedValue([makeItem(), makeItem({ id: 'skill-node', name: 'Node.js' })]);
    mine.mockResolvedValue([]);
    await renderWithClient(<CareerHomeScreen />);
    expect(await screen.findByText('Hoàn thành task có gắn nhãn kỹ năng để nhận huy hiệu đầu tiên.')).toBeOnTheScreen();
    expect(screen.getByText('Còn 18 task ReactJS · 0,3 điểm review')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Xem danh mục kỹ năng' }));
    expect(router.push).toHaveBeenCalledWith('/me/career/skills');
  });

  it('có huy hiệu → thẻ huy hiệu với ngày đạt; kỹ năng đã đạt không nằm trong tracker', async () => {
    skills.mockResolvedValue([makeItem({ myBadge: { revoked: false, unlockedAt: '2026-09-12T03:00:00.000Z' } })]);
    mine.mockResolvedValue([makeBadge()]);
    await renderWithClient(<CareerHomeScreen />);
    expect(await screen.findByRole('button', { name: /Huy hiệu kỹ năng xác thực ReactJS, Frontend, Đạt 12\/09\/2026/ })).toBeOnTheScreen();
    expect(screen.queryByText('Sắp đạt')).toBeNull();
  });
});

describe('hàng "Nghề nghiệp" ở màn Tôi (khe @/shared/profile)', () => {
  it('cờ bật → có hàng, bấm mở /me/career; cờ tắt/chưa biết → ẩn', async () => {
    const view = await render(<ProfileRowsSlot />);
    await fireEvent.press(screen.getByText('Nghề nghiệp'));
    expect(router.push).toHaveBeenCalledWith('/me/career');
    (useFeature as jest.Mock).mockReturnValue(undefined);
    await view.rerender(<ProfileRowsSlot />);
    expect(screen.queryByText('Nghề nghiệp')).toBeNull();
  });
});
