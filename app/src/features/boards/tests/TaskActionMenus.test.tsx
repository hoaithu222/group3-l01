import { render, userEvent, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { AttachmentDto } from '../api/task-detail.types';
import { AttachmentsSection } from '../components/task/AttachmentsSection';
import { TaskMenuSheet } from '../components/task/TaskMenuSheet';
import { useDetachFromTask, useTaskAttachments } from '../queries/task-attachments.queries';

/** Thư viện bàn phím gọi native lúc nạp module (`BottomSheet`), và `useSafeAreaInsets` cần provider — cùng lý do `tests/ui/bottom-sheet.test.tsx`. */
jest.mock('react-native-keyboard-controller', () => jest.requireActual('react-native-keyboard-controller/jest'));
jest.mock('../queries/task-attachments.queries', () => ({
  useDetachFromTask: jest.fn(),
  useTaskAttachments: jest.fn(),
}));
// ⚠️ Giá trị trả về phải ỔN ĐỊNH giữa các lần vẽ: `items: []` tạo mới mỗi lần gọi làm khay tệp vẽ lại vô hạn.
const mockUpload = {
  addFiles: jest.fn(),
  cancel: jest.fn(),
  items: [],
  remaining: 5,
  remove: jest.fn(),
  retry: jest.fn(),
};
const mockOpener = { busyAssetId: null, open: jest.fn() };
jest.mock('../hooks/useTaskAttachmentUpload', () => ({ useTaskAttachmentUpload: () => mockUpload }));
jest.mock('../hooks/useOpenAttachment', () => ({ useOpenAttachment: () => mockOpener }));
jest.mock('../components/task/AttachSourceSheet', () => ({ AttachSourceSheet: () => null }));

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};
const Wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={METRICS}>{children}</SafeAreaProvider>
);

beforeEach(() => jest.clearAllMocks());

describe('TaskMenuSheet (menu "…" của chi tiết thẻ)', () => {
  const handlers = () => ({
    onAssignToMe: jest.fn(),
    onClose: jest.fn(),
    onCopyLink: jest.fn(),
    onDelete: jest.fn(),
  });

  it('người sửa được, chưa là người làm, xoá được ⇒ đủ ba hàng; "Xoá thẻ" chạy đúng `onDelete` (sau khi đóng tấm)', async () => {
    const props = handlers();
    const screen = await render(
      <TaskMenuSheet alreadyAssigned={false} assigning={false} canDelete canEdit visible {...props} />,
      { wrapper: Wrapper },
    );

    expect(await screen.findByText('Giao cho tôi')).toBeOnTheScreen();
    expect(screen.getByText('Sao chép link')).toBeOnTheScreen();

    await userEvent.press(screen.getByText('Xoá thẻ'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(props.onDelete).toHaveBeenCalledTimes(1));
    expect(props.onCopyLink).not.toHaveBeenCalled();
  });

  it('người chỉ xem: chỉ còn "Sao chép link" (không "Giao cho tôi", không "Xoá thẻ")', async () => {
    const screen = await render(
      <TaskMenuSheet alreadyAssigned={false} assigning={false} canDelete={false} canEdit={false} visible {...handlers()} />,
      { wrapper: Wrapper },
    );

    expect(await screen.findByText('Sao chép link')).toBeOnTheScreen();
    expect(screen.queryByText('Giao cho tôi')).toBeNull();
    expect(screen.queryByText('Xoá thẻ')).toBeNull();
  });

  it('đã là người làm ⇒ ẩn "Giao cho tôi"; đang giao dở (`assigning`) ⇒ hàng khoá, bấm không chạy', async () => {
    const already = await render(
      <TaskMenuSheet alreadyAssigned assigning={false} canDelete={false} canEdit visible {...handlers()} />,
      { wrapper: Wrapper },
    );
    expect(await already.findByText('Sao chép link')).toBeOnTheScreen();
    expect(already.queryByText('Giao cho tôi')).toBeNull();
    await already.unmount();

    const props = handlers();
    const busy = await render(
      <TaskMenuSheet alreadyAssigned={false} assigning canDelete={false} canEdit visible {...props} />,
      { wrapper: Wrapper },
    );
    await userEvent.press(await busy.findByText('Giao cho tôi'));
    expect(props.onAssignToMe).not.toHaveBeenCalled();
  });
});

describe('AttachmentsSection — gỡ tệp có xác nhận', () => {
  const attachment: AttachmentDto = {
    assetId: 'a1',
    attachedBy: 'u-me',
    createdAt: '2026-09-01T00:00:00.000Z',
    kind: 'FILE',
    mime: 'application/pdf',
    originalName: 'bao-cao.pdf',
    size: 2048,
    thumbnailUrl: null,
  };

  function setup() {
    const mutate = jest.fn();
    (useTaskAttachments as jest.Mock).mockReturnValue({ data: [attachment] });
    (useDetachFromTask as jest.Mock).mockReturnValue({ mutate });
    return mutate;
  }

  const renderSection = () =>
    render(
      <AttachmentsSection attachedCount={1} boardId="b1" canAttach currentUserId="u-me" isAdmin={false} taskId="t1" />,
      { wrapper: Wrapper },
    );

  it('bấm icon gỡ chỉ mở hộp thoại — CHƯA gỡ; "Huỷ" thì giữ nguyên tệp', async () => {
    const mutate = setup();
    const screen = await renderSection();

    await userEvent.press(screen.getByLabelText('Gỡ tệp bao-cao.pdf'));
    expect(await screen.findByText('Gỡ tệp khỏi thẻ?')).toBeOnTheScreen();
    expect(mutate).not.toHaveBeenCalled();

    await userEvent.press(screen.getByText('Huỷ'));
    expect(mutate).not.toHaveBeenCalled();
  });

  it('đồng ý "Gỡ tệp" ⇒ gỡ đúng tệp đã chọn, đúng một lần', async () => {
    const mutate = setup();
    const screen = await renderSection();

    await userEvent.press(screen.getByLabelText('Gỡ tệp bao-cao.pdf'));
    await userEvent.press(await screen.findByText('Gỡ tệp'));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith('a1');
  });
});
