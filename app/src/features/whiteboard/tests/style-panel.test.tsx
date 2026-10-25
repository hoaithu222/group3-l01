import { fireEvent, screen } from '@testing-library/react-native';

import { StylePanel, type StylePanelProps } from '../components/StylePanel';
import { WB_PALETTE } from '../constants/palette';
import { DEFAULT_STYLE, type ToolStyle } from '../store/whiteboard-ui.store';
import { renderWithProviders } from './wb.harness';

/**
 * Tấm "Kiểu vẽ": mỗi nhóm là lựa chọn CHỌN MỘT (radio) có trạng thái đọc được bằng trình đọc màn hình — màu là lưới chấm tròn
 * (tên màu ở nhãn trợ năng + ở tiêu đề nhóm), độ dày/tô nền/cỡ chữ là chip chia đều hàng. Test hành vi: nhãn, `checked`, patch gửi đi.
 */
function makeProps(style: Partial<ToolStyle> = {}, over: Partial<StylePanelProps> = {}) {
  const props: StylePanelProps = {
    hasSelection: false,
    onChange: jest.fn(),
    onClose: jest.fn(),
    style: { ...DEFAULT_STYLE, ...style },
    visible: true,
    ...over,
  };
  return props;
}

describe('StylePanel — màu nét', () => {
  it('mỗi màu là một ô chọn-một mang TÊN màu; ô đang chọn `checked`; tiêu đề nhóm nói màu đang chọn', async () => {
    await renderWithProviders(<StylePanel {...makeProps({ stroke: 'blue' })} />);

    expect(screen.getByText('Màu nét · Xanh dương')).toBeOnTheScreen();
    for (const entry of WB_PALETTE) {
      expect(screen.getByRole('radio', { name: entry.label })).toBeOnTheScreen();
    }
    expect(screen.getByRole('radio', { name: 'Xanh dương' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Đỏ' })).not.toBeChecked();
  });

  it('chạm một màu gửi đúng id token màu (không phải mã hex)', async () => {
    const props = makeProps({ stroke: 'ink' });
    await renderWithProviders(<StylePanel {...props} />);

    await fireEvent.press(screen.getByRole('radio', { name: 'Đỏ' }));
    expect(props.onChange).toHaveBeenCalledWith({ stroke: 'red' });
  });

  it('id màu lạ (máy khác ghi) rơi về "Đen" ở CẢ tiêu đề lẫn lưới — không để nhóm màu không có ô nào được chọn', async () => {
    await renderWithProviders(<StylePanel {...makeProps({ stroke: 'magenta' })} />);

    expect(screen.getByText('Màu nét · Đen')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Đen' })).toBeChecked();
  });
});

describe('StylePanel — độ dày, tô nền, cỡ chữ', () => {
  it('độ dày nét: ba lựa chọn có tên, đúng ô đang chọn, chạm "Dày" gửi width 8', async () => {
    const props = makeProps({ width: 4 });
    await renderWithProviders(<StylePanel {...props} />);

    expect(screen.getByRole('radio', { name: 'Vừa' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Mảnh' })).not.toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Dày' }));
    expect(props.onChange).toHaveBeenCalledWith({ width: 8 });
  });

  it('tô nền: "Tô cùng màu" tô bằng CHÍNH màu nét đang chọn; "Không tô" gửi null', async () => {
    const props = makeProps({ fill: null, stroke: 'green' });
    await renderWithProviders(<StylePanel {...props} />);

    expect(screen.getByRole('radio', { name: 'Không tô' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Tô cùng màu' }));
    expect(props.onChange).toHaveBeenCalledWith({ fill: 'green' });
    await fireEvent.press(screen.getByRole('radio', { name: 'Không tô' }));
    expect(props.onChange).toHaveBeenLastCalledWith({ fill: null });
  });

  it('cỡ chữ: đúng ô đang chọn, chạm "28" gửi fontSize 28', async () => {
    const props = makeProps({ fontSize: 20 });
    await renderWithProviders(<StylePanel {...props} />);

    expect(screen.getByRole('radio', { name: '20' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: '28' }));
    expect(props.onChange).toHaveBeenCalledWith({ fontSize: 28 });
  });

  it('có phần tử đang chọn: mô tả nói rõ kiểu mới áp cho chúng; không có thì không nói', async () => {
    const view = await renderWithProviders(
      <StylePanel {...makeProps({}, { hasSelection: true })} />,
    );
    expect(screen.getByText('Áp cho cả phần tử đang chọn.')).toBeOnTheScreen();

    await view.unmount();
    await renderWithProviders(<StylePanel {...makeProps()} />);
    expect(screen.queryByText('Áp cho cả phần tử đang chọn.')).toBeNull();
  });
});
