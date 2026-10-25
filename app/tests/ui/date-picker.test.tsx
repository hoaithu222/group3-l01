import { useState, type ReactNode } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import dayjs from 'dayjs';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Calendar, DatePicker, type DateRange } from '@/shared/ui/date-picker';

/**
 * ⛔ Bắt buộc. `DatePicker` mượn vỏ `BottomSheet`, mà tấm đó dùng
 * `react-native-keyboard-controller` — gói này gọi xuống module native ngay lúc
 * NẠP MODULE, nên không mock thì cả suite chết trước khi render dòng nào.
 */
jest.mock('react-native-keyboard-controller', () =>
  jest.requireActual('react-native-keyboard-controller/jest'),
);

/**
 * Test HÀNH VI của bộ chọn ngày.
 *
 * ⛔ Không kiểm màu/khoảng cách: NativeWind biên dịch class bằng Metro mà Jest
 * không chạy Metro ⇒ `style` luôn rỗng (xem `docs/rules/testing.md`).
 *
 * ⚠️ `render()` VÀ `fireEvent` của RNTL 14 đều BẤT ĐỒNG BỘ — thiếu `await` thì
 * hoặc truy vấn báo "render function has not been called", hoặc lần bấm sau
 * chạy chồng lên `act()` của lần trước và state chưa kịp cập nhật.
 *
 * ── Vì sao test bám vào `accessibilityLabel` ────────────────────────────────
 * Con số trong ô ngày lặp lại giữa các tháng, còn nhãn đầy đủ thì không. Bám
 * vào nhãn nghĩa là test canh luôn phần trợ năng: nhãn hỏng là test đỏ.
 */

/** ⛔ `useSafeAreaInsets()` ném lỗi khi không có provider; thiếu `initialMetrics`
 *  thì trong Jest không tầng native nào đo được và tấm trượt không render xong. */
const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

const Wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
);

/**
 * ⛔ Khoảng CHƯA chọn ⇒ `Calendar` mở ở tháng của HÔM NAY (`dayjs()`), nên các ca chọn khoảng chỉ xanh trong tháng 9/2026 (đỏ thật
 * từ 01/10/2026). Ghim "hôm nay" = 15/09/2026 bằng đồng hồ giả CHỈ cho `Date` — hẹn giờ/khung hình vẫn chạy thật, `afterEach` trả lại.
 */
const pinToday = () =>
  jest.useFakeTimers({
    doNotFake: [
      'cancelAnimationFrame',
      'cancelIdleCallback',
      'clearImmediate',
      'clearInterval',
      'clearTimeout',
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'requestIdleCallback',
      'setImmediate',
      'setInterval',
      'setTimeout',
    ],
    now: new Date(2026, 8, 15),
  });

/** Lịch có nhớ lựa chọn — cần cho ca chọn khoảng (hai nhịp bấm liên tiếp). */
function RangeHarness({ onPick }: { onPick: (value: DateRange) => void }) {
  const [value, setValue] = useState<DateRange>({ end: null, start: null });
  return (
    <Calendar
      mode="range"
      value={value}
      onChange={(next) => {
        setValue(next);
        onPick(next);
      }}
    />
  );
}

