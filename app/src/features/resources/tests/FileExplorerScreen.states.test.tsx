import NetInfo from '@react-native-community/netinfo';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { useAuthStore } from '@/shell/store/slices/auth';

import { foldersService } from '../api/folders.service';
import { resourcesService } from '../api/resources.service';
import { FileExplorerScreen } from '../screens/FileExplorerScreen';
import { makeFolder } from './fixtures';
import { renderWithProviders } from './render-helpers';

/** FileExplorer — ngoại tuyến, breadcrumb điều hướng đúng route, lỗi và mất quyền. */

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));
jest.mock('expo-media-library', () => ({
  Asset: { create: jest.fn() },
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(),
}));
jest.mock('@/shell/capabilities', () => ({
  useCapabilities: () => ({ data: undefined }),
  useFeature: () => true,
}));
jest.mock('@/core/media/pick-media', () => ({
  pickDocuments: jest.fn(async () => []),
  pickImages: jest.fn(async () => []),
  pickVideo: jest.fn(async () => null),
  takePhoto: jest.fn(async () => null),
}));
jest.mock('../api/folders.service', () => ({
  foldersService: {
    create: jest.fn(),
    list: jest.fn(),
    remove: jest.fn(),
    restore: jest.fn(),
    update: jest.fn(),
  },
}));
jest.mock('../api/resources.service', () => ({
  MIN_SEARCH_LENGTH: 2,
  resourcesService: {
    create: jest.fn(),
    get: jest.fn(),
    list: jest.fn(),
    remove: jest.fn(),
    restore: jest.fn(),
    storage: jest.fn(),
    workspaceAccess: jest.fn(),
  },
}));

const mockedFolders = jest.mocked(foldersService);
const mockedResources = jest.mocked(resourcesService);
const mockedParams = jest.mocked(useLocalSearchParams);
const mockedRouter = jest.mocked(router);
const mockedNetInfo = jest.mocked(NetInfo);

type Role = 'ADMIN' | 'GUEST' | 'MEMBER' | 'OWNER';

function arrange(options: {
  params?: Record<string, string>;
  role?: Role;
  status?: 'ACTIVE' | 'ARCHIVED';
}) {
  mockedParams.mockReturnValue({ wsId: 'ws-1', ...options.params });
  mockedResources.workspaceAccess.mockResolvedValue({
    id: 'ws-1',
    myRole: options.role ?? 'MEMBER',
    name: 'Nhóm',
    status: options.status ?? 'ACTIVE',
  });
  mockedFolders.list.mockResolvedValue({ breadcrumb: [], children: [] });
  mockedResources.list.mockResolvedValue({
    items: [],
    meta: { hasMore: false, limit: 30, nextCursor: null },
  });
  mockedResources.storage.mockResolvedValue({
    byType: [],
    fileCount: 0,
    folderCount: 0,
    quotaBytes: 100,
    quotaSource: 'DEFAULT',
    trashBytes: 0,
    usedBytes: 10,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.getState().setAuth({
    token: 'token',
    user: { email: 'me@x.vn', id: 'me', name: 'Tôi', permissions: [], roles: [] },
  });
});

describe('FileExplorerScreen — ngoại tuyến', () => {
  it('hiện banner và menu "+" báo "Kết nối lại" thay vì cho tải lên', async () => {
    mockedNetInfo.addEventListener.mockImplementation((listener) => {
      listener({ isConnected: false } as Parameters<typeof listener>[0]);
      return jest.fn();
    });
    arrange({ role: 'MEMBER' });
    await renderWithProviders(<FileExplorerScreen />);

    expect(await screen.findByText('Bạn đang ngoại tuyến')).toBeOnTheScreen();
    await fireEvent.press(await screen.findByLabelText('Thêm vào kho'));
    expect(await screen.findByText('Kết nối lại để tải lên hoặc tạo thư mục.')).toBeOnTheScreen();
    expect(screen.queryByText('Tải tệp lên')).toBeNull();

    mockedNetInfo.addEventListener.mockReturnValue(jest.fn());
  });
});

describe('FileExplorerScreen — breadcrumb', () => {
  it('chạm cấp trên gọi điều hướng lên đúng thư mục; chạm "Tài liệu" về gốc', async () => {
    const a = makeFolder({ id: 'a', name: 'Slide' });
    const b = makeFolder({ depth: 2, id: 'b', name: 'Tuần 1', parentId: 'a' });
    arrange({ params: { folderId: 'b' } });
    mockedFolders.list.mockResolvedValue({ breadcrumb: [a], children: [], folder: b });
    await renderWithProviders(<FileExplorerScreen />);

    await fireEvent.press(await screen.findByText('Slide'));
    expect(mockedRouter.dismissTo).toHaveBeenCalledWith({
      params: { folderId: 'a', wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/resources/[folderId]',
    });

    await fireEvent.press(screen.getByText('Tài liệu'));
    expect(mockedRouter.dismissTo).toHaveBeenLastCalledWith({
      params: { wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/resources',
    });
  });

  it('thư mục hiện tại không bấm được (đang đứng ở đó)', async () => {
    const b = makeFolder({ id: 'b', name: 'Tuần 1' });
    arrange({ params: { folderId: 'b' } });
    mockedFolders.list.mockResolvedValue({ breadcrumb: [], children: [], folder: b });
    await renderWithProviders(<FileExplorerScreen />);

    const crumbs = await screen.findAllByText('Tuần 1');
    // Cả tiêu đề AppBar lẫn breadcrumb cùng tên — breadcrumb là phần tử bị khoá.
    const disabled = crumbs.filter(
      (node) => node.parent?.props.accessibilityState?.disabled === true,
    );
    expect(disabled.length).toBeGreaterThan(0);
    await fireEvent.press(disabled[0] as (typeof crumbs)[number]);
    expect(mockedRouter.dismissTo).not.toHaveBeenCalled();
  });
});

describe('FileExplorerScreen — lỗi và mất quyền', () => {
  it('404 ⇒ "Không truy cập được thư mục này"', async () => {
    arrange({ params: { folderId: 'gone' } });
    const notFound = Object.assign(new Error('404'), {
      isAxiosError: true,
      response: { data: {}, status: 404 },
    });
    mockedFolders.list.mockRejectedValue(notFound);
    mockedResources.list.mockRejectedValue(notFound);
    await renderWithProviders(<FileExplorerScreen />);

    expect(await screen.findByText('Không truy cập được thư mục này')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Về nhóm'));
    expect(mockedRouter.replace).toHaveBeenCalledWith({
      params: { wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]',
    });
  });

  it('lỗi tải ⇒ có nút "Thử lại" gọi lại API', async () => {
    arrange({});
    mockedFolders.list.mockRejectedValueOnce(new Error('mạng'));
    await renderWithProviders(<FileExplorerScreen />);

    await fireEvent.press(await screen.findByText('Thử lại'));
    await waitFor(() => expect(mockedFolders.list.mock.calls.length).toBeGreaterThan(1));
  });
});
