import { render } from '@testing-library/react-native';
import { FlatList, Text } from 'react-native';

import { useListRefreshControl } from '@/shared/ui/screen';

/**
 * `useListRefreshControl` — vòng quay kéo-để-làm-mới của DANH SÁCH tự cuộn (`FlashList`/`FlatList`).
 *
 * Danh sách có `refreshing`+`onRefresh` trần thì React Native dựng vòng quay MẶC ĐỊNH (xám/xanh Material, không theo
 * token) — ở chế độ tối gần như biến mất. Hook dùng chung một nguồn màu với `Screen` (`useScreenRefreshControl`).
 *
 * ⚠️ Giống `screen.test.tsx`: cử chỉ kéo không mô phỏng được trong Jest, nên kiểm HỢP ĐỒNG mà danh sách nhận — có phần tử
 * `refreshControl` không, cờ `refreshing`, màu lấy từ token chứ không để trống, và `onRefresh` có nối tới callback không.
 */
type Refresh = { onRefresh: () => void; refreshing?: boolean };

function List({ onRefresh, refreshing }: Refresh) {
  const refreshControl = useListRefreshControl({ onRefresh, refreshing });
  return (
    <FlatList
      data={['a']}
      keyExtractor={(item) => item}
      refreshControl={refreshControl}
      renderItem={({ item }) => <Text>{item}</Text>}
    />
  );
}

/** Tìm node đầu tiên mang prop `refreshControl` (phần tử React) trong cây JSON đã render. */
function findRefreshControl(node: unknown): { props: Record<string, unknown> } | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const current = node as { children?: unknown[] | null; props?: Record<string, unknown> };
  const found = current.props?.refreshControl;
  if (found && typeof found === 'object') return found as { props: Record<string, unknown> };
  for (const child of current.children ?? []) {
    const result = findRefreshControl(child);
    if (result) return result;
  }
  return undefined;
}

describe('useListRefreshControl', () => {
  it('gắn vòng quay làm mới cho danh sách, mang đúng cờ `refreshing` và nối đúng callback', async () => {
    const onRefresh = jest.fn();
    const view = await render(<List refreshing onRefresh={onRefresh} />);

    const control = findRefreshControl(view.toJSON());

    expect(control).toBeDefined();
    expect(control?.props.refreshing).toBe(true);
    (control?.props.onRefresh as () => void)();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  /**
   * ⛔ Màu vòng quay KHÔNG đi qua className được (`tintColor`/`colors` nhận mã màu thô). Quên hook `useThemeColors` thì hai
   * prop này là `undefined`: iOS vẽ xám mặc định, Android vẽ xanh Material — và ở chế độ tối thì gần như không thấy.
   */
  it('màu vòng quay lấy từ token, không để trống', async () => {
    const view = await render(<List onRefresh={jest.fn()} />);

    const control = findRefreshControl(view.toJSON());

    expect(control?.props.tintColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(control?.props.colors).toHaveLength(1);
  });

  it('không đang làm mới thì `refreshing` là false (mặc định), không kẹt vòng quay', async () => {
    const view = await render(<List onRefresh={jest.fn()} />);

    expect(findRefreshControl(view.toJSON())?.props.refreshing).toBe(false);
  });
});
