import { fireEvent, render } from '@testing-library/react-native';

import { FileTile, iconForMime } from '@/shared/ui/file-tile';

import { accessibleGroupsHidingButtons } from '../helpers/a11y-groups';

/**
 * `FileTile` (p0-12): thẻ MỘT tệp — icon theo MIME, tên, dung lượng đọc được, và theo trạng thái (đang tải lên / hỏng / sẵn sàng)
 * hiện đúng nút. Chỉ test HÀNH VI; `render()` của RNTL 14 phải `await`, `fireEvent.*` cũng vậy.
 */
const PDF = { mime: 'application/pdf', name: 'bao-cao.pdf', size: 2_516_582 } as const; // 2,4 MB

describe('FileTile — sẵn sàng', () => {
  it('có onOpen ⇒ thẻ là MỘT nút đọc "tên, dung lượng", bấm để mở', async () => {
    const onOpen = jest.fn();
    const screen = await render(<FileTile {...PDF} onOpen={onOpen} />);

    await fireEvent.press(screen.getByRole('button', { name: 'bao-cao.pdf, 2,4 MB' }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(screen.getByText('2,4 MB')).toBeOnTheScreen();
  });

  it('không có onOpen ⇒ chỉ để xem, KHÔNG là nút', async () => {
    const screen = await render(<FileTile {...PDF} />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByLabelText('bao-cao.pdf, 2,4 MB')).toBeOnTheScreen();
  });

  it('dung lượng không biết ⇒ không hiện, nhãn chỉ có tên', async () => {
    const screen = await render(<FileTile mime="text/plain" name="ghi-chu.txt" size={null} />);

    expect(screen.getByLabelText('ghi-chu.txt')).toBeOnTheScreen();
  });
});

describe('FileTile — đang tải lên', () => {
  it('hiện tiến độ trong dòng phụ + vòng tiến độ; nút Huỷ gọi onCancel; thẻ KHÔNG mở được', async () => {
    const onCancel = jest.fn();
    const onOpen = jest.fn();
    const screen = await render(
      <FileTile {...PDF} progress={0.45} status="uploading" onCancel={onCancel} onOpen={onOpen} />,
    );

    expect(screen.getByText('Đang tải lên 45% · 2,4 MB')).toBeOnTheScreen();
    expect(screen.getByRole('progressbar')).toHaveAccessibilityValue({ max: 100, min: 0, now: 45 });
    await fireEvent.press(screen.getByRole('button', { name: 'Huỷ tải lên' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByLabelText('bao-cao.pdf, 2,4 MB, Đang tải lên 45%')).toBeOnTheScreen();
  });

  it('chưa biết tiến độ ⇒ vòng quay liên tục (busy), không bịa số phần trăm', async () => {
    const screen = await render(<FileTile {...PDF} status="uploading" />);

    expect(screen.getByRole('progressbar')).toBeBusy();
  });

  it('không truyền onCancel ⇒ không có nút Huỷ', async () => {
    const screen = await render(<FileTile {...PDF} progress={0.1} status="uploading" />);

    expect(screen.queryByRole('button', { name: 'Huỷ tải lên' })).toBeNull();
  });
});

describe('FileTile — hỏng', () => {
  it('báo "Tải lên thất bại" và nút Thử tải lại gọi onRetry', async () => {
    const onRetry = jest.fn();
    const screen = await render(<FileTile {...PDF} status="failed" onRetry={onRetry} />);

    expect(screen.getByText('Tải lên thất bại · 2,4 MB')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Thử tải lại' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('thẻ hỏng không mở được dù có onOpen', async () => {
    const onOpen = jest.fn();
    const screen = await render(<FileTile {...PDF} status="failed" onOpen={onOpen} />);

    expect(screen.queryByRole('button', { name: /bao-cao\.pdf/ })).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe('FileTile — trợ năng', () => {
  it('nút Huỷ/Thử lại KHÔNG nằm trong một phần tử `accessible` khác (không "nút ma" với TalkBack)', async () => {
    const uploading = await render(
      <FileTile {...PDF} progress={0.3} status="uploading" onCancel={jest.fn()} />,
    );
    const failed = await render(<FileTile {...PDF} status="failed" onRetry={jest.fn()} />);

    expect(accessibleGroupsHidingButtons(uploading.toJSON())).toEqual([]);
    expect(accessibleGroupsHidingButtons(failed.toJSON())).toEqual([]);
  });
});

describe('iconForMime', () => {
  it.each([
    ['image/png', 'image'],
    ['video/mp4', 'play'],
    ['audio/mpeg', 'audio'],
    ['application/pdf', 'document'],
    ['text/plain', 'document-2'],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'document-2'],
    ['application/vnd.ms-excel', 'document-2'],
    ['application/zip', 'file-2'],
    ['', 'file-2'],
  ])('%s → %s', (mime, icon) => {
    expect(iconForMime(mime)).toBe(icon);
  });

  it('null/undefined ⇒ file-2 (không ném)', () => {
    expect(iconForMime(null)).toBe('file-2');
    expect(iconForMime(undefined)).toBe('file-2');
  });
});
