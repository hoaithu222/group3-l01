import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { SPACING } from '@/shared/theme';

import type { MessageAttachment } from '../api/chat.types';
import { MediaViewerToolbar } from '../components/media/MediaViewerToolbar';

jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('../components/media/save-to-library', () => ({ saveAssetToLibrary: jest.fn() }));

/**
 * Thanh công cụ trình xem ảnh/video trải hết bề ngang và toàn nút bấm. Xoay ngang mà tai thỏ ăn vào mép TRÁI thì nút
 * "Đóng" nằm dưới tai thỏ — chạm không được và không có cách nào thoát khỏi trình xem. `insets` là style NỘI TUYẾN (chỉ biết
 * lúc chạy) nên kiểm được trong Jest, khác class NativeWind.
 */
const LANDSCAPE: Metrics = {
  frame: { height: 375, width: 812, x: 0, y: 0 },
  insets: { bottom: 21, left: 47, right: 47, top: 0 },
};

const ATTACHMENT = {
  assetId: 'a-1',
  kind: 'IMAGE',
  mime: 'image/jpeg',
  name: 'anh.jpg',
  size: 1024,
} as unknown as MessageAttachment;

type JsonNode = { children?: unknown[] | null; props?: Record<string, unknown> } | null;

/** Node bọc ngoài — cha trực tiếp của nút "Đóng". */
function findParentOfLabel(node: unknown, label: string): JsonNode {
  if (!node || typeof node !== 'object') return null;
  const current = node as JsonNode;
  const kids = (current?.children ?? []) as unknown[];
  if (kids.some((k) => (k as JsonNode)?.props?.accessibilityLabel === label)) return current;
  for (const child of kids) {
    const found = findParentOfLabel(child, label);
    if (found) return found;
  }
  return null;
}

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return style && typeof style === 'object' ? (style as Record<string, unknown>) : {};
}

it('cộng vùng an toàn TRÁI/PHẢI vào lề — nút "Đóng" không nằm dưới tai thỏ', async () => {
  const view = await render(
    <SafeAreaProvider initialMetrics={LANDSCAPE}>
      <MediaViewerToolbar assetUrl="https://x/a.jpg" attachment={ATTACHMENT} onClose={jest.fn()} />
    </SafeAreaProvider>,
  );

  expect(screen.getByRole('button', { name: 'Đóng' })).toBeOnTheScreen();
  const bar = findParentOfLabel(view.toJSON(), 'Đóng');
  const style = flatten(bar?.props?.style);

  expect(style.paddingLeft).toBe(LANDSCAPE.insets.left + SPACING.xs);
  expect(style.paddingRight).toBe(LANDSCAPE.insets.right + SPACING.xs);
});
