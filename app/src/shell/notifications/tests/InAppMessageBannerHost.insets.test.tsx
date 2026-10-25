import { act, render } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { useInAppBannerStore, type InAppBanner } from '@/core/notifications';
import { SPACING } from '@/shared/theme';

import { InAppMessageBannerHost } from '../InAppMessageBannerHost';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

/**
 * Banner tin nhắn trải hết bề ngang và có nội dung bấm được ⇒ phải cộng vùng an toàn ở CẢ BỐN cạnh. Xoay ngang iPhone có
 * tai thỏ (hay Android có camera đục lỗ ở cạnh bên) thì tai thỏ ăn vào mép TRÁI/PHẢI: thiếu `insets.left/right` là chữ đầu
 * dòng nằm dưới tai thỏ, cụt và chạm không được.
 *
 * Đây là style NỘI TUYẾN (`insets` chỉ biết lúc chạy) nên kiểm được trong Jest — khác class NativeWind (`docs/rules/testing.md`).
 */
const LANDSCAPE: Metrics = {
  frame: { height: 375, width: 812, x: 0, y: 0 },
  insets: { bottom: 21, left: 47, right: 47, top: 0 },
};

const BANNER: InAppBanner = {
  body: 'An: đã gửi tin nhắn',
  id: 'n-1',
  payload: {
    scopeId: 'conv-1',
    scopeType: 'CONVERSATION',
    targetUserId: 'me',
    type: 'message.new',
  },
  title: 'Nhóm Đồ án',
};

type JsonNode = { children?: unknown[] | null; props?: Record<string, unknown> } | null;

/** Node bọc ngoài của banner — chỗ duy nhất mang `pointerEvents="box-none"`. */
function findContainer(node: unknown): JsonNode {
  if (!node || typeof node !== 'object') return null;
  const current = node as JsonNode;
  if (current?.props?.pointerEvents === 'box-none') return current;
  for (const child of current?.children ?? []) {
    const found = findContainer(child);
    if (found) return found;
  }
  return null;
}

function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return style && typeof style === 'object' ? (style as Record<string, unknown>) : {};
}

it('cộng vùng an toàn TRÁI/PHẢI (tai thỏ khi xoay ngang) vào lề 16, không thay lề bằng inset', async () => {
  const view = await render(
    <SafeAreaProvider initialMetrics={LANDSCAPE}>
      <InAppMessageBannerHost />
    </SafeAreaProvider>,
  );
  await act(async () => useInAppBannerStore.getState().show(BANNER));

  const style = flatten(findContainer(view.toJSON())?.props?.style);

  expect(style.paddingLeft).toBe(LANDSCAPE.insets.left + SPACING.md);
  expect(style.paddingRight).toBe(LANDSCAPE.insets.right + SPACING.md);
  // Dọc: vẫn né thanh trạng thái, cách 8 (không phải số cứng lẻ).
  expect(style.paddingTop).toBe(LANDSCAPE.insets.top + SPACING.xs);
});
