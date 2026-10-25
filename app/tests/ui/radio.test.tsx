import { render, userEvent } from '@testing-library/react-native';

import { Radio, RadioGroup } from '@/shared/ui/radio';

/**
 * ⚠️ Chỉ test HÀNH VI — style của NativeWind không có trong Jest
 * (`docs/rules/testing.md`). ⚠️ `render()` của RNTL 14 phải `await`.
 */
describe('RadioGroup', () => {
  const renderGroup = (props: { disabled?: boolean; onChange?: () => void; value?: string }) =>
    render(
      <RadioGroup
        accessibilityLabel="Kỳ hạn"
        value={props.value}
        onChange={props.onChange ?? jest.fn()}
      >
        <Radio label="1 tháng" value="1m" />
        <Radio disabled={props.disabled} label="3 tháng" value="3m" />
        <Radio label="6 tháng" value="6m" />
      </RadioGroup>,
    );

  it('bấm một lựa chọn thì nhóm nhận đúng giá trị của nó', async () => {
    const onChange = jest.fn();
    const screen = await renderGroup({ onChange, value: '1m' });

    await userEvent.press(screen.getByLabelText('6 tháng'));

    expect(onChange).toHaveBeenCalledWith('6m');
  });

  /**
   * ⛔ Quy tắc sống còn của radio: CHỈ MỘT nút sáng.
   *
   * Ca hỏng kinh điển là mỗi nút tự giữ `selected`, rồi một nhánh cập nhật quên
   * tắt nút cũ — người dùng thấy hai kỳ hạn cùng sáng và không biết mình đang
   * chọn cái nào. Ở đây trạng thái nằm ở NHÓM nên không có chỗ cho lỗi đó, và
   * test này canh cho nó không quay lại.
   */
  it('chỉ một lựa chọn ở trạng thái đang chọn', async () => {
    const screen = await renderGroup({ value: '3m' });

    expect(screen.getByLabelText('3 tháng')).toBeSelected();
    expect(screen.getByLabelText('1 tháng')).not.toBeSelected();
    expect(screen.getByLabelText('6 tháng')).not.toBeSelected();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('chưa chọn gì thì không nút nào sáng', async () => {
    const screen = await renderGroup({ value: undefined });

    for (const option of screen.getAllByRole('radio')) {
      expect(option).not.toBeSelected();
    }
  });

  /**
   * Bấm lại nút ĐANG chọn không bắn sự kiện: nơi gọi thường nối `onChange` vào
   * một lượt gọi mạng (tính lại lãi suất), và bắn lại y nguyên giá trị cũ là
   * một lượt gọi thừa mà không ai ngờ tới.
   */
  it('bấm lại nút đang chọn thì không bắn sự kiện', async () => {
    const onChange = jest.fn();
    const screen = await renderGroup({ onChange, value: '1m' });

    await userEvent.press(screen.getByLabelText('1 tháng'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('lựa chọn bị khoá thì không bấm được', async () => {
    const onChange = jest.fn();
    const screen = await renderGroup({ disabled: true, onChange, value: '1m' });

    await userEvent.press(screen.getByLabelText('3 tháng'));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByLabelText('3 tháng')).toBeDisabled();
  });

  /**
   * ⛔ `Radio` đứng ngoài nhóm thì VẪN VẼ RA bình thường, chỉ là bấm mãi không
   * sáng — lỗi lọt qua cả `tsc` lẫn code review và chỉ lộ ra trên máy người
   * dùng. Nên component ném lỗi ngay ở lần render đầu tiên.
   */
  it('Radio nằm ngoài RadioGroup thì ném lỗi ngay', async () => {
    // React in ra `console.error` khi cây render ném lỗi — bịt lại cho khỏi rác.
    const silence = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(async () => {
      await render(<Radio label="Lạc loài" value="x" />);
    }).rejects.toThrow('RadioGroup');

    silence.mockRestore();
  });
});
