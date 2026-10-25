import { render, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import type { GanttDto, GanttTaskDto } from '../api/critical-path.types';
import { GanttScreen } from '../screens/GanttScreen';
import { DEVICE_TZ, dto, mockView, Wrapper } from './gantt-screen-setup';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({ boardId: 'b1', wsId: 'w1' }),
}));
jest.mock('../hooks/useGanttBoard', () => ({ useGanttBoard: jest.fn() }));
jest.mock('../hooks/useGanttMove', () => ({
  useGanttMove: () => ({ reschedule: { applying: false, begin: jest.fn(), cancel: jest.fn(), confirm: jest.fn(), session: null }, shift: jest.fn() }),
}));
// Phần nặng (SVG, cử chỉ, tải chi tiết thẻ) có test riêng hoặc cần mạng — ở đây chỉ kiểm việc RẼ NHÁNH của màn.
jest.mock('../components/gantt/GanttChart', () => {
  const { Pressable, Text: RNText } = jest.requireActual('react-native');
  return {
    GanttChart: ({ data, onOpenBar }: { data: GanttDto; onOpenBar: (task: GanttTaskDto) => void }) => (
      <Pressable onPress={() => onOpenBar(data.tasks[0] as GanttTaskDto)}>
        <RNText>BIỂU ĐỒ TABLET</RNText>
      </Pressable>
    ),
  };
});
jest.mock('../components/gantt/MilestoneList', () => {
  const { Text: RNText } = jest.requireActual('react-native');
  return { MilestoneList: () => <RNText>DANH SÁCH MỐC</RNText> };
});
jest.mock('../components/gantt/GanttDateSheetHost', () => {
  const { Text: RNText } = jest.requireActual('react-native');
  return { GanttDateSheetHost: ({ taskId }: { taskId: string }) => <RNText>{`TẤM NGÀY ${taskId}`}</RNText> };
});
jest.mock('../components/kanban/RescheduleBanner', () => {
  const { Text: RNText } = jest.requireActual('react-native');
  return { RescheduleBanner: ({ batchId }: { batchId: string }) => <RNText>{`BANNER ${batchId}`}</RNText> };
});
jest.mock('../components/task/RescheduleWarningSheet', () => ({ RescheduleWarningSheet: () => null }));

beforeEach(() => jest.clearAllMocks());

describe('GanttScreen — chỉ đọc, múi giờ, banner, chạm thanh', () => {
  it('offline / lưu trữ: chỉ đọc — có câu giải thích, tắt kéo (canDrag = false)', async () => {
    mockView({ archived: true, canMove: false, offline: true });
    const screen = await render(<GanttScreen />, { wrapper: Wrapper });

    expect(screen.getByText(/Không có kết nối — chỉ xem/)).toBeOnTheScreen();
    expect(screen.getByText(/Bảng đã lưu trữ — chỉ xem/)).toBeOnTheScreen();
    expect(screen.queryByText(/Giữ rồi kéo thanh/)).toBeNull();
  });

  it('múi giờ server KHÁC múi giờ máy: ghi chú "Ngày theo múi giờ …"', async () => {
    mockView({}, dto({ timezone: 'Pacific/Kiritimati' }));
    const screen = await render(<GanttScreen />, { wrapper: Wrapper });
    // Máy chạy test ở UTC+14 thì hai múi giờ trùng — chấp nhận, ghi chú chỉ có khi thật sự khác.
    const offsetNow = -new Date().getTimezoneOffset();
    expect(Boolean(screen.queryByText('Ngày theo múi giờ Pacific/Kiritimati.'))).toBe(offsetNow !== 840);
  });

  it('múi giờ server TRÙNG máy: không có ghi chú', async () => {
    mockView({}, dto({ timezone: DEVICE_TZ }));
    const screen = await render(<GanttScreen />, { wrapper: Wrapper });
    expect(screen.queryByText(/Ngày theo múi giờ/)).toBeNull();
  });

  it('banner lô nền hiện khi có batchId và đang online', async () => {
    mockView({ activeBatchId: 'batch-1' });
    const screen = await render(<GanttScreen />, { wrapper: Wrapper });
    expect(screen.getByText('BANNER batch-1')).toBeOnTheScreen();
  });

  it('banner lô nền ẨN khi offline (app.md §3 cột Offline)', async () => {
    mockView({ activeBatchId: 'batch-1', offline: true });
    const screen = await render(<GanttScreen />, { wrapper: Wrapper });
    expect(screen.queryByText('BANNER batch-1')).toBeNull();
  });

  it('chạm thanh khi CÓ quyền → tấm ngày (đường thay thế cho kéo)', async () => {
    mockView();
    const screen = await render(<GanttScreen />, { wrapper: Wrapper });

    await userEvent.press(screen.getByText('BIỂU ĐỒ TABLET'));
    expect(screen.getByText('TẤM NGÀY t1')).toBeOnTheScreen();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('chạm thanh khi CHỈ ĐỌC → mở chi tiết thẻ, không có tấm ngày', async () => {
    mockView({ canMove: false });
    const screen = await render(<GanttScreen />, { wrapper: Wrapper });

    await userEvent.press(screen.getByText('BIỂU ĐỒ TABLET'));
    expect(screen.queryByText(/TẤM NGÀY/)).toBeNull();
    expect(router.push).toHaveBeenCalledWith({
      params: { boardId: 'b1', taskId: 't1', wsId: 'w1' },
      pathname: '/workspaces/[wsId]/boards/[boardId]/tasks/[taskId]',
    });
  });

  it('cờ `project` tắt: "Tính năng này hiện chưa được bật" thay cho nội dung', async () => {
    mockView({ featureOff: true });
    const screen = await render(<GanttScreen />, { wrapper: Wrapper });

    expect(screen.getByText('Tính năng này hiện chưa được bật')).toBeOnTheScreen();
    expect(screen.queryByText('BIỂU ĐỒ TABLET')).toBeNull();
  });
});
