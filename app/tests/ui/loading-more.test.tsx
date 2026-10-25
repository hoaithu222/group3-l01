import { render, screen } from '@testing-library/react-native';

import { LIGHT_COLORS } from '@/shared/theme';
import { LoadingMore } from '@/shared/ui/progress';

/**
 * ⚠️ Chỉ test HÀNH VI (`docs/rules/testing.md`): nhãn/vai/trạng thái cho trình đọc màn hình và màu vòng quay — màu đi
 * qua PROP `color` (không phải className) nên đọc được ở đây. `render()` của RNTL 14 là BẤT ĐỒNG BỘ.
 */

interface JsonNode {
  children: (JsonNode | string)[] | null;
  props: Record<string, unknown>;
  type: string;
}

/** Tìm phần tử `ActivityIndicator` trong cây `toJSON()` — bản mock của React Native giữ nguyên tên và prop. */
function findSpinner(node: unknown): JsonNode | undefined {
  if (node == null || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findSpinner(child);
      if (found) return found;
    }
    return undefined;
  }
  const candidate = node as JsonNode;
  if (candidate.type === 'ActivityIndicator') return candidate;
  return findSpinner(candidate.children);
}

describe('LoadingMore', () => {
  it('là thanh tiến trình đang bận, mặc định xướng "Đang tải thêm"', async () => {
    await render(<LoadingMore />);

    expect(screen.getByRole('progressbar', { name: 'Đang tải thêm' })).toBeBusy();
  });

  it('nhận nhãn riêng cho ngữ cảnh cụ thể', async () => {
    await render(<LoadingMore label="Đang tải thêm người phản ứng" />);

    expect(screen.getByRole('progressbar', { name: 'Đang tải thêm người phản ứng' })).toBeBusy();
  });

  it('vòng quay lấy màu TỪ TOKEN (fg-2) — không rơi về màu mặc định của hệ điều hành', async () => {
    await render(<LoadingMore />);

    const spinner = findSpinner(screen.toJSON());

    expect(spinner).toBeDefined();
    expect(spinner?.props.color).toBe(LIGHT_COLORS['fg-2']);
  });
});