describe('Calendar', () => {
  afterEach(() => jest.useRealTimers());

  it('bấm một ngày trả về ĐÚNG ngày đó theo giờ địa phương', async () => {
    const onChange = jest.fn();
    const screen = await render(<Calendar value={new Date(2026, 8, 15)} onChange={onChange} />, {
      wrapper: Wrapper,
    });

    await fireEvent.press(screen.getByLabelText('Thứ Ba, 8 tháng 9 năm 2026'));

    expect(onChange).toHaveBeenCalledTimes(1);
    const picked = onChange.mock.calls[0]?.[0] as Date;
    /**
     * ⛔ So bằng chuỗi ngày ĐỊA PHƯƠNG, không bằng `toISOString()`: ở múi giờ
     * +07:00 thì nửa đêm 08/09 ra `2026-09-07T17:00:00Z`, và test viết theo ISO
     * sẽ xanh ở châu Âu rồi đỏ ở Việt Nam.
     */
    expect(dayjs(picked).format('YYYY-MM-DD')).toBe('2026-09-08');
    expect(picked.getHours()).toBe(0);
  });

  it('ngày ngoài minDate/maxDate không bấm được', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <Calendar
        maxDate={new Date(2026, 8, 20)}
        minDate={new Date(2026, 8, 10)}
        value={new Date(2026, 8, 15)}
        onChange={onChange}
      />,
      { wrapper: Wrapper },
    );

    const tooEarly = screen.getByLabelText('Thứ Bảy, 5 tháng 9 năm 2026');
    expect(tooEarly).toBeDisabled();
    await fireEvent.press(tooEarly);

    const tooLate = screen.getByLabelText('Thứ Tư, 30 tháng 9 năm 2026');
    expect(tooLate).toBeDisabled();
    await fireEvent.press(tooLate);

    expect(onChange).not.toHaveBeenCalled();

    // Ngày trong khoảng vẫn bấm được — thiếu vế này thì hai vế trên vô nghĩa.
    await fireEvent.press(screen.getByLabelText('Thứ Ba, 15 tháng 9 năm 2026'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('ngày của tháng khác chỉ để nhìn, không chọn được', async () => {
    const onChange = jest.fn();
    const screen = await render(<Calendar value={new Date(2026, 8, 15)} onChange={onChange} />, {
      wrapper: Wrapper,
    });

    const nextMonthDay = screen.getByLabelText('Thứ Năm, 1 tháng 10 năm 2026');
    expect(nextMonthDay).toBeDisabled();
    await fireEvent.press(nextMonthDay);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('mũi tên đổi tháng và đổi luôn tiêu đề', async () => {
    const screen = await render(<Calendar value={new Date(2026, 8, 15)} />, { wrapper: Wrapper });
    expect(screen.getByText('Tháng 9 - 2026')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Tháng trước'));
    expect(screen.getByText('Tháng 8 - 2026')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Tháng sau'));
    await fireEvent.press(screen.getByLabelText('Tháng sau'));
    expect(screen.getByText('Tháng 10 - 2026')).toBeOnTheScreen();
  });

  it('không lùi được quá minDate', async () => {
    const screen = await render(
      <Calendar minDate={new Date(2026, 8, 1)} value={new Date(2026, 8, 15)} />,
      { wrapper: Wrapper },
    );

    const previous = screen.getByLabelText('Tháng trước');
    expect(previous).toBeDisabled();
    await fireEvent.press(previous);

    expect(screen.getByText('Tháng 9 - 2026')).toBeOnTheScreen();
  });

  it('chế độ range xếp hai đầu ĐÚNG THỨ TỰ dù bấm ngược', async () => {
    pinToday();
    const onPick = jest.fn();
    const screen = await render(<RangeHarness onPick={onPick} />, { wrapper: Wrapper });

    // Bấm "đến ngày" trước, "từ ngày" sau — người dùng hay làm đúng như vậy.
    await fireEvent.press(screen.getByLabelText('Chủ nhật, 20 tháng 9 năm 2026'));
    await fireEvent.press(screen.getByLabelText('Thứ Năm, 10 tháng 9 năm 2026'));

    expect(onPick).toHaveBeenCalledTimes(2);
    const last = onPick.mock.calls[1]?.[0] as DateRange;
    expect(dayjs(last.start).format('DD/MM/YYYY')).toBe('10/09/2026');
    expect(dayjs(last.end).format('DD/MM/YYYY')).toBe('20/09/2026');
  });

  it('nhịp thứ ba bắt đầu lại một khoảng mới', async () => {
    pinToday();
    const onPick = jest.fn();
    const screen = await render(<RangeHarness onPick={onPick} />, { wrapper: Wrapper });

    await fireEvent.press(screen.getByLabelText('Thứ Năm, 10 tháng 9 năm 2026'));
    await fireEvent.press(screen.getByLabelText('Chủ nhật, 20 tháng 9 năm 2026'));
    await fireEvent.press(screen.getByLabelText('Thứ Ba, 1 tháng 9 năm 2026'));

    const last = onPick.mock.calls[2]?.[0] as DateRange;
    expect(dayjs(last.start).format('DD/MM/YYYY')).toBe('01/09/2026');
    expect(last.end).toBeNull();
  });
});

/**
 * Ba nhóm còn lại của guideline Figma: chọn Năm (②), chọn Tháng (②) và luồng
 * liên tiếp Năm → Tháng → Ngày (③).
 *
 * ⚠️ Bám vào `accessibilityLabel` chứ không vào chữ trong ô: ô năm hiện "2024"
 * trần, mà con số đó cũng có thể là một phần của đầu đề — nhãn "Năm 2024" thì
 * duy nhất, và nó cũng chính là thứ trình đọc màn hình xướng lên.
 */
describe('Calendar — chọn Năm và Tháng', () => {
  it('precision="year" mở lưới thập kỷ và trả về NGÀY ĐẦU NĂM', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <Calendar precision="year" value={new Date(2026, 8, 15)} onChange={onChange} />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText('2020 – 2029')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Năm 2023'));

    expect(dayjs(onChange.mock.calls[0]?.[0]).format('DD/MM/YYYY')).toBe('01/01/2023');
  });

  /** ⛔ Mũi tên của lưới năm nhảy 10 năm, không phải 1 — nhảy 1 thì lưới gần như đứng yên. */
  it('mũi tên của lưới năm nhảy theo THẬP KỶ', async () => {
    const screen = await render(<Calendar precision="year" value={new Date(2026, 8, 15)} />, {
      wrapper: Wrapper,
    });

    await fireEvent.press(screen.getByLabelText('Thập kỷ trước'));

    expect(screen.getByText('2010 – 2019')).toBeOnTheScreen();
  });

  it('precision="month" trả về NGÀY ĐẦU THÁNG', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <Calendar precision="month" value={new Date(2026, 8, 15)} onChange={onChange} />,
      { wrapper: Wrapper },
    );

    // Đầu đề lưới tháng là NĂM đang xem.
    expect(screen.getByText('2026')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Tháng 3 năm 2026'));

    expect(dayjs(onChange.mock.calls[0]?.[0]).format('DD/MM/YYYY')).toBe('01/03/2026');
  });

  it('năm ngoài minDate/maxDate không bấm được', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <Calendar
        maxDate={new Date(2026, 11, 31)}
        minDate={new Date(2024, 0, 1)}
        precision="year"
        onChange={onChange}
      />,
      { wrapper: Wrapper },
    );

    const tooEarly = screen.getByLabelText('Năm 2022');
    expect(tooEarly).toBeDisabled();
    await fireEvent.press(tooEarly);

    expect(onChange).not.toHaveBeenCalled();
  });

  /**
   * ⛔ Nhịp giữa KHÔNG được bắn `onChange`. Bắn sớm thì màn hình cha nhận một
   * ngày mà người dùng mới chọn xong cái NĂM — và với màn "chọn kỳ đáo hạn" thì
   * đó là một lệnh đặt sai ngày.
   */
  it('luồng liên tiếp Năm → Tháng → Ngày chỉ báo ra ở nhịp CUỐI', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <Calendar precision="year-month-day" value={new Date(2026, 8, 15)} onChange={onChange} />,
      { wrapper: Wrapper },
    );

    await fireEvent.press(screen.getByLabelText('Năm 2024'));
    expect(onChange).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('Tháng 3 năm 2024'));
    expect(onChange).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('Thứ Hai, 4 tháng 3 năm 2024'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(dayjs(onChange.mock.calls[0]?.[0]).format('DD/MM/YYYY')).toBe('04/03/2024');
  });
});

