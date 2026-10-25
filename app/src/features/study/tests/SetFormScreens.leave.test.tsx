import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { studyService } from '../api/study.service';
import { CreateSetScreen } from '../screens/CreateSetScreen';
import { EditSetInfoScreen } from '../screens/EditSetInfoScreen';
import { makeSet } from './fixtures';
import { renderWithProviders } from './render-helpers';

/** Rời form tạo/sửa thông tin bộ khi còn thay đổi ⇒ hỏi "Bỏ thay đổi?" (chưa gõ gì thì rời thẳng); ngoại tuyến khoá nút gửi. */
const mockConnection = { state: 'connected' };
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ setId: 's1' }),
}));
jest.mock('@/core/socket', () => ({ useConnectionState: () => mockConnection.state }));
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }) }));
jest.mock('../api/study.service', () => ({
  studyService: { create: jest.fn(), get: jest.fn(), patch: jest.fn(), workspaceAccess: jest.fn() },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockConnection.state = 'connected';
  jest.mocked(studyService.get).mockResolvedValue(makeSet());
});

describe('CreateSetScreen — rời form', () => {
  it('chưa gõ gì ⇒ quay lại thẳng, không hỏi', async () => {
    await renderWithProviders(<CreateSetScreen />);

    await fireEvent.press(await screen.findByLabelText('Quay lại'));

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Bỏ thay đổi?')).toBeNull();
  });

  it('đã gõ tiêu đề ⇒ hỏi; "Tiếp tục sửa" ở lại (giữ chữ), "Bỏ thay đổi" mới thoát', async () => {
    await renderWithProviders(<CreateSetScreen />);
    await fireEvent.changeText(await screen.findByLabelText(/Tiêu đề/), 'Bộ đang soạn');

    await fireEvent.press(screen.getByLabelText('Quay lại'));
    expect(await screen.findByText('Bỏ thay đổi?')).toBeOnTheScreen();
    expect(router.back).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText('Tiếp tục sửa'));
    expect(router.back).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Bộ đang soạn')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Quay lại'));
    await fireEvent.press(await screen.findByText('Bỏ thay đổi'));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('chỉ đổi phạm vi (không gõ chữ) cũng tính là thay đổi', async () => {
    await renderWithProviders(<CreateSetScreen />);
    await fireEvent.press(await screen.findByText('Công khai'));

    await fireEvent.press(screen.getByLabelText('Quay lại'));

    expect(await screen.findByText('Bỏ thay đổi?')).toBeOnTheScreen();
  });

  it('ngoại tuyến ⇒ nút "Tạo bộ học" bị khoá', async () => {
    mockConnection.state = 'offline';
    await renderWithProviders(<CreateSetScreen />);

    expect(await screen.findByText(/Đang ngoại tuyến/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Tạo bộ học' })).toBeDisabled();
  });
});

describe('EditSetInfoScreen — rời form', () => {
  it('sửa tiêu đề rồi quay lại ⇒ hỏi "Bỏ thay đổi?"; nội dung nạp từ server chưa sửa thì rời thẳng', async () => {
    await renderWithProviders(<EditSetInfoScreen />);
    const title = await screen.findByLabelText(/Tiêu đề/);

    await fireEvent.press(screen.getByLabelText('Quay lại'));
    expect(router.back).toHaveBeenCalledTimes(1);

    await fireEvent.changeText(title, 'Tên khác');
    await fireEvent.press(screen.getByLabelText('Quay lại'));

    expect(await screen.findByText('Bỏ thay đổi?')).toBeOnTheScreen();
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
