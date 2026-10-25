import { fireEvent, screen } from '@testing-library/react-native';

import { renderEditor } from './split-editor.harness';

describe('SplitEditor — CUSTOM', () => {
  it('chưa nhập số nào ⇒ "Còn thiếu" đủ tổng và nút Lưu KHOÁ', async () => {
    const onSave = await renderEditor({ amount: 90000, initial: { splitType: 'CUSTOM' } });

    expect(screen.getByText('Còn thiếu 90.000 VND')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Lưu khoản chi' })).toBeDisabled();

    await fireEvent.press(screen.getByRole('button', { name: 'Lưu khoản chi' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('gõ thiếu ⇒ báo còn thiếu bao nhiêu (cập nhật từng lần gõ)', async () => {
    await renderEditor({ amount: 90000, initial: { splitType: 'CUSTOM' } });

    await fireEvent.changeText(screen.getByLabelText('Số tiền của An'), '30000');
    await fireEvent.changeText(screen.getByLabelText('Số tiền của Bình'), '50000');

    expect(screen.getByText('Còn thiếu 10.000 VND')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Lưu khoản chi' })).toBeDisabled();
  });

  it('gõ thừa ⇒ báo thừa bao nhiêu, nút Lưu vẫn KHOÁ', async () => {
    await renderEditor({ amount: 90000, initial: { splitType: 'CUSTOM' } });

    await fireEvent.changeText(screen.getByLabelText('Số tiền của An'), '30000');
    await fireEvent.changeText(screen.getByLabelText('Số tiền của Bình'), '70000');

    expect(screen.getByText('Thừa 10.000 VND')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Lưu khoản chi' })).toBeDisabled();
  });

  it('gõ đủ tổng ⇒ báo khớp và nút Lưu MỞ, bấm được', async () => {
    const onSave = await renderEditor({ amount: 90000, initial: { splitType: 'CUSTOM' } });

    await fireEvent.changeText(screen.getByLabelText('Số tiền của An'), '30000');
    await fireEvent.changeText(screen.getByLabelText('Số tiền của Bình'), '60000');

    expect(screen.getByText('Tổng khớp với số tiền khoản chi')).toBeOnTheScreen();
    const save = screen.getByRole('button', { name: 'Lưu khoản chi' });
    expect(save).toBeEnabled();
    await fireEvent.press(save);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('"Chia đều số này" điền điểm xuất phát HỢP LỆ (tổng đúng, phần dư rải từ đầu)', async () => {
    await renderEditor({ amount: 100000, initial: { splitType: 'CUSTOM' } });

    await fireEvent.press(screen.getByText('Chia đều số này'));

    expect(screen.getByText('Tổng khớp với số tiền khoản chi')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Lưu khoản chi' })).toBeEnabled();
  });

  it('bỏ chọn một người thì số đã gõ của họ KHÔNG còn tính vào tổng', async () => {
    await renderEditor({ amount: 60000, initial: { splitType: 'CUSTOM' } });
    await fireEvent.changeText(screen.getByLabelText('Số tiền của An'), '20000');
    await fireEvent.changeText(screen.getByLabelText('Số tiền của Bình'), '20000');
    await fireEvent.changeText(screen.getByLabelText('Số tiền của Cường'), '20000');
    expect(screen.getByText('Tổng khớp với số tiền khoản chi')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Cường' }));

    expect(screen.getByText('Còn thiếu 20.000 VND')).toBeOnTheScreen();
  });
});
