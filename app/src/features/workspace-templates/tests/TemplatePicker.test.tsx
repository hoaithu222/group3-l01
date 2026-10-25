import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import type { TemplateSelection } from '@/shared/workspace-templates';

import { TemplatePicker, type TemplatePickerProps } from '../components/TemplatePicker';
import { TEMPLATES } from './fixtures';

/**
 * `TemplatePicker` (app.md p5-04 §8): chọn mẫu ⇒ tick sẵn đúng kênh `defaultSelected`; bỏ tick ⇒ bỏ khỏi `channelKeys`; "Không dùng
 * mẫu" ⇒ `null`. Component THUẦN, controlled — `Harness` giữ state như form tạo nhóm và ghi lại từng giá trị `onChange`.
 */

const changes: (TemplateSelection | null)[] = [];

function Harness(props: Partial<TemplatePickerProps> & { initial?: TemplateSelection | null }) {
  const { initial = null, ...rest } = props;
  const [value, setValue] = useState<TemplateSelection | null>(initial);
  return (
    <TemplatePicker
      templates={TEMPLATES}
      value={value}
      onChange={(next) => {
        changes.push(next);
        setValue(next);
      }}
      {...rest}
    />
  );
}

const channelBox = (name: RegExp) => screen.getByRole('checkbox', { name });

beforeEach(() => {
  changes.length = 0;
});

describe('TemplatePicker', () => {
  it('chưa chọn mẫu: "Không dùng mẫu" đang chọn, ba thẻ mẫu hiện, CHƯA có danh sách kênh', async () => {
    await render(<Harness />);

    expect(screen.getByText('Không dùng mẫu')).toBeOnTheScreen();
    for (const name of ['Nhóm môn học', 'Đồ án', 'Nhóm tự học'])
      expect(screen.getByText(name)).toBeOnTheScreen();
    for (const count of ['3 kênh', '2 kênh', '1 kênh'])
      expect(screen.getByText(count)).toBeOnTheScreen();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('chọn mẫu: tick sẵn ĐÚNG các kênh defaultSelected (theo thứ tự của mẫu), kênh còn lại bỏ trống', async () => {
    await render(<Harness />);

    await fireEvent.press(screen.getByText('Nhóm môn học'));

    expect(changes).toEqual([{ channelKeys: ['thong-bao', 'thao-luan'], code: 'course' }]);
    expect(screen.getByText('Kênh sẽ tạo (2/3)')).toBeOnTheScreen();
    expect(channelBox(/Kênh Thông báo/)).toBeChecked();
    expect(channelBox(/Kênh Thảo luận/)).toBeChecked();
    expect(channelBox(/Kênh Phòng học/)).not.toBeChecked();
  });

  it('bỏ tick một kênh ⇒ bỏ khỏi channelKeys; tick lại ⇒ về ĐÚNG thứ tự khai báo, không theo thứ tự tick', async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByText('Nhóm môn học'));

    await fireEvent.press(channelBox(/Kênh Thông báo/));
    expect(changes.at(-1)).toEqual({ channelKeys: ['thao-luan'], code: 'course' });
    expect(channelBox(/Kênh Thông báo/)).not.toBeChecked();

    await fireEvent.press(channelBox(/Kênh Phòng học/));
    await fireEvent.press(channelBox(/Kênh Thông báo/));
    expect(changes.at(-1)).toEqual({
      channelKeys: ['thong-bao', 'thao-luan', 'phong-hoc'],
      code: 'course',
    });
  });

  it('bỏ tick HẾT kênh: vẫn là lựa chọn hợp lệ ("dùng mẫu nhưng không tạo kênh nào"), channelKeys rỗng', async () => {
    await render(<Harness initial={{ channelKeys: ['ghi-chu'], code: 'tu-hoc' }} />);

    await fireEvent.press(channelBox(/Kênh Ghi chú/));

    expect(changes.at(-1)).toEqual({ channelKeys: [], code: 'tu-hoc' });
    expect(screen.getByText('Kênh sẽ tạo (0/1)')).toBeOnTheScreen();
  });

  it('đổi sang mẫu khác: đặt lại theo defaultSelected của mẫu MỚI, không mang kênh của mẫu cũ', async () => {
    await render(<Harness />);
    await fireEvent.press(screen.getByText('Nhóm môn học'));

    await fireEvent.press(screen.getByText('Đồ án'));

    expect(changes.at(-1)).toEqual({ channelKeys: ['tien-do'], code: 'capstone' });
    expect(screen.queryByRole('checkbox', { name: /Kênh Thông báo/ })).toBeNull();
    expect(channelBox(/Kênh Tiến độ/)).toBeChecked();
    expect(channelBox(/Kênh Tài liệu, .*Riêng tư/)).not.toBeChecked();
  });

  it('"Không dùng mẫu" ⇒ onChange(null) và ẩn danh sách kênh', async () => {
    await render(<Harness initial={{ channelKeys: ['tien-do'], code: 'capstone' }} />);
    expect(channelBox(/Kênh Tiến độ/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Không dùng mẫu'));

    expect(changes.at(-1)).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('allowNone=false (áp mẫu cho nhóm đã có): không có dòng "Không dùng mẫu"', async () => {
    await render(<Harness allowNone={false} />);

    expect(screen.queryByText('Không dùng mẫu')).toBeNull();
    expect(screen.getByText('Nhóm môn học')).toBeOnTheScreen();
  });

  it('nhãn kênh nói rõ loại · công khai/riêng tư · quyền đăng; kênh dự kiến bị bỏ qua có cảnh báo bằng CHỮ', async () => {
    await render(
      <Harness
        initial={{ channelKeys: ['thong-bao', 'thao-luan'], code: 'course' }}
        skips={{ 'thao-luan': 'NAME_EXISTS', 'phong-hoc': 'TYPE_UNAVAILABLE' }}
      />,
    );

    expect(
      channelBox(
        /Kênh Thông báo, Kênh chữ · Công khai · Chỉ quản trị viên đăng, Thông báo của giảng viên$/,
      ),
    ).toBeOnTheScreen();
    expect(screen.getByText('Có thể bị bỏ qua — đã có kênh trùng tên')).toBeOnTheScreen();
    expect(screen.getByText('Có thể bị bỏ qua — loại kênh này chưa được bật')).toBeOnTheScreen();
    // Cảnh báo cũng nằm trong nhãn trợ năng của ô — người dùng trình đọc màn hình nghe được.
    expect(channelBox(/Kênh Thảo luận.*Có thể bị bỏ qua — đã có kênh trùng tên/)).toBeChecked();
  });

  it('disabled (đang gửi): thẻ mẫu và ô tick đều bị khoá, không phát onChange', async () => {
    await render(<Harness disabled initial={{ channelKeys: ['thong-bao'], code: 'course' }} />);

    await fireEvent.press(screen.getByText('Đồ án'));
    await fireEvent.press(channelBox(/Kênh Thảo luận/));

    expect(changes).toEqual([]);
    expect(channelBox(/Kênh Thảo luận/)).toBeDisabled();
  });
});
