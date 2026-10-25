import { fireEvent, render, screen } from '@testing-library/react-native';

import { CalendarHeaderActions } from '../components/calendar/CalendarHeaderActions';
import { DEFAULT_FILTERS, isFiltered } from '../hooks/useCalendarFilters';

/** AppBar của màn Lịch: ĐÚNG hai nút (lọc + tạo), nút lọc báo "đang lọc" bằng nhãn trợ năng khi bộ lọc khác mặc định. */
describe('CalendarHeaderActions', () => {
  it('có đúng hai nút: lọc và tạo cuộc họp; ngoại tuyến thì ẩn nút tạo', async () => {
    const view = await render(<CalendarHeaderActions offline={false} onCreate={jest.fn()} onFilter={jest.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    await view.unmount();

    await render(<CalendarHeaderActions offline onCreate={jest.fn()} onFilter={jest.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByLabelText('Tạo cuộc họp')).toBeNull();
  });

  it('bộ lọc mặc định: nhãn "Lọc lịch họp"; đang lọc: nhãn nói rõ "đang áp dụng bộ lọc" (không chỉ dựa vào chấm màu)', async () => {
    const plain = await render(<CalendarHeaderActions offline={false} onCreate={jest.fn()} onFilter={jest.fn()} />);
    expect(screen.getByLabelText('Lọc lịch họp')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Đang áp dụng bộ lọc')).toBeNull();
    await plain.unmount();

    await render(<CalendarHeaderActions filtered offline={false} onCreate={jest.fn()} onFilter={jest.fn()} />);
    expect(screen.getByLabelText('Lọc lịch họp, đang áp dụng bộ lọc')).toBeOnTheScreen();
  });

  it('bấm nút gọi đúng callback', async () => {
    const onFilter = jest.fn();
    const onCreate = jest.fn();
    await render(<CalendarHeaderActions offline={false} onCreate={onCreate} onFilter={onFilter} />);
    await fireEvent.press(screen.getByLabelText('Lọc lịch họp'));
    await fireEvent.press(screen.getByLabelText('Tạo cuộc họp'));
    expect(onFilter).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});

describe('isFiltered', () => {
  it('mặc định ⇒ không lọc; đổi phạm vi / trạng thái / nhóm ⇒ đang lọc', () => {
    expect(isFiltered(DEFAULT_FILTERS)).toBe(false);
    expect(isFiltered({ ...DEFAULT_FILTERS, scope: 'ALL_VISIBLE' })).toBe(true);
    expect(isFiltered({ ...DEFAULT_FILTERS, statuses: ['LIVE'] })).toBe(true);
    expect(isFiltered({ ...DEFAULT_FILTERS, workspaceId: 'ws-1' })).toBe(true);
  });
});
