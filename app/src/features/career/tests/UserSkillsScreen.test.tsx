import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useToastStore } from '@/shared/ui/feedback/toast-store';

import { careerService } from '../api/career.service';
import { UserSkillsScreen } from '../screens/UserSkillsScreen';
import { httpError, makeBadge, makeProof, renderWithClient } from './fixtures';

/**
 * app.md p6-06 §8: huy hiệu người khác — 404 là "Không chia sẻ huy hiệu" (KHÔNG toast lỗi); chạm thẻ ⇒ minh chứng, `title` null ⇒ "Task ẩn
 * tiêu đề", tên nhóm chỉ hiện khi server trả. Service giả ở tầng `careerService` (interceptor không chạy ⇒ toast nào hiện là do màn tự gọi).
 */
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() }, useLocalSearchParams: () => ({ userId: 'user-khac' }) }));

const userSkills = jest.spyOn(careerService, 'userSkills');
const proof = jest.spyOn(careerService, 'proof');

beforeEach(() => {
  jest.clearAllMocks();
  useToastStore.getState().clear();
});

describe('UserSkillsScreen', () => {
  it('404 → "Không chia sẻ huy hiệu", không nút thử lại, không toast', async () => {
    userSkills.mockRejectedValue(httpError(404, 'RES_001'));
    await renderWithClient(<UserSkillsScreen />);
    expect(await screen.findByText('Không chia sẻ huy hiệu')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('chưa có huy hiệu → "Người này chưa có huy hiệu"', async () => {
    userSkills.mockResolvedValue([]);
    await renderWithClient(<UserSkillsScreen />);
    expect(await screen.findByText('Người này chưa có huy hiệu')).toBeOnTheScreen();
  });

  it('chạm thẻ → minh chứng: "Task ẩn tiêu đề" khi title null; hiện tiêu đề + tên nhóm khi server trả', async () => {
    userSkills.mockResolvedValue([makeBadge()]);
    proof.mockResolvedValue(makeProof());
    await renderWithClient(<UserSkillsScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: /Huy hiệu kỹ năng xác thực ReactJS/ }));
    expect(await screen.findByText('Task ẩn tiêu đề')).toBeOnTheScreen();
    expect(screen.getByText('Trang đăng nhập')).toBeOnTheScreen();
    expect(screen.getByText(/Nhóm Alpha/)).toBeOnTheScreen();
    expect(screen.getByText(/do hệ thống ghi nhận/)).toBeOnTheScreen();
    await waitFor(() => expect(proof).toHaveBeenCalledWith('user-khac', 'skill-react'));
  });
});
