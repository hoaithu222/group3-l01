import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { BusyConflictDialog } from '../../../components/dialogs/BusyConflictDialog';
import { ConfirmHostActionDialog } from '../../../components/dialogs/ConfirmHostActionDialog';
import { renderWithProviders } from '../prejoin/render-helpers';

/** `BusyConflictDialog` (CALL_004, hai biến thể) và `ConfirmHostActionDialog` (xác nhận thao tác chủ trì). */

describe('BusyConflictDialog', () => {
  it('đang ở cuộc gọi khác: hỏi có chuyển sang cuộc họp này không', async () => {
    await renderWithProviders(<BusyConflictDialog sameDevice={false} visible onCancel={jest.fn()} onConfirm={jest.fn()} />);

    expect(screen.getByText('Chuyển sang cuộc họp này?')).toBeOnTheScreen();
    expect(screen.getByText(/^Bạn đang trong một cuộc gọi khác\./)).toBeOnTheScreen();
  });

  it('cùng cuộc họp đang mở ở thiết bị khác: hỏi có chuyển sang thiết bị này không', async () => {
    await renderWithProviders(<BusyConflictDialog sameDevice visible onCancel={jest.fn()} onConfirm={jest.fn()} />);

    expect(screen.getByText('Chuyển sang thiết bị này?')).toBeOnTheScreen();
    expect(screen.getByText(/^Bạn đang tham gia cuộc họp này trên thiết bị khác\./)).toBeOnTheScreen();
    expect(screen.queryByText(/cuộc gọi khác/)).toBeNull();
  });

  it('"Chuyển sang đây" xác nhận, "Huỷ" từ bỏ; đang gọi lại thì nút báo busy và khoá "Huỷ"', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    const { rerender } = await renderWithProviders(
      <BusyConflictDialog sameDevice={false} visible onCancel={onCancel} onConfirm={onConfirm} />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Chuyển sang đây' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await rerender(<BusyConflictDialog loading sameDevice={false} visible onCancel={onCancel} onConfirm={onConfirm} />);
    expect(screen.getByRole('button', { name: 'Chuyển sang đây' })).toBeBusy();
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeDisabled();
  });

  it('visible=false: không dựng gì', async () => {
    await renderWithProviders(<BusyConflictDialog sameDevice={false} visible={false} onCancel={jest.fn()} onConfirm={jest.fn()} />);

    expect(screen.queryByText('Chuyển sang cuộc họp này?')).toBeNull();
  });
});

describe('ConfirmHostActionDialog', () => {
  it('nêu tiêu đề + hậu quả; xác nhận và huỷ gọi đúng handler', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await renderWithProviders(
      <ConfirmHostActionDialog
        confirmLabel="Mời ra"
        description="Lan sẽ bị ngắt khỏi phòng và không vào lại được trong phiên này."
        title="Mời Lan ra khỏi cuộc họp?"
        visible
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText('Mời Lan ra khỏi cuộc họp?')).toBeOnTheScreen();
    expect(screen.getByText(/không vào lại được/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Mời ra' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('tiêu đề là mốc "header" cho trình đọc màn hình; chưa gửi thì chạm nền mờ ("Đóng") cũng là huỷ', async () => {
    const onCancel = jest.fn();
    await renderWithProviders(
      <ConfirmHostActionDialog confirmLabel="Kết thúc" danger description="Mọi người sẽ bị ngắt." title="Kết thúc cuộc họp cho mọi người?" visible onCancel={onCancel} onConfirm={jest.fn()} />,
    );

    expect(screen.getByRole('header', { name: 'Kết thúc cuộc họp cho mọi người?' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1)); // tấm trượt xuống xong mới báo đóng
  });

  it('đang gọi API: nút xác nhận báo busy, không gọi lại; "Huỷ" khoá', async () => {
    const onConfirm = jest.fn();
    await renderWithProviders(
      <ConfirmHostActionDialog confirmLabel="Khoá phòng" description="Không ai vào thêm được." loading title="Khoá phòng họp?" visible onCancel={jest.fn()} onConfirm={onConfirm} />,
    );

    const confirm = screen.getByRole('button', { name: 'Khoá phòng' });
    expect(confirm).toBeBusy();
    await fireEvent.press(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Huỷ' })).toBeDisabled();
  });
});
