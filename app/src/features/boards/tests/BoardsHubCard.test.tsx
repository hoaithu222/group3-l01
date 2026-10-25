import { render, userEvent } from '@testing-library/react-native';

import { useFeature } from '@/shell/capabilities';

import { BoardsHubCard } from '../components/BoardsHubCard';
import { useBoards } from '../queries/boards.queries';
import { useWorkspaceBoardAccess } from '../queries/workspace-access.queries';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn() }));
jest.mock('../queries/boards.queries', () => ({ useBoards: jest.fn() }));
jest.mock('../queries/workspace-access.queries', () => ({ useWorkspaceBoardAccess: jest.fn() }));

const mockedFeature = useFeature as jest.MockedFunction<typeof useFeature>;
const mockedBoards = useBoards as jest.MockedFunction<typeof useBoards>;
const mockedAccess = useWorkspaceBoardAccess as jest.MockedFunction<typeof useWorkspaceBoardAccess>;

function setup(flag: boolean | undefined, role: 'MEMBER' | 'OWNER' = 'OWNER') {
  mockedFeature.mockReturnValue(flag);
  mockedBoards.mockReturnValue({ data: [{}, {}] } as never);
  mockedAccess.mockReturnValue({ data: { myRole: role, status: 'ACTIVE' } } as never);
}

beforeEach(() => jest.clearAllMocks());

describe('BoardsHubCard', () => {
  it('cờ `project` tắt ⇒ không hiện gì', async () => {
    setup(false);
    const screen = await render(<BoardsHubCard wsId="w1" />);
    expect(screen.queryByText('Việc')).toBeNull();
  });

  it('cờ chưa biết (đang tải capabilities) ⇒ cũng ẩn, không hiện rồi biến mất', async () => {
    setup(undefined);
    const screen = await render(<BoardsHubCard wsId="w1" />);
    expect(screen.queryByText('Việc')).toBeNull();
  });

  it('cờ bật: hiện số bảng; bấm cả dòng "Việc" mở danh sách bảng của nhóm', async () => {
    setup(true);
    const screen = await render(<BoardsHubCard wsId="w1" />);

    expect(screen.getByText('2 bảng đang dùng')).toBeOnTheScreen();
    await userEvent.press(screen.getByText('Việc'));
    expect(mockPush).toHaveBeenCalledWith('/workspaces/w1/boards');
  });

  it('chỉ MỘT lối vào: không còn cặp nút "Tạo"/"Xem" (tạo bảng nằm ở màn danh sách, theo quyền OWNER/ADMIN)', async () => {
    setup(true, 'OWNER');
    const owner = await render(<BoardsHubCard wsId="w1" />);
    expect(owner.queryByText('Tạo')).toBeNull();
    expect(owner.queryByText('Xem')).toBeNull();
    owner.unmount();

    setup(true, 'MEMBER');
    const member = await render(<BoardsHubCard wsId="w1" />);
    expect(member.getByText('Việc')).toBeOnTheScreen();
  });

  it('khách (GUEST) không có quyền đọc bảng ⇒ không bày lối vào', async () => {
    mockedFeature.mockReturnValue(true);
    mockedBoards.mockReturnValue({ data: [] } as never);
    mockedAccess.mockReturnValue({ data: { myRole: 'GUEST', status: 'ACTIVE' } } as never);
    const screen = await render(<BoardsHubCard wsId="w1" />);
    expect(screen.queryByText('Việc')).toBeNull();
  });
});
