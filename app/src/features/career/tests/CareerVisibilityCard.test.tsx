import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { showToast } from '@/shared/utils/toast.utils';

import { careerService } from '../api/career.service';
import type { CareerProfile } from '../api/career.types';
import { CareerVisibilityCard } from '../components/CareerVisibilityCard';
import { careerKeys } from '../queries/career.keys';
import { httpError, makeClient, renderWithClient } from './fixtures';

/**
 * app.md p6-06 §4, §8: công tắc quyền riêng tư đổi LẠC QUAN; lỗi ⇒ trả về giá trị cũ + toast. PUT gửi ĐỦ bộ công tắc (BE thay cả khối).
 */
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const PROFILE: CareerProfile = {
  headline: null,
  location: null,
  openToWork: false,
  preferredRoles: [],
  visibility: { appearInOthersPortfolios: false, proofTitles: false, showContribution: false, showQuiz: false, showSkills: true },
};

const update = jest.spyOn(careerService, 'updateVisibility');
jest.spyOn(careerService, 'myCareer').mockResolvedValue(PROFILE);

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

beforeEach(() => jest.clearAllMocks());

describe('CareerVisibilityCard', () => {
  it('bật "Hiện tiêu đề task" → PUT đủ bộ công tắc; thành công giữ BẬT', async () => {
    update.mockResolvedValue({ ...PROFILE, visibility: { ...PROFILE.visibility, proofTitles: true } });
    const client = makeClient();
    client.setQueryData(careerKeys.me(), PROFILE);
    await renderWithClient(<CareerVisibilityCard />, client);
    await settle();
    await fireEvent.press(screen.getByRole('switch', { name: /Hiện tiêu đề task trong minh chứng/ }));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ ...PROFILE.visibility, proofTitles: true }));
    await settle();
    expect(client.getQueryData<CareerProfile>(careerKeys.me())?.visibility.proofTitles).toBe(true);
  });

  it('lỗi → trả về giá trị cũ + toast', async () => {
    update.mockRejectedValue(httpError(500, 'SYS_500'));
    const client = makeClient();
    client.setQueryData(careerKeys.me(), PROFILE);
    await renderWithClient(<CareerVisibilityCard />, client);
    await settle();
    await fireEvent.press(screen.getByRole('switch', { name: /Cho thành viên nhóm xem huy hiệu/ }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('error', 'Chưa lưu được cài đặt riêng tư, thử lại'));
    await settle();
    expect(client.getQueryData<CareerProfile>(careerKeys.me())?.visibility.showSkills).toBe(true);
  });
});
