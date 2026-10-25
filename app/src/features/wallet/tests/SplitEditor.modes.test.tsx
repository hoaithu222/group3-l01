import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ExpenseSaveBar } from '../components/ExpenseSaveBar';
import { METRICS, renderEditor } from './split-editor.harness';

describe('SplitEditor — PERCENT', () => {
  it('tổng phần trăm sai ⇒ báo thiếu/thừa bằng %', async () => {
    await renderEditor({ amount: 100000, initial: { splitType: 'PERCENT' } });

    await fireEvent.changeText(screen.getByLabelText('Phần trăm của An'), '50');
    await fireEvent.changeText(screen.getByLabelText('Phần trăm của Bình'), '40');
    expect(screen.getByText('Còn thiếu 10%')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Lưu khoản chi' })).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('Phần trăm của Cường'), '15');
    expect(screen.getByText('Thừa 5%')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Phần trăm của Cường'), '10,5');
    expect(screen.getByText('Thừa 0,5%')).toBeOnTheScreen();
  });

  it('đủ 100% ⇒ mở nút Lưu', async () => {
    await renderEditor({ amount: 100000, initial: { splitType: 'PERCENT' } });

    await fireEvent.changeText(screen.getByLabelText('Phần trăm của An'), '50');
    await fireEvent.changeText(screen.getByLabelText('Phần trăm của Bình'), '30');
    await fireEvent.changeText(screen.getByLabelText('Phần trăm của Cường'), '20');

    expect(screen.getByText('Đủ 100%')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Lưu khoản chi' })).toBeEnabled();
  });
});

describe('SplitEditor — EQUAL', () => {
  it('hiện "mỗi người … · người trả chịu phần lẻ …" đúng theo quy tắc làm tròn của BE', async () => {
    // 100.003 / 3 người (gồm người trả An): mỗi người 33.334, lẻ 1 do An chịu
    await renderEditor({ amount: 100003 });
    expect(screen.getByText('Mỗi người 33.334 VND · Bạn chịu phần lẻ 1 VND')).toBeOnTheScreen();
  });

  it('chia chẵn thì KHÔNG nhắc phần lẻ', async () => {
    await renderEditor({ amount: 90000 });
    expect(screen.getByText('Mỗi người 30.000 VND')).toBeOnTheScreen();
  });

  it('chưa nhập số tiền ⇒ nhắc nhập (không tô lỗi), nút Lưu khoá', async () => {
    await renderEditor({ amount: null });
    expect(screen.getByText('Nhập số tiền để bắt đầu chia')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Lưu khoản chi' })).toBeDisabled();
  });

  it('bỏ hết người ⇒ "Chọn ít nhất một người" và khoá nút', async () => {
    await renderEditor({ amount: 90000 });
    await fireEvent.press(screen.getByText('Bỏ chọn tất cả'));
    expect(screen.getByText('Chọn ít nhất một người tham gia')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Lưu khoản chi' })).toBeDisabled();
  });

  it('đổi sang Tuỳ chỉnh rồi về Chia đều KHÔNG mất danh sách người', async () => {
    await renderEditor({ amount: 90000 });
    await fireEvent.press(screen.getByText('Tuỳ chỉnh'));
    await fireEvent.press(screen.getByText('Chia đều'));
    expect(screen.getByText('Mỗi người 30.000 VND')).toBeOnTheScreen();
  });
});

describe('ExpenseSaveBar', () => {
  it('mất mạng ⇒ nhãn "Kết nối lại để lưu" và khoá, dù form hợp lệ', async () => {
    await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ExpenseSaveBar canSave offline onSave={jest.fn()} />
      </SafeAreaProvider>,
    );
    expect(screen.getByRole('button', { name: 'Kết nối lại để lưu' })).toBeDisabled();
  });
});
