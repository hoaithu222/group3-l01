import { fireEvent, render, screen } from '@testing-library/react-native';

import { accessibleGroupsHidingButtons } from '../../../../tests/helpers/a11y-groups';
import { UploadQueueRow } from '../components/UploadQueueRow';
import type { QueueRow } from '../utils/upload-queue';

/**
 * Hàng hàng-đợi upload: tên + dung lượng + trạng thái, kèm Thử lại / Huỷ / Bỏ.
 *
 * Trước đây khối gốc là `View accessible` ⇒ ba nút bên trong không tới được bằng trình đọc màn hình; và ba nút cùng
 * nhãn "Huỷ"/"Bỏ" ở MỖI hàng nên TalkBack đọc "Huỷ, nút" mười lần không phân biệt được tệp nào.
 */
const row = (overrides: Partial<QueueRow>): QueueRow => ({
  canCancel: false,
  localId: 'local-1',
  name: 'bao-cao.pdf',
  progress: 40,
  retry: null,
  size: 2048,
  state: 'queued',
  ...overrides,
});

const handlers = () => ({ onCancel: jest.fn(), onDismiss: jest.fn(), onRetry: jest.fn() });

describe('UploadQueueRow — trợ năng', () => {
  it('nút không bị nuốt vào một ô `accessible` bao ngoài', async () => {
    const view = await render(
      <UploadQueueRow
        {...handlers()}
        row={row({ canCancel: true, retry: 'upload', state: 'failed' })}
      />,
    );

    expect(accessibleGroupsHidingButtons(view.toJSON())).toEqual([]);
  });

  it('nhãn nút nêu TÊN TỆP — hai hàng không còn trùng "Huỷ"', async () => {
    const h = handlers();
    await render(
      <>
        <UploadQueueRow {...h} row={row({ canCancel: true, localId: 'a', name: 'bao-cao.pdf' })} />
        <UploadQueueRow {...h} row={row({ canCancel: true, localId: 'b', name: 'anh-lop.png' })} />
      </>,
    );

    expect(screen.getByRole('button', { name: 'Huỷ tải lên bao-cao.pdf' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Huỷ tải lên anh-lop.png' })).toBeOnTheScreen();
  });

  it('bấm nút đúng hàng gọi đúng callback với đúng đối số', async () => {
    const h = handlers();
    const failed = row({ localId: 'x', retry: 'upload', state: 'failed' });
    await render(<UploadQueueRow {...h} row={failed} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Thử lại tải lên bao-cao.pdf' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Bỏ bao-cao.pdf khỏi danh sách' }));

    expect(h.onRetry).toHaveBeenCalledWith(failed);
    expect(h.onDismiss).toHaveBeenCalledWith('x');
  });

  it('khối chữ vẫn đọc thành MỘT câu: tên, dung lượng, trạng thái', async () => {
    await render(<UploadQueueRow {...handlers()} row={row({ state: 'queued' })} />);

    expect(screen.getByLabelText('bao-cao.pdf, 2 KB, Đang chờ')).toBeOnTheScreen();
  });
});
