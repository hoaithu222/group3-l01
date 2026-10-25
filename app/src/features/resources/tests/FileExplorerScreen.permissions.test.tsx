import { fireEvent, screen } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { useAuthStore } from '@/shell/store/slices/auth';

import { foldersService } from '../api/folders.service';
import { resourcesService } from '../api/resources.service';
import { FileExplorerScreen } from '../screens/FileExplorerScreen';
import { makeResource } from './fixtures';
import { renderWithProviders } from './render-helpers';

/** FileExplorer — nút và menu "⋯" theo QUYỀN/chủ sở hữu (không `toHaveStyle`, chỉ hành vi). */

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

type Role = 'ADMIN' | 'GUEST' | 'MEMBER' | 'OWNER';

function arrange(options: {
  files?: ReturnType<typeof makeResource>[];
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
    items: options.files ?? [],
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

describe('FileExplorerScreen — trạng thái rỗng theo quyền', () => {
  it('MEMBER: trạng thái rỗng chỉ có MỘT CTA "Thêm tài liệu", bấm mở menu có "Tải tệp lên" + "Tạo thư mục"', async () => {
    arrange({ role: 'MEMBER' });
    await renderWithProviders(<FileExplorerScreen />);

    expect(await screen.findByText('Chưa có tài liệu')).toBeOnTheScreen();
    // Không còn hai nút rời "Tải lên"/"Tạo thư mục" lặp lại menu của nút "+".
    expect(screen.queryByText('Tải lên')).toBeNull();
    expect(screen.queryByText('Tạo thư mục')).toBeNull();

    await fireEvent.press(screen.getByText('Thêm tài liệu'));
    expect(await screen.findByText('Tải tệp lên')).toBeOnTheScreen();
    expect(screen.getByText('Tạo thư mục')).toBeOnTheScreen();
  });

  it('workspace ARCHIVED (chỉ xem/tải) ⇒ không có nút tạo nào, cả nút "+" trên AppBar', async () => {
    arrange({ role: 'OWNER', status: 'ARCHIVED' });
    await renderWithProviders(<FileExplorerScreen />);

    expect(await screen.findByText('Chưa có tài liệu')).toBeOnTheScreen();
    expect(screen.queryByText('Thêm tài liệu')).toBeNull();
    expect(screen.queryByText('Tạo thư mục')).toBeNull();
    expect(screen.queryByLabelText('Thêm vào kho')).toBeNull();
  });
});

describe('FileExplorerScreen — menu hành động theo cờ canModify của BE', () => {
  // BE tính `canModify` (MEMBER: chỉ của mình; OWNER/ADMIN: mọi mục) — test cấp cờ đúng như BE trả.
  const others = makeResource({
    canModify: false,
    id: 'r-other',
    name: 'Của người khác.pdf',
    uploadedBy: { avatarUrl: null, id: 'someone', name: 'Bình' },
  });
  const mine = makeResource({
    id: 'r-mine',
    name: 'Của tôi.pdf',
    uploadedBy: { avatarUrl: null, id: 'me', name: 'Tôi' },
  });

  it('MEMBER: tệp người khác KHÔNG có "Xoá"/"Đổi tên"; tệp của mình có', async () => {
    arrange({ files: [others, mine], role: 'MEMBER' });
    await renderWithProviders(<FileExplorerScreen />);

    await fireEvent.press(await screen.findByLabelText('Thêm thao tác cho Của người khác.pdf'));
    expect(await screen.findByText('Chia sẻ')).toBeOnTheScreen();
    expect(screen.queryByText('Xoá')).toBeNull();
    expect(screen.queryByText('Đổi tên')).toBeNull();
  });

  it('MEMBER: menu tệp của mình có "Xoá" và "Đổi tên"', async () => {
    arrange({ files: [mine], role: 'MEMBER' });
    await renderWithProviders(<FileExplorerScreen />);

    await fireEvent.press(await screen.findByLabelText('Thêm thao tác cho Của tôi.pdf'));
    expect(await screen.findByText('Xoá')).toBeOnTheScreen();
    expect(screen.getByText('Đổi tên')).toBeOnTheScreen();
  });

  it('OWNER xoá được tệp người khác', async () => {
    arrange({ files: [{ ...others, canModify: true }], role: 'OWNER' });
    await renderWithProviders(<FileExplorerScreen />);

    await fireEvent.press(await screen.findByLabelText('Thêm thao tác cho Của người khác.pdf'));
    expect(await screen.findByText('Xoá')).toBeOnTheScreen();
  });

  it('chạm tệp mở màn xem trước đúng route', async () => {
    arrange({ files: [mine], role: 'MEMBER' });
    await renderWithProviders(<FileExplorerScreen />);

    await fireEvent.press(await screen.findByLabelText(/^Của tôi\.pdf, PDF/));
    expect(mockedRouter.push).toHaveBeenCalledWith({
      params: { resourceId: 'r-mine', wsId: 'ws-1' },
      pathname: '/workspaces/[wsId]/resources/preview/[resourceId]',
    });
  });
});
