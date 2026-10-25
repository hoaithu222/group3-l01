import { useConnectionState } from '@/core/socket';
import { useBreakpoint } from '@/shared/theme';
import { useFeature } from '@/shell/capabilities';

import { contributionService } from '../api/contribution.service';
import { ContributionScreen } from '../screens/ContributionScreen';
import { BOARD, makeConfig, makeExport, makeHeatmap, makeReport, PERIODS, WS } from './fixtures';
import { renderWithClient } from './harness';

/**
 * Khung dùng chung cho các file test màn "Đóng góp" (`ContributionScreen*.test.tsx`) — tách ra để mỗi file ≤ 200 dòng
 * (`check:file-size`). ⛔ Mỗi file test phải `import` file này ĐẦU TIÊN: các `jest.mock` dưới đây phải được đăng ký TRƯỚC khi
 * màn hình (và thứ nó kéo theo) được nạp.
 *
 * Mock ở tầng service + route (không mạng): xem mô tả ở `ContributionScreen.test.tsx`.
 */
let mockParams: Record<string, string | undefined> = {};
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/shell/capabilities', () => {
  const { Text } = jest.requireActual('react-native');
  return { FeatureOffScreen: () => <Text>Tính năng này hiện chưa được bật</Text>, useFeature: jest.fn() };
});
jest.mock('@/core/socket', () => ({ ...jest.requireActual('@/core/socket'), useConnectionState: jest.fn() }));
jest.mock('@/shared/theme', () => ({ ...jest.requireActual('@/shared/theme'), useBreakpoint: jest.fn() }));
jest.mock('@/shared/utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../hooks/useContributionRealtime', () => ({ useContributionRealtime: jest.fn() }));
jest.mock('../utils/zoned-format', () => ({ ...jest.requireActual('../utils/zoned-format'), todayKeyIn: () => '2026-09-15' }));
jest.mock('../api/contribution.service', () => ({
  ...jest.requireActual('../api/contribution.service'),
  contributionService: {
    board: jest.fn(),
    config: jest.fn(),
    createExport: jest.fn(),
    getExport: jest.fn(),
    heatmap: jest.fn(),
    memberTasks: jest.fn(),
    periods: jest.fn(),
    putConfig: jest.fn(),
    report: jest.fn(),
  },
}));

type ServiceMethod = 'board' | 'config' | 'createExport' | 'getExport' | 'heatmap' | 'memberTasks' | 'periods' | 'putConfig' | 'report';
export const svc = contributionService as unknown as Record<ServiceMethod, jest.Mock>;
export const OWNER = ['workspace.board.read', 'workspace.board.edit'];
export const MEMBER = ['workspace.board.read'];

export const PHONE = { height: 844, isLandscape: false, isTablet: false, tier: 'phone', width: 390 };
export const TABLET = { height: 900, isLandscape: false, isTablet: true, tier: 'tablet', width: 700 };
export const TABLET_LG = { height: 800, isLandscape: true, isTablet: true, tier: 'tablet-lg', width: 1100 };

export function arrange(over: { archivedAt?: string | null; breakpoint?: object; offline?: boolean; params?: Record<string, string>; permissions?: string[] } = {}) {
  mockParams = { boardId: BOARD, wsId: WS, ...over.params };
  (useFeature as jest.Mock).mockReturnValue(true);
  (useConnectionState as jest.Mock).mockReturnValue(over.offline ? 'offline' : 'online');
  (useBreakpoint as jest.Mock).mockReturnValue(over.breakpoint ?? PHONE);
  svc.board.mockResolvedValue({ archivedAt: over.archivedAt ?? null, id: BOARD, myPermissions: over.permissions ?? MEMBER, name: 'Đồ án cuối kỳ' });
  svc.report.mockResolvedValue(makeReport());
  svc.periods.mockResolvedValue(PERIODS);
  svc.heatmap.mockResolvedValue(makeHeatmap());
  svc.config.mockResolvedValue(makeConfig());
  svc.memberTasks.mockResolvedValue({ items: [], nextCursor: null });
  svc.getExport.mockResolvedValue(makeExport());
}

export const renderScreen = () => renderWithClient(<ContributionScreen />);
