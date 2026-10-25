import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { MoneyInput } from '../components/MoneyInput';

function Harness({
  initial = null,
  max,
  onValue,
}: {
  initial?: number | null;
  max?: number;
  onValue: (value: number | null) => void;
}) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <MoneyInput
      label="Số tiền"
      max={max}
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue(next);
      }}
    />
  );
}

describe('MoneyInput', () => {
  it('gõ số ⇒ chữ trên màn hình có phân cách nghìn, giá trị ra là SỐ NGUYÊN', async () => {
    const onValue = jest.fn();
    await render(<Harness onValue={onValue} />);
    const field = screen.getByLabelText('Số tiền');

    await fireEvent.changeText(field, '1234567');

    expect(onValue).toHaveBeenLastCalledWith(1234567);
    expect(screen.getByDisplayValue('1.234.567')).toBeOnTheScreen();
    expect(screen.getByText('VND')).toBeOnTheScreen();
  });

  it('ký tự không phải chữ số bị lọc (bàn phím Android vẫn có dấu phẩy/trừ)', async () => {
    const onValue = jest.fn();
    await render(<Harness onValue={onValue} />);

    await fireEvent.changeText(screen.getByLabelText('Số tiền'), '-1,5abc');

    expect(onValue).toHaveBeenLastCalledWith(15);
    expect(screen.getByDisplayValue('15')).toBeOnTheScreen();
  });

  it('xoá hết ⇒ null (ô trống KHÁC số 0)', async () => {
    const onValue = jest.fn();
    await render(<Harness initial={5000} onValue={onValue} />);

    await fireEvent.changeText(screen.getByLabelText('Số tiền'), '');

    expect(onValue).toHaveBeenLastCalledWith(null);
  });

  it('gõ "0" là số 0, không phải trống', async () => {
    const onValue = jest.fn();
    await render(<Harness onValue={onValue} />);

    await fireEvent.changeText(screen.getByLabelText('Số tiền'), '0');

    expect(onValue).toHaveBeenLastCalledWith(0);
  });

  it('vượt trần thì GIỮ ở trần (100.000.000), không nhảy sang số lạ', async () => {
    const onValue = jest.fn();
    await render(<Harness onValue={onValue} />);

    await fireEvent.changeText(screen.getByLabelText('Số tiền'), '999999999');

    expect(onValue).toHaveBeenLastCalledWith(100_000_000);
    expect(screen.getByDisplayValue('100.000.000')).toBeOnTheScreen();
  });

  it('trần tuỳ biến (trả nợ tối đa bằng khoản nợ)', async () => {
    const onValue = jest.fn();
    await render(<Harness max={37500} onValue={onValue} />);

    await fireEvent.changeText(screen.getByLabelText('Số tiền'), '50000');

    expect(onValue).toHaveBeenLastCalledWith(37500);
  });

  it('hiện thông báo lỗi dưới ô khi cha truyền message', async () => {
    await render(
      <MoneyInput
        label="Số tiền"
        message="Nhập số tiền lớn hơn 0"
        messageTone="error"
        value={null}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText('Nhập số tiền lớn hơn 0')).toBeOnTheScreen();
  });
});
