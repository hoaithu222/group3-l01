import { fireEvent, render } from '@testing-library/react-native';

import type { UploadItem } from '@/core/uploads/upload.types';

import { AttachmentTray } from '../AttachmentTray';

/**
 * ⚠️ Chỉ test HÀNH VI — NativeWind không biên dịch `className` trong Jest, xem
 * `docs/rules/testing.md`. `render()` của RNTL 14 là BẤT ĐỒNG BỘ, phải `await`.
 */
function item(overrides: Partial<UploadItem> = {}): UploadItem {
  return {
    localId: 'local-1',
    scope: 'MESSAGE',
    kind: 'FILE',
    uri: 'file:///a.pdf',
    name: 'bao-cao.pdf',
    mime: 'application/pdf',
    size: 2048,
    status: 'uploading',
    progress: 40,
    ...overrides,
  };
}

describe('AttachmentTray', () => {
  it('ẩn hoàn toàn khi không có item', async () => {
    const screen = await render(
      <AttachmentTray items={[]} onCancel={jest.fn()} onRetry={jest.fn()} />,
    );

    expect(screen.toJSON()).toBeNull();
  });

  it('hiện tên và dung lượng của item', async () => {
    const screen = await render(
      <AttachmentTray items={[item()]} onCancel={jest.fn()} onRetry={jest.fn()} />,
    );

    expect(screen.getByText('bao-cao.pdf')).toBeOnTheScreen();
    expect(screen.getByText('2 KB')).toBeOnTheScreen();
  });

  it('nút huỷ gọi onCancel với đúng localId khi đang tải', async () => {
    const onCancel = jest.fn();
    const screen = await render(
      <AttachmentTray items={[item()]} onCancel={onCancel} onRetry={jest.fn()} />,
    );

    fireEvent.press(screen.getByLabelText('Huỷ tải lên'));

    expect(onCancel).toHaveBeenCalledWith('local-1');
  });

  it('lỗi hiện nhãn theo mã ASSET_002 và nút thử lại gọi onRetry', async () => {
    const onRetry = jest.fn();
    const screen = await render(
      <AttachmentTray
        items={[item({ status: 'failed', errorCode: 'ASSET_002' })]}
        onCancel={jest.fn()}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('Tệp quá lớn')).toBeOnTheScreen();

    fireEvent.press(screen.getByLabelText('Thử lại'));

    expect(onRetry).toHaveBeenCalledWith('local-1');
  });

  it('câu lỗi dài hiện ĐỦ chữ và được phép xuống tối thiểu 3 dòng (không cắt ở 2 dòng)', async () => {
    const screen = await render(
      <AttachmentTray
        items={[item({ status: 'failed', errorCode: 'ASSET_004' })]}
        onCancel={jest.fn()}
        onRetry={jest.fn()}
      />,
    );

    const message = screen.getByText('Bạn không thể thao tác với tệp này ở trạng thái hiện tại');

    expect(message).toBeOnTheScreen();
    expect(message.props.numberOfLines).toBeGreaterThanOrEqual(3);
  });

  it('item READY hiện nút xoá, gọi onRemove', async () => {
    const onRemove = jest.fn();
    const screen = await render(
      <AttachmentTray
        items={[item({ status: 'ready', progress: 100 })]}
        onCancel={jest.fn()}
        onRemove={onRemove}
        onRetry={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByLabelText('Xoá tệp'));

    expect(onRemove).toHaveBeenCalledWith('local-1');
  });

  it('item paused hiện nhãn "Tạm dừng"', async () => {
    const screen = await render(
      <AttachmentTray
        items={[item({ status: 'paused' })]}
        onCancel={jest.fn()}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByText('Tạm dừng')).toBeOnTheScreen();
  });
});
