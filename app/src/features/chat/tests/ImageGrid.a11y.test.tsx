import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { MessageAttachment } from '../api/chat.types';
import { ImageGrid } from '../components/bubble/ImageGrid';

/**
 * Lưới ảnh trong bong bóng:
 *  · nhãn trợ năng ĐÁNH SỐ ("Ảnh 2 trên 4") — mọi ô cùng xướng "Ảnh đính kèm" thì người dùng khiếm thị không phân biệt được;
 *  · ô không tải được nói rõ là lỗi và bấm là tải lại (không mở trình xem một ảnh hỏng);
 *  · ảnh lỗi khi vẽ (URL ký hết hạn) ⇒ xin URL mới một lần rồi mới báo lỗi.
 */

const mockRefetch = jest.fn();
const mockAssetState: { failedIds: Set<string> } = { failedIds: new Set() };
jest.mock('@/core/uploads/use-asset-url', () => ({
  useAssetUrl: (assetId: string) =>
    mockAssetState.failedIds.has(assetId)
      ? { data: undefined, isError: true, isLoading: false, refetch: mockRefetch }
      : {
          data: { url: `https://cdn.example/${assetId}` },
          isError: false,
          isLoading: false,
          refetch: mockRefetch,
        },
}));

/** Mọi `onError` của phần tử ảnh `expo-image`, theo thứ tự xuất hiện — cùng lối đi bộ trên cây của `tests/ui/avatar.test.tsx`. */
type TreeNode = { children?: unknown[]; props?: Record<string, unknown> };
function collectImageErrors(
  node: TreeNode,
  found: ((event: unknown) => void)[] = [],
): ((event: unknown) => void)[] {
  if (typeof node?.props?.onError === 'function')
    found.push(node.props.onError as (event: unknown) => void);
  for (const child of node?.children ?? []) {
    if (child && typeof child === 'object') collectImageErrors(child as TreeNode, found);
  }
  return found;
}

function photo(assetId: string): MessageAttachment {
  return {
    assetId,
    kind: 'IMAGE',
    mime: 'image/jpeg',
    name: `${assetId}.jpg`,
  } as unknown as MessageAttachment;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAssetState.failedIds = new Set();
});

describe('ImageGrid — nhãn trợ năng', () => {
  it('một ảnh ⇒ "Ảnh đính kèm" (không cần đánh số)', async () => {
    await render(<ImageGrid attachments={[photo('a')]} onOpen={jest.fn()} />);
    expect(
      screen.getByRole('imagebutton', { name: 'Ảnh đính kèm, chạm để xem' }),
    ).toBeOnTheScreen();
  });

  it('nhiều ảnh ⇒ đánh số từng ô để phân biệt được', async () => {
    await render(
      <ImageGrid attachments={[photo('a'), photo('b'), photo('c')]} onOpen={jest.fn()} />,
    );
    expect(
      screen.getByRole('imagebutton', { name: 'Ảnh 1 trên 3, chạm để xem' }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('imagebutton', { name: 'Ảnh 2 trên 3, chạm để xem' }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('imagebutton', { name: 'Ảnh 3 trên 3, chạm để xem' }),
    ).toBeOnTheScreen();
  });

  it('bấm ô nào mở đúng ảnh đó trong trình xem', async () => {
    const onOpen = jest.fn();
    await render(<ImageGrid attachments={[photo('a'), photo('b')]} onOpen={onOpen} />);

    await fireEvent.press(screen.getByRole('imagebutton', { name: 'Ảnh 2 trên 2, chạm để xem' }));

    expect(onOpen).toHaveBeenCalledWith(1);
  });
});

describe('ImageGrid — ô không tải được', () => {
  it('xin URL lỗi ⇒ nhãn nói rõ, bấm là tải lại chứ KHÔNG mở trình xem', async () => {
    mockAssetState.failedIds = new Set(['b']);
    const onOpen = jest.fn();
    await render(<ImageGrid attachments={[photo('a'), photo('b')]} onOpen={onOpen} />);

    await fireEvent.press(
      screen.getByRole('imagebutton', { name: 'Ảnh 2 trên 2, không tải được, chạm để thử lại' }),
    );

    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
    // Ô còn lại không bị ảnh hưởng.
    expect(
      screen.getByRole('imagebutton', { name: 'Ảnh 1 trên 2, chạm để xem' }),
    ).toBeOnTheScreen();
  });

  it('ảnh vẽ lỗi: lần đầu tự xin URL mới (ô vẫn bình thường), lần hai mới báo lỗi', async () => {
    await render(<ImageGrid attachments={[photo('a')]} onOpen={jest.fn()} />);

    const [onError] = collectImageErrors(screen.root as unknown as TreeNode);
    expect(onError).toBeDefined();

    await act(async () => onError?.({ nativeEvent: { error: 'not found' } }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('imagebutton', { name: 'Ảnh đính kèm, chạm để xem' }),
    ).toBeOnTheScreen();

    const [onErrorAgain] = collectImageErrors(screen.root as unknown as TreeNode);
    await act(async () => onErrorAgain?.({ nativeEvent: { error: 'not found' } }));

    expect(
      screen.getByRole('imagebutton', { name: 'Ảnh đính kèm, không tải được, chạm để thử lại' }),
    ).toBeOnTheScreen();
  });
});
