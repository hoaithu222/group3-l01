import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { portfolioService } from '../api/portfolio.service';
import { SlugField } from '../components/portfolio/SlugField';
import { makePortfolio } from './portfolio.fixtures';
import { apiError, renderWithClient } from './portfolio.harness';

/**
 * app.md p6-07 §3, §8 `SlugField`: 3 trạng thái theo `slug-available` (Có thể dùng / Đã có người dùng / Chứa từ không được phép) + Dành riêng; kiểm SAU debounce 500 ms và CHỈ khi slug đã
 * đúng dạng ở máy; đổi slug gửi `expectedVersion` của form; lỗi lúc lưu (`PORT_001` đua slug) hiện ngay trong khối.
 */
jest.mock('@/shell/capabilities', () => ({
  useCapabilities: () => ({ data: undefined }),
  useFeature: () => true,
}));

const available = jest.spyOn(portfolioService, 'slugAvailable');
const changeSlug = jest.spyOn(portfolioService, 'changeSlug');
const onSaved = jest.fn();

const settle = (ms = 650) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

async function typeSlug(text: string) {
  await renderWithClient(
    <SlugField offline={false} portfolio={makePortfolio()} version={3} onSaved={onSaved} />,
  );
  await fireEvent.changeText(screen.getByPlaceholderText('ten-cua-ban'), text);
  await settle();
}

/** Chờ tới khi server báo dùng được (nút mới mở khoá) rồi mới bấm — nút vẫn TỒN TẠI lúc còn khoá và bấm vào đó là không làm gì, nên không được bấm ngay khi tìm thấy nó. */
async function pressChange() {
  await screen.findByText('Có thể dùng.', {}, { timeout: 4000 });
  await fireEvent.press(screen.getByRole('button', { name: 'Đổi đường dẫn' }));
}

beforeEach(() => jest.clearAllMocks());

describe('SlugField', () => {
  it('Có thể dùng ⇒ hiện câu xác nhận, nút "Đổi đường dẫn" mở khoá; hỏi ĐÚNG MỘT lần sau debounce', async () => {
    available.mockResolvedValue({ available: true });
    await typeSlug('an-nguyen');
    expect(await screen.findByText('Có thể dùng.')).toBeOnTheScreen();
    expect(available).toHaveBeenCalledTimes(1);
    expect(available).toHaveBeenCalledWith('an-nguyen');
    expect(screen.getByRole('button', { name: 'Đổi đường dẫn' })).toBeEnabled();
  });

  it.each([
    ['TAKEN', 'Đã có người dùng đường dẫn này.'],
    ['BANNED', 'Đường dẫn chứa từ không được phép.'],
    ['RESERVED', 'Đường dẫn này được dành riêng, hãy chọn đường dẫn khác.'],
  ] as const)('không dùng được (%s) ⇒ câu tiếng Việt + khoá nút', async (reason, message) => {
    available.mockResolvedValue({ available: false, reason });
    await typeSlug('admin-vci');
    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Đổi đường dẫn' })).toBeDisabled();
  });

  it('sai dạng ở máy (chữ hoa, dấu cách, `--`) ⇒ báo PORT_002 NGAY, KHÔNG tốn lượt gọi server', async () => {
    await typeSlug('An  Dev!!');
    expect(await screen.findByText(/chữ thường, số và dấu gạch ngang/)).toBeOnTheScreen();
    expect(available).not.toHaveBeenCalled();
  });

  it('lưu ⇒ PUT slug kèm expectedVersion của form; thành công gọi onSaved với hồ sơ mới', async () => {
    available.mockResolvedValue({ available: true });
    changeSlug.mockResolvedValue(makePortfolio({ slug: 'an-nguyen', version: 4 }));
    await typeSlug('an-nguyen');
    await pressChange();
    await waitFor(() => expect(changeSlug).toHaveBeenCalledWith('an-nguyen', 3));
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'an-nguyen', version: 4 }),
      ),
    );
  });

  it('lượt lưu bị PORT_001 (người khác chiếm trước) ⇒ câu lỗi trong khối, không toast, không onSaved', async () => {
    available.mockResolvedValue({ available: true });
    changeSlug.mockRejectedValue(apiError(409, 'PORT_001'));
    await typeSlug('an-nguyen');
    await pressChange();
    expect(
      await screen.findByText('Đường dẫn này đã có người dùng, hãy chọn đường dẫn khác.'),
    ).toBeOnTheScreen();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
