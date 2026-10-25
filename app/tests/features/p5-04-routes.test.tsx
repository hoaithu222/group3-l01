import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useCapabilities } from '@/shell/capabilities/use-capabilities';

import ApplyTemplateRoute from '../../app/(app)/workspaces/[wsId]/settings/templates';
import WorkspaceSearchRoute from '../../app/(app)/workspaces/[wsId]/search';

/**
 * Hai route mới của p5-04 phải đứng sau CỜ PHỤ tương ứng (app.md p5-04 §1): `workspaceSearch` cho "Tìm toàn nhóm", `workspaceTemplates` cho
 * "Áp mẫu". Cờ tắt (đã biết chắc) ⇒ màn "Tính năng này hiện chưa được bật"; phân hệ cha `communication` bật cũng KHÔNG đủ. Cờ bật ⇒ vẽ
 * đúng màn của feature. Mở link trực tiếp vào route khi cờ tắt là ca có thật (deep link, thông báo cũ) — ẩn nút thôi thì chưa đủ.
 */

jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('@/shell/capabilities/use-capabilities', () => ({ useCapabilities: jest.fn() }));
jest.mock('@/shell/capabilities', () => ({
  FeatureRouteGuard: jest.requireActual('@/shell/capabilities/FeatureRouteGuard').FeatureRouteGuard,
}));
jest.mock('@/features/workspace-search', () => {
  const { createElement } = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return { WorkspaceSearchScreen: () => createElement(Text, null, 'Màn tìm toàn nhóm') };
});
jest.mock('@/features/workspace-templates', () => {
  const { createElement } = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return { ApplyTemplateScreen: () => createElement(Text, null, 'Màn áp mẫu') };
});

const METRICS = {
  frame: { height: 812, width: 375, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 44 },
};

function flags(enabled: Record<string, boolean>) {
  const features = Object.fromEntries(
    Object.entries(enabled).map(([name, on]) => [name, { available: true, enabled: on }]),
  );
  jest.mocked(useCapabilities).mockReturnValue({ data: { features }, isLoading: false } as never);
}

async function renderRoute(Route: () => React.JSX.Element) {
  await render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <Route />
    </SafeAreaProvider>,
  );
}

describe('workspaces/[wsId]/search — cờ `workspaceSearch`', () => {
  it('cờ bật ⇒ vẽ màn tìm toàn nhóm', async () => {
    flags({ communication: true, workspaceSearch: true });
    await renderRoute(WorkspaceSearchRoute);

    expect(screen.getByText('Màn tìm toàn nhóm')).toBeOnTheScreen();
  });

  it('cờ phụ TẮT (dù phân hệ cha bật) hoặc BE chưa biết cờ ⇒ "chưa được bật", không vẽ màn tìm', async () => {
    const cases: Record<string, boolean>[] = [
      { communication: true, workspaceSearch: false },
      { communication: true },
    ];
    for (const enabled of cases) {
      flags(enabled);
      await renderRoute(WorkspaceSearchRoute);

      expect(screen.getByText('Tính năng này hiện chưa được bật')).toBeOnTheScreen();
      expect(screen.queryByText('Màn tìm toàn nhóm')).toBeNull();
      expect(screen.queryByText(/workspaceSearch/)).toBeNull();
      await screen.unmount();
    }
  });
});

describe('workspaces/[wsId]/settings/templates — cờ `workspaceTemplates`', () => {
  it('cờ bật ⇒ vẽ màn áp mẫu; cờ khác bật cũng không thay được', async () => {
    flags({ communication: true, workspaceSearch: true, workspaceTemplates: true });
    await renderRoute(ApplyTemplateRoute);

    expect(screen.getByText('Màn áp mẫu')).toBeOnTheScreen();
  });

  it('cờ TẮT (chỉ `workspaceSearch` bật) ⇒ "chưa được bật", không vẽ màn áp mẫu', async () => {
    flags({ communication: true, workspaceSearch: true, workspaceTemplates: false });
    await renderRoute(ApplyTemplateRoute);

    expect(screen.getByText('Tính năng này hiện chưa được bật')).toBeOnTheScreen();
    expect(screen.queryByText('Màn áp mẫu')).toBeNull();
  });
});
