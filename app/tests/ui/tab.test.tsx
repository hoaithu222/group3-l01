import { render, userEvent } from '@testing-library/react-native';
import { useState } from 'react';

import { Tabs, type TabItemData } from '@/shared/ui/tab';

/**
 * ⚠️ Chỉ test HÀNH VI — style của NativeWind không có trong Jest
 * (`docs/rules/testing.md`). ⚠️ `render()` của RNTL 14 phải `await`.
 */
const ITEMS: TabItemData[] = [
  { key: 'in', label: 'Tiền vào' },
  { key: 'out', label: 'Tiền ra' },
  { badge: 3, key: 'wait', label: 'Chờ duyệt' },
];

describe('Tabs', () => {
  it('bấm một tab thì báo về đúng khoá của nó', async () => {
    const onChange = jest.fn();
    const screen = await render(<Tabs items={ITEMS} value="in" onChange={onChange} />);

    await userEvent.press(screen.getByText('Tiền ra'));

    expect(onChange).toHaveBeenCalledWith('out');
  });

  /**
   * ⛔ Chỉ MỘT tab ở trạng thái đang chọn, và tín hiệu đó phải nằm ở
   * `accessibilityState.selected` chứ không chỉ ở màu chữ — trình đọc màn hình
   * không thấy màu, mà tab là chỗ người dùng dễ lạc nhất khi không thấy mình
   * đang ở đâu.
   */
  it('chỉ một tab ở trạng thái đang chọn', async () => {
    const screen = await render(<Tabs items={ITEMS} value="out" onChange={jest.fn()} />);

    const tabs = screen.getAllByRole('tab');

    expect(tabs).toHaveLength(3);
    expect(tabs.filter((tab) => tab.props.accessibilityState?.selected)).toHaveLength(1);
    expect(screen.getByRole('tab', { name: 'Tiền ra' })).toBeSelected();
  });

  /**
   * Lỗi đã đo trên máy: sau MỖI lần đổi tab, viên nén mới được chọn mất bo góc (thành hình chữ nhật) — do tab chưa chọn
   * không có nền, lớp nền chỉ dựng sau khi bo góc đã đặt. Jest không thấy style nên không khoá được hình dạng; test này
   * khoá phần HÀNH VI đi cùng: đổi qua lại nhiều lần thì luôn đúng MỘT tab ở trạng thái chọn và mọi tab vẫn bấm được
   * (không kẹt ở trạng thái "đang nhấn").
   */
  it('đổi qua lại nhiều lần: luôn đúng MỘT tab được chọn, tab mới chọn bấm lại được', async () => {
    function Harness() {
      const [value, setValue] = useState('in');
      return <Tabs items={ITEMS} value={value} onChange={setValue} />;
    }
    const screen = await render(<Harness />);

    for (const label of ['Tiền ra', 'Tiền vào', 'Chờ duyệt', 'Tiền ra']) {
      await userEvent.press(screen.getByRole('tab', { name: new RegExp(label) }));
      const selected = screen
        .getAllByRole('tab')
        .filter((tab) => tab.props.accessibilityState?.selected);

      expect(selected).toHaveLength(1);
      expect(screen.getByRole('tab', { name: new RegExp(label) })).toBeSelected();
    }
  });

  it('bấm lại tab đang chọn vẫn báo về (nơi gọi tự lọc nếu cần)', async () => {
    const onChange = jest.fn();
    const screen = await render(<Tabs items={ITEMS} value="in" onChange={onChange} />);

    await userEvent.press(screen.getByText('Tiền vào'));

    expect(onChange).toHaveBeenCalledWith('in');
  });

  it('hiện badge của tab', async () => {
    const screen = await render(<Tabs items={ITEMS} value="in" onChange={jest.fn()} />);

    expect(screen.getByText('3')).toBeOnTheScreen();
  });

  /**
   * `badge: 0` VẪN hiện — "0 hồ sơ chờ duyệt" và "chưa biết có bao nhiêu" là hai
   * chuyện khác nhau; chỉ `undefined` mới ẩn badge.
   */
  it('badge bằng 0 vẫn hiện, không có badge thì không', async () => {
    const withZero = await render(
      <Tabs items={[{ badge: 0, key: 'a', label: 'A' }]} value="a" onChange={jest.fn()} />,
    );
    expect(withZero.getByText('0')).toBeOnTheScreen();

    const without = await render(
      <Tabs items={[{ key: 'a', label: 'A' }]} value="a" onChange={jest.fn()} />,
    );
    expect(without.queryByText('0')).toBeNull();
  });

  it('kiểu gạch chân vẫn đủ tab và vẫn bấm được', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <Tabs items={ITEMS} value="in" variant="underline" onChange={onChange} />,
    );

    expect(screen.getAllByRole('tab')).toHaveLength(3);

    await userEvent.press(screen.getByText('Chờ duyệt'));

    expect(onChange).toHaveBeenCalledWith('wait');
  });

  /**
   * ⛔ Vùng chạm không nhìn thấy được nên không ai bắt được bằng mắt, mà tab hay
   * nằm sát ngay trên một danh sách — bấm trượt là bấm vào dòng bên dưới.
   * Tab viên nén cao đúng 40dp theo Figma (`259:93807`), thiếu 4dp so với ngưỡng
   * 44dp của `docs/rules/mobile-ux.md` ⇒ phải nới 2dp trên/dưới. Kiểu gạch chân
   * đã cao 48dp nên KHÔNG nới, nới thêm là ăn sang nội dung phía dưới.
   */
  it('tab viên nén nới vùng chạm cho đủ 44dp, kiểu gạch chân thì không', async () => {
    const pill = await render(<Tabs items={ITEMS} value="in" onChange={jest.fn()} />);

    for (const tab of pill.getAllByRole('tab')) {
      expect(tab.props.hitSlop).toEqual({ bottom: 2, top: 2 });
    }

    const underline = await render(
      <Tabs items={ITEMS} value="in" variant="underline" onChange={jest.fn()} />,
    );

    for (const tab of underline.getAllByRole('tab')) {
      expect(tab.props.hitSlop).toBeUndefined();
    }
  });

  /**
   * ⚠️ Không kiểm `getByRole('tablist')` được: RNTL chỉ tìm thấy phần tử có cờ
   * `accessible`, mà cờ đó cố ý KHÔNG đặt cho hàng tab — đặt vào là nó gộp mọi
   * tab con thành một phần tử và người dùng khiếm thị hết đường bấm từng tab.
   * Vai `tablist` vẫn được khai cho TalkBack; ở đây kiểm cái quan trọng hơn là
   * bọc trong `ScrollView` rồi thì tab vẫn đủ và vẫn bấm được.
   */
  it('bật cuộn ngang thì vẫn dựng đủ tab và vẫn bấm được', async () => {
    const onChange = jest.fn();
    const screen = await render(<Tabs items={ITEMS} scrollable value="in" onChange={onChange} />);

    expect(screen.getAllByRole('tab')).toHaveLength(3);

    await userEvent.press(screen.getByText('Chờ duyệt'));

    expect(onChange).toHaveBeenCalledWith('wait');
  });
});
