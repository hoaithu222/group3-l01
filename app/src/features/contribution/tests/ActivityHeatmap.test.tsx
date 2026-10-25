import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';

import { ActivityHeatmap } from '../components/ActivityHeatmap';
import { HeatmapDaySheet } from '../components/HeatmapDaySheet';
import { HeatmapMemberPicker } from '../components/HeatmapMemberPicker';
import { HEAT_STEP } from '../constants/contribution.constants';
import { heatmapRange } from '../utils/heatmap-grid';
import { makeHeatmap, makeMember, makePointsOnlyMember, USER_A, USER_B } from './fixtures';
import { httpError } from './harness';

/**
 * Biểu đồ hoạt động (app.md §3, §7, §8): lưới SVG là trang trí (ẩn khỏi trình đọc màn hình) nên PHẢI có bản chữ — tóm tắt, chú giải "Ít → Nhiều", chi tiết ngày khi chạm, và danh sách
 * theo ngày. Chạm chọn ô GẦN NHẤT theo toạ độ; ô của phần còn lại tuần hiện tại (tương lai) không chọn được.
 */
const RANGE = heatmapRange('2026-09-15', 26);
const METRICS = { frame: { height: 812, width: 375, x: 0, y: 0 }, insets: { bottom: 34, left: 0, right: 0, top: 44 } };
const Wrapper = ({ children }: { children: ReactNode }) => <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>;

const base = { error: null, loading: false, onOpenList: jest.fn(), onRetry: jest.fn(), range: RANGE, weeks: 26 };

/** Toạ độ chạm vào giữa ô (cột `col`, hàng `row`) của lưới. */
const at = (col: number, row: number) => ({ nativeEvent: { locationX: col * HEAT_STEP + 6, locationY: row * HEAT_STEP + 6 } });

