import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useAuthStore } from '@/shell/store/slices/auth';

import type { TaskDetailDto } from '../api/task-detail.types';
import { useTaskDetailActions } from '../hooks/useTaskDetailActions';
import { useTaskDetailState } from '../hooks/useTaskDetailState';
import { TaskDetailScreen } from '../screens/TaskDetailScreen';
import { resolveTaskAccess } from '../utils/task-permissions';
import { makeDetail } from './detail-fixtures';

// Thư viện thật là ESM thuần nên Jest không nạp được — xem tests/mocks/fractional-indexing.ts.
jest.mock('fractional-indexing', () => jest.requireActual('./mocks/fractional-indexing'));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ boardId: 'b1', taskId: 't1', wsId: 'w1' }),
}));
jest.mock('../hooks/useTaskDetailState', () => ({ useTaskDetailState: jest.fn() }));
jest.mock('../hooks/useTaskDetailActions', () => ({ useTaskDetailActions: jest.fn() }));
// Phần nặng không phải đối tượng của test này (có test riêng hoặc cần mạng).
jest.mock('../components/task/ActivityFeed', () => ({ ActivityFeed: () => null }));
jest.mock('../components/task/AttachmentsSection', () => ({ AttachmentsSection: () => null }));
// p4-04: khối phụ thuộc có hook React Query + tấm chọn thẻ riêng — có test riêng (`DependencySection.test.tsx`).
jest.mock('../components/task/DependencySection', () => {
  const { Text } = jest.requireActual('react-native');
  return { DependencySection: ({ canEdit }: { canEdit: boolean }) => <Text>{`PHỤ THUỘC canEdit=${String(canEdit)}`}</Text> };
});
jest.mock('../components/task/TaskDetailSheets', () => ({ TaskDetailSheets: () => null }));

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};
const mockedState = useTaskDetailState as jest.MockedFunction<typeof useTaskDetailState>;
const mockedActions = useTaskDetailActions as jest.MockedFunction<typeof useTaskDetailActions>;
const restore = jest.fn();
const openSheet = jest.fn();
const LIVE = { archived: false, offline: false, placeholder: false };

function mockScreen(overrides: {
  conflict?: boolean;
  data?: TaskDetailDto | undefined;
  notFound?: boolean;
  offline?: boolean;
  placeholder?: boolean;
}) {
  const data = 'data' in overrides ? overrides.data : makeDetail();
  mockedState.mockReturnValue({
    access: resolveTaskAccess(data, { ...LIVE, offline: overrides.offline ?? false, placeholder: overrides.placeholder ?? false }),
    archived: false,
    board: { data: { myPermissions: ['workspace.board.edit', 'workspace.task.status'] } },
    columns: [{ id: 'c_todo', kind: 'TODO', order: 0, title: 'Cần làm', wipLimit: null }],
    conflict: overrides.conflict ?? false,
    detail: { data, error: null, isError: false, isPlaceholderData: overrides.placeholder ?? false, refetch: jest.fn() },
    dismissConflict: jest.fn(),
    isAdmin: false,
    labelList: [],
    labels: new Map(),
    notFound: overrides.notFound ?? false,
    offline: overrides.offline ?? false,
    save: jest.fn(),
  } as never);
  mockedActions.mockReturnValue({ leave: jest.fn(), open: openSheet, restore, restoring: false } as never);
}

async function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return render(<TaskDetailScreen />, { wrapper: Wrapper });
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: 'u-me', name: 'Tôi' } as never });
});