describe('DatePicker', () => {
  afterEach(() => jest.useRealTimers());

  it('ô hiện ngày theo quy ước Việt Nam DD/MM/YYYY', async () => {
    const screen = await render(<DatePicker label="Ngày sinh" value={new Date(2026, 8, 8)} />, {
      wrapper: Wrapper,
    });

    expect(screen.getByText('08/09/2026')).toBeOnTheScreen();
  });

  it('chuỗi YYYY-MM-DD KHÔNG bị lệch một ngày vì múi giờ', async () => {
    /**
     * ⛔ Ca hồi quy quan trọng nhất của file. `new Date('2026-09-08')` là nửa
     * đêm UTC; ai đó bỏ dayjs đi thì ở múi giờ âm ngày hiển thị lùi lại thành
     * 07/09/2026 — và lỗi chỉ lộ ra trên máy người dùng.
     */
    const screen = await render(<DatePicker value="2026-09-08" />, { wrapper: Wrapper });

    expect(screen.getByText('08/09/2026')).toBeOnTheScreen();
  });

  it('chưa chọn thì hiện placeholder', async () => {
    const screen = await render(<DatePicker placeholder="Chọn ngày sinh" />, { wrapper: Wrapper });

    expect(screen.getByText('Chọn ngày sinh')).toBeOnTheScreen();
  });

  it('ô bị khoá thì không mở được lịch', async () => {
    const screen = await render(<DatePicker disabled label="Ngày sinh" />, { wrapper: Wrapper });

    const field = screen.getByLabelText('Ngày sinh, Chọn ngày');
    expect(field).toBeDisabled();
    await fireEvent.press(field);

    expect(screen.queryByLabelText('Tháng sau')).toBeNull();
  });

  it('chọn một ngày trong tấm trượt gọi onChange rồi đóng lại', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <DatePicker label="Ngày hiệu lực" value="2026-09-15" onChange={onChange} />,
      { wrapper: Wrapper },
    );

    await fireEvent.press(screen.getByLabelText('Ngày hiệu lực, 15/09/2026'));
    await fireEvent.press(screen.getByLabelText('Thứ Ba, 8 tháng 9 năm 2026'));

    expect(dayjs(onChange.mock.calls[0]?.[0]).format('DD/MM/YYYY')).toBe('08/09/2026');
    // Lịch đã đóng ⇒ không còn nút chuyển tháng nào trên màn hình.
    expect(screen.queryByLabelText('Tháng sau')).toBeNull();
  });

  it('chế độ range chỉ báo ra ngoài khi bấm Áp dụng', async () => {
    pinToday();
    const onChange = jest.fn();
    const screen = await render(<DatePicker label="Kỳ sao kê" mode="range" onChange={onChange} />, {
      wrapper: Wrapper,
    });

    await fireEvent.press(screen.getByLabelText('Kỳ sao kê, Chọn ngày'));
    await fireEvent.press(screen.getByLabelText('Thứ Năm, 10 tháng 9 năm 2026'));

    // Mới có một đầu ⇒ nút xác nhận còn khoá, chưa có gì bắn ra ngoài.
    await fireEvent.press(screen.getByText('Áp dụng'));
    expect(onChange).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('Chủ nhật, 20 tháng 9 năm 2026'));
    await fireEvent.press(screen.getByText('Áp dụng'));

    const picked = onChange.mock.calls[0]?.[0] as DateRange;
    expect(dayjs(picked.start).format('DD/MM/YYYY')).toBe('10/09/2026');
    expect(dayjs(picked.end).format('DD/MM/YYYY')).toBe('20/09/2026');
  });

  it('khoảng ngày hiện đủ hai đầu trong ô', async () => {
    const screen = await render(
      <DatePicker
        mode="range"
        value={{ end: new Date(2026, 8, 30), start: new Date(2026, 8, 1) }}
      />,
      { wrapper: Wrapper },
    );

    expect(screen.getByText('01/09/2026 - 30/09/2026')).toBeOnTheScreen();
  });

  /**
   * ⛔ Figma có BA màn "Error message" riêng và ở cả ba, câu lỗi nằm giữa lưới
   * và nút "Áp dụng". Chỉ vẽ dưới ô nhập thì luồng "bấm ngày → máy chủ từ chối"
   * bắt người dùng đóng tấm trượt mới đọc được lỗi, rồi mở lại để chọn ngày khác.
   */
  it('câu lỗi hiện CẢ dưới ô nhập lẫn trong tấm trượt', async () => {
    const screen = await render(
      <DatePicker error="Ngày không hợp lệ" label="Ngày hiệu lực" value="2026-09-15" />,
      { wrapper: Wrapper },
    );

    expect(screen.getAllByText('Ngày không hợp lệ')).toHaveLength(1);

    await fireEvent.press(screen.getByLabelText('Ngày hiệu lực, 15/09/2026'));

    expect(screen.getAllByText('Ngày không hợp lệ')).toHaveLength(2);
  });

  /**
   * ⚠️ Chọn tới THÁNG mà ô hiện "01/03/2026" thì người dùng tưởng mình lỡ chọn
   * ngày mùng 1 — nên định dạng và chữ mời mặc định phải đi theo `precision`.
   */
  it('precision="month" đổi luôn định dạng và chữ mời mặc định', async () => {
    const empty = await render(<DatePicker precision="month" />, { wrapper: Wrapper });
    expect(empty.getByText('Chọn tháng')).toBeOnTheScreen();

    const filled = await render(<DatePicker precision="month" value="2026-09-08" />, {
      wrapper: Wrapper,
    });
    expect(filled.getByText('09/2026')).toBeOnTheScreen();
  });

  /**
   * ⚠️ `confirm` là mẫu THỨ HAI mà bản vẽ cho phép — Design Note ngay trên nhóm
   * ① ghi *"Button ÁP DỤNG: optional"*. Bật thì chế độ một ngày chạy trên BẢN
   * NHÁP y như chế độ khoảng: bấm ngày KHÔNG bắn `onChange` ra ngoài, và tấm
   * cũng không tự đóng. Dùng khi chọn sai ngày tốn kém.
   */
  it('confirm bật thì bấm ngày chưa báo ra ngoài, phải bấm Áp dụng', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <DatePicker confirm label="Ngày hiệu lực" value="2026-09-15" onChange={onChange} />,
      { wrapper: Wrapper },
    );

    await fireEvent.press(screen.getByLabelText('Ngày hiệu lực, 15/09/2026'));
    await fireEvent.press(screen.getByLabelText('Thứ Ba, 8 tháng 9 năm 2026'));

    // Vẫn đang mở, vẫn chưa có gì bắn ra ngoài.
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Tháng sau')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Áp dụng'));

    expect(dayjs(onChange.mock.calls[0]?.[0]).format('DD/MM/YYYY')).toBe('08/09/2026');
    expect(screen.queryByLabelText('Tháng sau')).toBeNull();
  });

  /** Mặc định KHÔNG có nút xác nhận — thêm prop mới không được đổi hành vi cũ. */
  it('không bật confirm thì tấm trượt không có nút Áp dụng', async () => {
    const screen = await render(<DatePicker label="Ngày hiệu lực" value="2026-09-15" />, {
      wrapper: Wrapper,
    });

    await fireEvent.press(screen.getByLabelText('Ngày hiệu lực, 15/09/2026'));

    expect(screen.queryByText('Áp dụng')).toBeNull();
  });

  /**
   * ⛔ Chỉ ĐÚNG MỘT node mang vai `header` trong tấm trượt.
   *
   * Tiêu đề tấm ("Ngày hiệu lực") là tiêu đề; tiêu đề tháng ("Tháng 9 - 2026")
   * thì không, vì hai node `header` chồng nhau làm TalkBack đếm 2 tiêu đề trong
   * một tấm và điều hướng theo tiêu đề nhảy vào tên tháng thay vì tên trường.
   */
  it('trong tấm trượt chỉ có MỘT tiêu đề cho trình đọc màn hình', async () => {
    const screen = await render(<DatePicker label="Ngày hiệu lực" value="2026-09-15" />, {
      wrapper: Wrapper,
    });

    await fireEvent.press(screen.getByLabelText('Ngày hiệu lực, 15/09/2026'));

    expect(screen.getAllByRole('header')).toHaveLength(1);
  });

  it('chọn tháng trong tấm trượt gọi onChange rồi đóng lại', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <DatePicker label="Kỳ sao kê" precision="month" value="2026-09-08" onChange={onChange} />,
      { wrapper: Wrapper },
    );

    await fireEvent.press(screen.getByLabelText('Kỳ sao kê, 09/2026'));
    await fireEvent.press(screen.getByLabelText('Tháng 3 năm 2026'));

    expect(dayjs(onChange.mock.calls[0]?.[0]).format('DD/MM/YYYY')).toBe('01/03/2026');
    // Lịch đã đóng ⇒ không còn nút chuyển năm nào trên màn hình.
    expect(screen.queryByLabelText('Năm sau')).toBeNull();
  });
});