describe('ActivityHeatmap', () => {
  it('tóm tắt chữ + chú giải "Ít → Nhiều" + gợi ý chạm; nhãn trợ năng của lưới là bản tóm tắt', async () => {
    await render(<ActivityHeatmap {...base} data={makeHeatmap()} />);

    expect(screen.getByText('2 ngày có hoạt động trong 26 tuần, nhiều nhất 15/09 (7)')).toBeOnTheScreen();
    expect(screen.getByText('Ít')).toBeOnTheScreen();
    expect(screen.getByText('Nhiều')).toBeOnTheScreen();
    expect(screen.getByText('Chạm vào một ô để xem chi tiết ngày.')).toBeOnTheScreen();
    expect(
      screen.getByRole('image', { name: '2 ngày có hoạt động trong 26 tuần, nhiều nhất 15/09 (7). Chạm để xem một ngày.' }),
    ).toBeOnTheScreen();
  });

  it('chạm ô ngày 15/09 (cột cuối, hàng Thứ Ba) → "15/09: 7 hoạt động (4 thẻ, 2 bình luận, 1 lượt chấm)"', async () => {
    await render(<ActivityHeatmap {...base} data={makeHeatmap()} />);

    await fireEvent.press(screen.getByRole('image'), at(25, 1));

    expect(screen.getByText('15/09: 7 hoạt động (4 thẻ, 2 bình luận, 1 lượt chấm)')).toBeOnTheScreen();
  });

  it('chạm ô ngày không có bản ghi → "không có hoạt động"; chạm trượt vài dp vẫn trúng ô gần nhất', async () => {
    await render(<ActivityHeatmap {...base} data={makeHeatmap()} />);

    await fireEvent.press(screen.getByRole('image'), at(24, 3)); // 2026-09-10: không có bản ghi
    expect(screen.getByText('10/09: không có hoạt động')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('image'), { nativeEvent: { locationX: 25 * HEAT_STEP + 1, locationY: 1 * HEAT_STEP + 14 } });
    expect(screen.getByText('15/09: 7 hoạt động (4 thẻ, 2 bình luận, 1 lượt chấm)')).toBeOnTheScreen();
  });

  it('ô thuộc phần còn lại của tuần hiện tại (tương lai) không chọn được — chi tiết giữ nguyên', async () => {
    await render(<ActivityHeatmap {...base} data={makeHeatmap()} />);
    await fireEvent.press(screen.getByRole('image'), at(25, 1));

    await fireEvent.press(screen.getByRole('image'), at(25, 4)); // 2026-09-18: sau hôm nay

    expect(screen.getByText('15/09: 7 hoạt động (4 thẻ, 2 bình luận, 1 lượt chấm)')).toBeOnTheScreen();
    expect(screen.queryByText(/18\/09/)).toBeNull();
  });

  it('"Xem danh sách theo ngày" là bản chữ của lưới', async () => {
    const onOpenList = jest.fn();
    await render(<ActivityHeatmap {...base} data={makeHeatmap()} onOpenList={onOpenList} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Xem danh sách theo ngày' }));

    expect(onOpenList).toHaveBeenCalledTimes(1);
  });

  it('chưa có hoạt động nào → "Chưa có hoạt động", không vẽ lưới', async () => {
    await render(<ActivityHeatmap {...base} data={makeHeatmap({ days: [], maxTotal: 0 })} />);

    expect(screen.getByText('Chưa có hoạt động')).toBeOnTheScreen();
    expect(screen.queryByRole('image')).toBeNull();
  });

  it('đang tải (chưa có dữ liệu, hoặc chưa biết múi giờ) → khung xương, không chữ nào giả', async () => {
    await render(<ActivityHeatmap {...base} data={undefined} loading />);
    expect(screen.queryByRole('image')).toBeNull();
    expect(screen.queryByText('Chưa có hoạt động')).toBeNull();
  });

  it('lỗi tải → báo tại chỗ có "Thử lại"', async () => {
    const onRetry = jest.fn();
    await render(<ActivityHeatmap {...base} data={undefined} error={httpError(500, 'FOO_999', 'Máy chủ bận')} onRetry={onRetry} />);

    expect(screen.getByText('Không tải được biểu đồ hoạt động')).toBeOnTheScreen();
    expect(screen.getByText('Máy chủ bận')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('HeatmapDaySheet — danh sách theo ngày', () => {
  it('chỉ ngày CÓ hoạt động, mới → cũ, kèm cơ cấu ("4 thẻ, 2 bình luận, 1 lượt chấm")', async () => {
    await render(<HeatmapDaySheet days={makeHeatmap().days} visible onClose={jest.fn()} />, { wrapper: Wrapper });

    expect(screen.getByText('15/09/2026')).toBeOnTheScreen();
    expect(screen.getByText('7 hoạt động')).toBeOnTheScreen();
    expect(screen.getByText('4 thẻ, 2 bình luận, 1 lượt chấm')).toBeOnTheScreen();
    expect(screen.getByText('14/09/2026')).toBeOnTheScreen();
  });

  it('không có ngày nào → "Chưa có hoạt động"', async () => {
    await render(<HeatmapDaySheet days={[]} visible onClose={jest.fn()} />, { wrapper: Wrapper });

    expect(screen.getByText('Chưa có hoạt động')).toBeOnTheScreen();
  });
});

describe('HeatmapMemberPicker', () => {
  const members = [makeMember(), makePointsOnlyMember({ user: { avatarUrl: null, id: USER_B, membership: 'LEFT', name: 'Trần Thị B' } })];

  it('"Cả bảng" đang chọn; chọn một thành viên (kể cả người đã rời, có ghi chú chữ) → onChange(userId)', async () => {
    const onChange = jest.fn();
    await render(<HeatmapMemberPicker members={members} value="all" onChange={onChange} />, { wrapper: Wrapper });

    expect(screen.getByRole('radio', { name: 'Cả bảng' }).props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(screen.getByRole('radio', { name: 'Thành viên' }));
    expect(await screen.findByText('Trần Thị B (đã rời nhóm)')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Nguyễn Văn A'));

    expect(onChange).toHaveBeenCalledWith(USER_A);
  });

  it('đang xem một thành viên → chip hiện tên người đó; bấm "Cả bảng" quay lại phạm vi cả bảng', async () => {
    const onChange = jest.fn();
    await render(<HeatmapMemberPicker members={members} value={USER_A} onChange={onChange} />, { wrapper: Wrapper });

    expect(screen.getByRole('radio', { name: 'Nguyễn Văn A' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'Cả bảng' }));

    expect(onChange).toHaveBeenCalledWith('all');
  });
});