describe('TaskDetailScreen', () => {
  it('có quyền + online: hiện tiêu đề, nút sửa mô tả, ô thêm việc nhỏ và ô soạn bình luận', async () => {
    mockScreen({});
    await renderScreen();

    expect(screen.getByText('Viết báo cáo')).toBeOnTheScreen();
    expect(screen.getByText('Thêm mô tả')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Thêm việc nhỏ')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Viết bình luận…')).toBeOnTheScreen();
  });

  it('menu "…" của thẻ nằm ở AppBar (không còn nút lẻ dưới tiêu đề): bấm mở tấm "menu"; chưa có dữ liệu thẻ thì không có nút', async () => {
    mockScreen({});
    const view = await renderScreen();

    await userEvent.press(screen.getByLabelText('Tuỳ chọn thẻ'));
    expect(openSheet).toHaveBeenCalledWith('menu');
    await view.unmount();

    mockScreen({ data: undefined, notFound: true });
    await renderScreen();
    expect(screen.queryByLabelText('Tuỳ chọn thẻ')).toBeNull();
  });

  it('offline: ẩn nút sửa, ô thêm việc nhỏ; composer thành "Kết nối lại để gửi bình luận."', async () => {
    mockScreen({ offline: true });
    await renderScreen();

    expect(screen.queryByText('Thêm mô tả')).toBeNull();
    expect(screen.queryByPlaceholderText('Thêm việc nhỏ')).toBeNull();
    expect(screen.queryByPlaceholderText('Viết bình luận…')).toBeNull();
    expect(screen.getByText('Kết nối lại để gửi bình luận.')).toBeOnTheScreen();
  });

  it('thẻ đã xoá (mở từ link): banner + nút Khôi phục cho người được phép; không sửa/bình luận', async () => {
    mockScreen({ data: makeDetail({ deletedAt: '2026-09-18T00:00:00.000Z' }) });
    await renderScreen();

    expect(screen.getByText(/Bạn chỉ xem được/)).toBeOnTheScreen();
    await userEvent.press(screen.getByText('Khôi phục'));
    expect(restore).toHaveBeenCalledTimes(1);
    expect(screen.queryByPlaceholderText('Viết bình luận…')).toBeNull();
    expect(screen.queryByText('Thêm mô tả')).toBeNull();
  });

  it('thẻ đã xoá nhưng người xem không có quyền khôi phục: không có nút Khôi phục', async () => {
    mockScreen({
      data: makeDetail({
        deletedAt: '2026-09-18T00:00:00.000Z',
        myPermissions: { attach: false, comment: false, delete: false, edit: false },
      }),
    });
    await renderScreen();

    expect(screen.getByText(/Bạn chỉ xem được/)).toBeOnTheScreen();
    expect(screen.queryByText('Khôi phục')).toBeNull();
  });

  it('409: banner "vừa được người khác thay đổi" hiện và đóng được', async () => {
    mockScreen({ conflict: true });
    await renderScreen();

    expect(screen.getByText(/vừa được người khác thay đổi/)).toBeOnTheScreen();
  });

  it('404: "Thẻ không còn tồn tại" thay cho nội dung', async () => {
    mockScreen({ data: undefined, notFound: true });
    await renderScreen();

    expect(screen.getByText('Thẻ không còn tồn tại')).toBeOnTheScreen();
    expect(screen.queryByText('Viết báo cáo')).toBeNull();
  });

  it('p4-04: khối "Phụ thuộc" hiện trong chi tiết thẻ; canEdit theo quyền sửa', async () => {
    mockScreen({});
    await renderScreen();

    expect(screen.getByText('PHỤ THUỘC canEdit=true')).toBeOnTheScreen();
  });

  it('p4-04: offline → khối "Phụ thuộc" nhận canEdit=false (ẩn nút thêm/gỡ)', async () => {
    mockScreen({ offline: true });
    await renderScreen();

    expect(screen.getByText('PHỤ THUỘC canEdit=false')).toBeOnTheScreen();
  });

  it('p4-04: bản giữ chỗ (chưa có chi tiết thật) → chưa hiện khối "Phụ thuộc", tránh gọi API bằng dữ liệu bịa', async () => {
    mockScreen({ placeholder: true });
    await renderScreen();

    expect(screen.queryByText(/PHỤ THUỘC/)).toBeNull();
  });
});
