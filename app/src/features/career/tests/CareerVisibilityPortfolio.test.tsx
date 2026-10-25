import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { showToast } from '@/shared/utils/toast.utils';

import { careerService } from '../api/career.service';
import type { CareerProfile } from '../api/career.types';
import { CareerVisibilityCard } from '../components/CareerVisibilityCard';
import { careerKeys } from '../queries/career.keys';
import { httpError, makeClient, renderWithClient } from './fixtures';

/**
 * app.md p6-07 §3 "Quyền riêng tư đồng đội": hai công tắc của Portfolio trong `CareerVisibilityCard` — "Cho đồng đội hiện tên tôi trong portfolio của họ" (`appearInOthersPortfolios`) và "Hiện điểm đóng góp
 * trong portfolio của tôi" (`showContribution`). Cả hai mặc định TẮT; PUT gửi ĐỦ bộ công tắc (BE thay cả khối); lỗi ⇒ trả về giá trị cũ + toast.
 */
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));

const PROFILE: CareerProfile = {
  headline: null,
  location: null,
  openToWork: false,
  preferredRoles: [],
  visibility: {
    appearInOthersPortfolios: false,
    proofTitles: false,
    showContribution: false,
    showQuiz: false,
    showSkills: true,
  },
};

const update = jest.spyOn(careerService, 'updateVisibility');
jest.spyOn(careerService, 'myCareer').mockResolvedValue(PROFILE);

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

async function renderCard() {
  const client = makeClient();
  client.setQueryData(careerKeys.me(), PROFILE);
  await renderWithClient(<CareerVisibilityCard />, client);
  await settle();
  return client;
}

beforeEach(() => jest.clearAllMocks());

describe('công tắc quyền riêng tư của Portfolio', () => {
  it('mặc định TẮT; bật "hiện tên tôi trong portfolio của đồng đội" ⇒ PUT đủ bộ công tắc với appearInOthersPortfolios: true', async () => {
    update.mockResolvedValue({
      ...PROFILE,
      visibility: { ...PROFILE.visibility, appearInOthersPortfolios: true },
    });
    const client = await renderCard();
    const toggle = screen.getByRole('switch', {
      name: /Cho đồng đội hiện tên tôi trong portfolio của họ/,
    });
    expect(toggle).not.toBeSelected();
    await fireEvent.press(toggle);
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        ...PROFILE.visibility,
        appearInOthersPortfolios: true,
      }),
    );
    await settle();
    expect(
      client.getQueryData<CareerProfile>(careerKeys.me())?.visibility.appearInOthersPortfolios,
    ).toBe(true);
  });

  it('bật "Hiện điểm đóng góp trong portfolio của tôi" ⇒ showContribution: true (không có nó % đóng góp không bao giờ lên trang)', async () => {
    update.mockResolvedValue({
      ...PROFILE,
      visibility: { ...PROFILE.visibility, showContribution: true },
    });
    await renderCard();
    await fireEvent.press(
      screen.getByRole('switch', { name: /Hiện điểm đóng góp trong portfolio của tôi/ }),
    );
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({ ...PROFILE.visibility, showContribution: true }),
    );
  });

  it('lỗi ⇒ công tắc trả về giá trị cũ + toast', async () => {
    update.mockRejectedValue(httpError(500, 'SYS_500'));
    const client = await renderCard();
    await fireEvent.press(
      screen.getByRole('switch', { name: /Cho đồng đội hiện tên tôi trong portfolio của họ/ }),
    );
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('error', 'Chưa lưu được cài đặt riêng tư, thử lại'),
    );
    await settle();
    expect(
      client.getQueryData<CareerProfile>(careerKeys.me())?.visibility.appearInOthersPortfolios,
    ).toBe(false);
  });
});
