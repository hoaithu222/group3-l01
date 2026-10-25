import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import { useAuthStore } from '@/shell/store/slices/auth';

import { foldersService } from '../api/folders.service';
import { resourcesService } from '../api/resources.service';
import { TrashScreen } from '../screens/TrashScreen';
import { makeFolder, makeResource } from './fixtures';
import { renderWithProviders } from './render-helpers';

/** Thùng rác (README p3-01 §6): khôi phục/xoá vĩnh viễn theo quyền, "còn N ngày", xác nhận trước khi xoá hẳn. */

jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useLocalSearchParams: jest.fn() }));
jest.mock('@shopify/flash-list', () => ({
  FlashList: jest.requireActual('react-native').FlatList,
}));
jest.mock('@/shell/capabilities', () => ({ useCapabilities: () => ({ data: undefined }) }));
jest.mock('../api/folders.service', () => ({
  foldersService: { list: jest.fn(), restore: jest.fn() },
}));
jest.mock('../api/resources.service', () => ({
  MIN_SEARCH_LENGTH: 2,
  resourcesService: {
    purge: jest.fn(),
    restore: jest.fn(),
    trash: jest.fn(),
    workspaceAccess: jest.fn(),
  },
}));

const mockedResources = jest.mocked(resourcesService);
const mockedFolders = jest.mocked(foldersService);
const DAY_MS = 24 * 60 * 60 * 1000;
const deletedAt = new Date(Date.now() - 2 * DAY_MS).toISOString();
/** BE cộng số ngày giữ hiệu lực: xoá 2 ngày trước, giữ 30 ngày ⇒ còn 28. */
const purgeAt = new Date(Date.now() + 28 * DAY_MS).toISOString();

const META_ADMIN = { canPurge: true, canRestore: true, purgeAt };
const META_OWN = { canPurge: false, canRestore: true, purgeAt };
const META_OTHERS = { canPurge: false, canRestore: false, purgeAt };

const META_PAGE = { hasMore: false, limit: 30, nextCursor: null };

function trashed<T extends object>(base: T, meta: typeof META_ADMIN) {
  return { ...base, ...meta, deletedAt };
}

const mine = makeResource({
  id: 'r-mine',
  name: 'Của tôi.pdf',
  uploadedBy: { avatarUrl: null, id: 'me', name: 'Tôi' },
});
const others = makeResource({
  id: 'r-other',
  name: 'Của người khác.pdf',
  uploadedBy: { avatarUrl: null, id: 'someone', name: 'Bình' },
});

/** Cờ `canRestore`/`canPurge` do BE tính theo vai trò và chủ sở hữu — test cấp đúng như BE trả. */
function arrange(role: 'ADMIN' | 'MEMBER', resources = [mine, others]) {
  jest.mocked(useLocalSearchParams).mockReturnValue({ wsId: 'ws-1' });
  mockedResources.workspaceAccess.mockResolvedValue({
    id: 'ws-1',
    myRole: role,
    name: 'N',
    status: 'ACTIVE',
  });
  const metaFor = (id: string) => {
    if (role === 'ADMIN') return META_ADMIN;
    return id === 'r-other' ? META_OTHERS : META_OWN;
  };
  mockedResources.trash.mockResolvedValue({
    folders: [trashed(makeFolder({ createdBy: 'me', id: 'f-1', name: 'Thư mục cũ' }), metaFor('f-1'))],
    meta: META_PAGE,
    resources: resources.map((r) => trashed(r, metaFor(r.id))),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.getState().setAuth({
    token: 'token',
    user: { email: 'me@x.vn', id: 'me', name: 'Tôi', permissions: [], roles: [] },
  });
});

describe('TrashScreen', () => {
  it('trống ⇒ "Thùng rác trống"', async () => {
    arrange('MEMBER');
    mockedResources.trash.mockResolvedValue({ folders: [], meta: META_PAGE, resources: [] });
    await renderWithProviders(<TrashScreen />);

    expect(await screen.findByText('Thùng rác trống')).toBeOnTheScreen();
  });

  it('hiện "Còn N ngày" theo 30 ngày lưu giữ', async () => {
    arrange('ADMIN', [mine]);
    await renderWithProviders(<TrashScreen />);

    expect((await screen.findAllByText('Còn 28 ngày')).length).toBeGreaterThan(0);
  });

  it('MEMBER khôi phục được của MÌNH nhưng KHÔNG có "Xoá vĩnh viễn" (chỉ OWNER/ADMIN)', async () => {
    arrange('MEMBER', [mine]);
    await renderWithProviders(<TrashScreen />);

    expect(await screen.findByText('Của tôi.pdf')).toBeOnTheScreen();
    expect(screen.getAllByText('Khôi phục').length).toBeGreaterThan(0);
    // "Xoá vĩnh viễn" nằm trong menu "⋯" của hàng — MEMBER không có cả nút "⋯" đó.
    expect(screen.queryByLabelText('Thêm thao tác cho Của tôi.pdf')).toBeNull();
    expect(screen.queryByText('Xoá vĩnh viễn')).toBeNull();
  });

  it('MEMBER không có nút khôi phục cho tệp của người khác', async () => {
    arrange('MEMBER', [others]);
    await renderWithProviders(<TrashScreen />);

    expect(await screen.findByText('Của người khác.pdf')).toBeOnTheScreen();
    // Chỉ còn nút khôi phục của thư mục (do chính MEMBER tạo), không có của tệp người khác.
    expect(screen.getAllByText('Khôi phục')).toHaveLength(1);
  });

  it('khôi phục tệp gọi đúng API', async () => {
    arrange('ADMIN', [mine]);
    mockedResources.restore.mockResolvedValue(mine);
    await renderWithProviders(<TrashScreen />);

    await screen.findByText('Của tôi.pdf');
    await fireEvent.press(screen.getAllByText('Khôi phục')[1] as never);
    await waitFor(() => expect(mockedResources.restore).toHaveBeenCalledWith('r-mine'));
    expect(mockedFolders.restore).not.toHaveBeenCalled();
  });

  it('ADMIN xoá vĩnh viễn phải QUA hộp thoại xác nhận, rồi gọi API đúng workspace/tệp', async () => {
    arrange('ADMIN', [mine]);
    mockedResources.purge.mockResolvedValue(undefined);
    await renderWithProviders(<TrashScreen />);

    // Xoá vĩnh viễn nằm trong menu "⋯" của hàng (không còn nút đứng sát "Khôi phục") rồi còn hộp thoại xác nhận.
    await fireEvent.press(await screen.findByLabelText('Thêm thao tác cho Của tôi.pdf'));
    await fireEvent.press(await screen.findByText('Xoá vĩnh viễn', { exact: true }));
    expect(mockedResources.purge).not.toHaveBeenCalled();
    expect(await screen.findByText('Xoá vĩnh viễn?')).toBeOnTheScreen();

    await fireEvent.press(screen.getAllByText('Xoá vĩnh viễn').at(-1) as never);
    await waitFor(() => expect(mockedResources.purge).toHaveBeenCalledWith('ws-1', 'r-mine'));
  });

  it('ghi chú lưu giữ là chú thích một dòng (không phải khung cảnh báo chiếm đầu màn)', async () => {
    arrange('ADMIN', [mine]);
    await renderWithProviders(<TrashScreen />);

    expect(await screen.findByText(/được giữ \d+ ngày rồi xoá hẳn/)).toBeOnTheScreen();
  });
});
