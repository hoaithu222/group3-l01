import { render, userEvent } from '@testing-library/react-native';

import type { GanttDto, GanttTaskDto } from '../api/critical-path.types';
import { GanttScreen } from '../screens/GanttScreen';
import { dto, mockView, refetch, selectRange, toggleListView, Wrapper } from './gantt-screen-setup';

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

describe('GanttScreen', () => {
  it('TABLET: biểu đồ + chú giải (Đường găng, Xung đột lịch, Hôm nay) + nút "Xem dạng danh sách"', async () => {
    mockView();
    const screen = await render(<GanttScreen />, { wrapper: Wrapper });

    expect(screen.getByText('BIỂU ĐỒ TABLET')).toBeOnTheScreen();
    expect(screen.getByText('Đường găng')).toBeOnTheScreen();
    expect(screen.getByText('Xung đột lịch')).toBeOnTheScreen();
    expect(screen.getByText('Hôm nay')).toBeOnTheScreen();

    await userEvent.press(screen.getByText('Xem dạng danh sách'));
    expect(toggleListView).toHaveBeenCalledTimes(1);
  });

  it('ĐIỆN THOẠI: danh sách mốc, KHÔNG có biểu đồ và KHÔNG có nút chuyển', async () => {
    mockView({ showChart: false, tablet: false });
    const screen = await render(<GanttScreen />, { wrapper: Wrapper });

    expect(screen.getByText('DANH SÁCH MỐC')).toBeOnTheScreen();
    expect(screen.queryByText('BIỂU ĐỒ TABLET')).toBeNull();
    expect(screen.queryByText('Xem dạng danh sách')).toBeNull();
  });

  it('bộ chọn khoảng 2 tuần / Tháng / Quý gọi selectRange đúng mức', async () => {
    mockView();
    const screen = await render(<GanttScreen />, { wrapper: Wrapper });

    await userEvent.press(screen.getByText('Quý'));
    expect(selectRange).toHaveBeenCalledWith('quarter');
    await userEvent.press(screen.getByText('2 tuần'));
    expect(selectRange).toHaveBeenCalledWith('2w');
  });

  it('rỗng: "Chưa có thẻ nào có ngày" + hướng dẫn đặt hạn', async () => {
    mockView({}, dto({ tasks: [] }));
    const screen = await render(<GanttScreen />, { wrapper: Wrapper });

    expect(screen.getByText('Chưa có thẻ nào có ngày')).toBeOnTheScreen();
    expect(screen.getByText(/Đặt ngày bắt đầu hoặc hạn chót/)).toBeOnTheScreen();
  });

  it('lỗi tải (chưa có dữ liệu): thông báo + Thử lại gọi refetch', async () => {
    mockView({ gantt: { data: undefined, error: new Error('Không có kết nối'), isError: true, refetch } }, undefined);
    const screen = await render(<GanttScreen />, { wrapper: Wrapper });

    expect(screen.getByText('Không tải được dòng thời gian')).toBeOnTheScreen();
    await userEvent.press(screen.getByText('Thử lại'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('đang tải: khung chờ, chưa có chữ nội dung', async () => {
    mockView({ gantt: { data: undefined, error: null, isError: false, refetch } }, undefined);
    const screen = await render(<GanttScreen />, { wrapper: Wrapper });

    expect(screen.queryByText('BIỂU ĐỒ TABLET')).toBeNull();
    expect(screen.queryByText('Chưa có thẻ nào có ngày')).toBeNull();
    expect(screen.getByText('Dòng thời gian')).toBeOnTheScreen();
  });

  it('truncated: banner "Chỉ hiện 2.000 thẻ đầu, hãy thu hẹp khoảng ngày"', async () => {
    mockView({}, dto({ truncated: true }));
    const screen = await render(<GanttScreen />, { wrapper: Wrapper });

    expect(screen.getByText(/Chỉ hiện 2\.000 thẻ đầu/)).toBeOnTheScreen();
  });
});
