import { screen, userEvent, waitFor } from '@testing-library/react-native';

import { ResourcePreviewScreen } from '../screens/ResourcePreviewScreen';
import { renderWithProviders } from './render-helpers';

/**
 * Xem trước tệp: "Thông tin tệp" và "Mở bằng ứng dụng khác" gom vào MỘT menu "⋯" của thanh tiêu đề (thanh dưới chỉ còn
 * Tải về/Chia sẻ). Thân xem trước và các hook mạng được giả — đã có test riêng; ở đây chỉ kiểm bố cục hành động.
 */
jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest'),
);
jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ resourceId: 'r-1', wsId: 'ws-1' }),
}));
jest.mock('../components/preview/PreviewBody', () => ({ PreviewBody: () => null }));
jest.mock('../utils/resource-files', () => ({ removeResourceCache: jest.fn(async () => undefined) }));

const mockRun = jest.fn();
jest.mock('../hooks/useResourceFileActions', () => ({
  useResourceFileActions: () => ({ busy: null, progress: 0, run: mockRun }),
}));
let mockOnline = true;
jest.mock('../hooks/useIsOnline', () => ({ useIsOnline: () => mockOnline }));
jest.mock('../hooks/useMeteredConnection', () => ({ useMeteredConnection: () => false }));
jest.mock('../queries/resources.queries', () => ({
  useResource: () => ({
    data: jest.requireActual('./fixtures').makeResource({ id: 'r-1', name: 'Báo cáo.pdf' }),
    isError: false,
    isLoading: false,
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockOnline = true;
});

const openMenu = () =>
  userEvent.press(screen.getByRole('button', { name: 'Thêm thao tác cho tệp' }));

describe('ResourcePreviewScreen — hành động ở thanh tiêu đề và thanh dưới', () => {
  it('thanh dưới chỉ còn "Tải về"/"Chia sẻ"; "Mở ngoài" không còn là nút', async () => {
    await renderWithProviders(<ResourcePreviewScreen />);

    expect(await screen.findByRole('button', { name: 'Tải về' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Chia sẻ' })).toBeOnTheScreen();
    expect(screen.queryByText('Mở ngoài')).toBeNull();
    expect(screen.queryByLabelText('Thông tin tệp')).toBeNull();
  });

  it('menu "⋯": "Mở bằng ứng dụng khác" chạy hành động `open`', async () => {
    await renderWithProviders(<ResourcePreviewScreen />);

    await screen.findByRole('button', { name: 'Tải về' });
    await openMenu();
    await userEvent.press(await screen.findByText('Mở bằng ứng dụng khác'));

    await waitFor(() => expect(mockRun).toHaveBeenCalledWith('open'));
  });

  it('menu "⋯": "Thông tin tệp" mở tấm thông tin với tên đầy đủ', async () => {
    await renderWithProviders(<ResourcePreviewScreen />);

    await screen.findByRole('button', { name: 'Tải về' });
    await openMenu();
    await userEvent.press(await screen.findByText('Thông tin tệp'));

    expect(await screen.findByText('Dung lượng')).toBeOnTheScreen();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('ngoại tuyến ⇒ "Mở bằng ứng dụng khác" bị khoá kèm lý do và không chạy', async () => {
    mockOnline = false;
    await renderWithProviders(<ResourcePreviewScreen />);

    await screen.findByRole('button', { name: 'Tải về' });
    await openMenu();
    await userEvent.press(await screen.findByText('Mở bằng ứng dụng khác'));

    expect(screen.getByText('Cần kết nối mạng')).toBeOnTheScreen();
    expect(mockRun).not.toHaveBeenCalled();
  });
});
