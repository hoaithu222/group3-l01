import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { BoardCardActionsSlot, BoardHeaderActionsSlot } from '@/shared/board-extensions';
import { useFeature } from '@/shell/capabilities';

import '../register';

/**
 * Lối vào "Báo cáo đóng góp" (app.md §1): `register.tsx` đăng ký nút ở thanh tiêu đề Kanban và liên kết dưới thẻ bảng vào khe `@/shared/board-extensions` (side-effect, import ở
 * `boards/_layout.tsx`). MỌI thành viên thấy (báo cáo chỉ đọc); cờ phân hệ `project` tắt thì ẩn. Đi tới route `…/boards/[boardId]/contribution`.
 */
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }));
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn() }));

const CONTEXT = { boardId: 'b1', wsId: 'w1' };
const HREF = '/workspaces/w1/boards/b1/contribution';

beforeEach(() => {
  jest.clearAllMocks();
  (useFeature as jest.Mock).mockReturnValue(true);
});

describe('nút ở thanh tiêu đề Kanban', () => {
  it('có nút "Báo cáo đóng góp"; bấm đi tới màn Đóng góp của bảng', async () => {
    await render(<>{BoardHeaderActionsSlot(CONTEXT)}</>);

    await fireEvent.press(screen.getByRole('button', { name: 'Báo cáo đóng góp' }));

    expect(router.push).toHaveBeenCalledWith(HREF);
  });

  it('cờ project tắt (đã biết chắc) → không có nút', async () => {
    (useFeature as jest.Mock).mockReturnValue(false);
    await render(<>{BoardHeaderActionsSlot(CONTEXT)}</>);
    expect(screen.queryByRole('button', { name: 'Báo cáo đóng góp' })).toBeNull();
  });

  it('cờ chưa biết (undefined, đang tải) → vẫn hiện nút', async () => {
    (useFeature as jest.Mock).mockReturnValue(undefined);
    await render(<>{BoardHeaderActionsSlot(CONTEXT)}</>);
    expect(screen.getByRole('button', { name: 'Báo cáo đóng góp' })).toBeOnTheScreen();
  });
});

describe('liên kết dưới thẻ bảng', () => {
  it('có liên kết "Báo cáo đóng góp"; bấm đi tới màn Đóng góp của ĐÚNG bảng của thẻ đó', async () => {
    await render(<>{BoardCardActionsSlot({ boardId: 'b7', wsId: 'w1' })}</>);

    await fireEvent.press(screen.getByRole('button', { name: 'Báo cáo đóng góp' }));

    expect(router.push).toHaveBeenCalledWith('/workspaces/w1/boards/b7/contribution');
  });

  it('cờ project tắt → ẩn', async () => {
    (useFeature as jest.Mock).mockReturnValue(false);
    await render(<>{BoardCardActionsSlot(CONTEXT)}</>);

    expect(screen.queryByRole('button', { name: 'Báo cáo đóng góp' })).toBeNull();
  });
});
