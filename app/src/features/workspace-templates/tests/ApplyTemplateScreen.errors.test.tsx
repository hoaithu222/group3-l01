import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { ApplyTemplateScreen } from '../screens/ApplyTemplateScreen';
import {
  APPLIED,
  applyButton,
  mockedApply,
  mockedList,
  pickTemplate,
  resetApplyMocks,
} from './apply-harness';
import { apiError, networkError, renderWithProviders, TEMPLATES } from './fixtures';

/**
 * Màn "Áp mẫu cho nhóm" — lỗi `TPL_*` hiện TẠI CHỖ (nhãn nằm trong feature) và vòng đời `Idempotency-Key` (app.md p5-04 §4/§8).
 * ⚠️ BE `idempotency.ts` lưu MỌI phản hồi có mã < 500 (kể cả 4xx) 24 giờ theo khoá: gửi lại CÙNG khoá sau `TPL_003` là nhận lại
 * đúng câu lỗi cũ dù người dùng đã bỏ bớt kênh. Mất mạng/5xx thì BE không lưu gì — giữ khoá để thử lại an toàn. Luồng chính:
 * `ApplyTemplateScreen.test.tsx`.
 */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ wsId: 'ws-1' })),
}));
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn(() => true) }));
jest.mock('@/core/socket', () => ({
  ...jest.requireActual('@/core/socket'),
  useConnectionState: jest.fn(),
}));
jest.mock('../api/workspace-templates.service', () => ({
  workspaceTemplatesService: {
    apply: jest.fn(),
    getWorkspaceHead: jest.fn(),
    list: jest.fn(),
    listChannelNames: jest.fn(),
  },
}));

beforeEach(resetApplyMocks);

const sentKeys = () => mockedApply.mock.calls.map((call) => call[1].idempotencyKey);

describe('ApplyTemplateScreen — lỗi', () => {
  it('TPL_003 (vượt số kênh): câu tiếng Việt của feature; đổi tập kênh rồi áp lại dùng khoá MỚI và thành công', async () => {
    mockedApply.mockRejectedValueOnce(apiError(409, 'TPL_003')).mockResolvedValueOnce(APPLIED);
    await renderWithProviders(<ApplyTemplateScreen />);
    await pickTemplate('Nhóm môn học');

    await fireEvent.press(applyButton());
    expect(await screen.findByText(/Nhóm đã đạt số kênh tối đa/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('checkbox', { name: /Kênh Thảo luận/ }));
    expect(screen.queryByText(/Nhóm đã đạt số kênh tối đa/)).toBeNull();
    await fireEvent.press(applyButton());

    expect(await screen.findByText('Đã tạo (1)')).toBeOnTheScreen();
    expect(mockedApply.mock.calls[1]?.[1].channelKeys).toEqual(['thong-bao']);
    expect(new Set(sentKeys()).size).toBe(2);
  });

  it('TPL_003 rồi áp lại CÙNG lựa chọn: vẫn khoá MỚI (BE đã lưu câu 409 dưới khoá cũ)', async () => {
    mockedApply
      .mockRejectedValueOnce(apiError(409, 'TPL_003'))
      .mockRejectedValueOnce(apiError(409, 'TPL_003'));
    await renderWithProviders(<ApplyTemplateScreen />);
    await pickTemplate('Nhóm môn học');

    await fireEvent.press(applyButton());
    await screen.findByText(/Nhóm đã đạt số kênh tối đa/);
    await fireEvent.press(applyButton());

    await waitFor(() => expect(mockedApply).toHaveBeenCalledTimes(2));
    expect(new Set(sentKeys()).size).toBe(2);
  });

  it('mất mạng giữa chừng: thử lại dùng CÙNG khoá (BE không lưu gì) ⇒ nhận đúng kết quả của lượt đầu nếu nó đã chạy', async () => {
    mockedApply.mockRejectedValueOnce(networkError()).mockResolvedValueOnce(APPLIED);
    await renderWithProviders(<ApplyTemplateScreen />);
    await pickTemplate('Nhóm môn học');

    await fireEvent.press(applyButton());
    await waitFor(() => expect(mockedApply).toHaveBeenCalledTimes(1));
    await fireEvent.press(await screen.findByRole('button', { name: 'Áp mẫu' }));

    expect(await screen.findByText('Đã tạo (1)')).toBeOnTheScreen();
    expect(new Set(sentKeys()).size).toBe(1);
  });

  it('TPL_001 (mẫu vừa bị tắt): báo, bỏ lựa chọn, TẢI LẠI danh sách mẫu; nút khoá tới khi chọn mẫu khác', async () => {
    mockedApply.mockRejectedValueOnce(apiError(404, 'TPL_001'));
    await renderWithProviders(<ApplyTemplateScreen />);
    await pickTemplate('Nhóm môn học');
    mockedList.mockResolvedValue(TEMPLATES.slice(1));

    await fireEvent.press(applyButton());

    expect(await screen.findByText(/Mẫu này không còn dùng được/)).toBeOnTheScreen();
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Nhóm môn học')).toBeNull());
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(applyButton()).toBeDisabled();
  });

  it('TPL_002 / 403 / 429 / CFG_005: mỗi mã một câu TẠI CHỖ (khối lỗi trong màn), không rời màn', async () => {
    const cases: [ReturnType<typeof apiError>, RegExp][] = [
      [apiError(409, 'TPL_002'), /Nhóm đã lưu trữ nên không áp được mẫu\./],
      [apiError(403, 'PERM_403'), /Chỉ chủ nhóm và quản trị viên áp được mẫu\./],
      [apiError(429, 'RATE_002'), /áp mẫu quá nhiều lần/],
      [apiError(404, 'CFG_005'), /Mẫu nhóm hiện chưa được bật\./],
    ];
    for (const [error, message] of cases) {
      mockedApply.mockReset().mockRejectedValue(error);
      const view = await renderWithProviders(<ApplyTemplateScreen />);
      await pickTemplate('Nhóm môn học');

      await fireEvent.press(applyButton());

      expect(await screen.findByText(message)).toBeOnTheScreen();
      await view.unmount();
    }
  });
});
