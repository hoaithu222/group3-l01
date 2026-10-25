import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen } from '@testing-library/react-native';

import { useConnectionState } from '@/core/socket';
import { useBreakpoint } from '@/shared/theme';
import { useFeature } from '@/shell/capabilities';
import { useAuthStore } from '@/shell/store/slices/auth';

import { workspaceSearchService } from '../api/workspace-search.service';
import { useWorkspaceSearchStore } from '../store/workspace-search.store';
import { EMPTY_PAGE } from './fixtures';

/**
 * Đồ dùng chung của các test MÀN "Tìm toàn workspace" (`WorkspaceSearchScreen.*.test.tsx`).
 *
 * ⚠️ `jest.mock(...)` (expo-router, capabilities, theme, socket, service) PHẢI nằm trong TỪNG file test: babel-jest chỉ hoist trong
 * chính file đó. File này chỉ dùng lại các module đã bị mock — nạp nó SAU các `jest.mock` (import thường luôn được hoist xuống sau).
 */
export const mockedSearch = jest.mocked(workspaceSearchService.search);
export const mockedJoin = jest.mocked(workspaceSearchService.joinChannel);
export const mockedHead = jest.mocked(workspaceSearchService.getWorkspaceHead);

export const PHONE = {
  height: 844,
  isLandscape: false,
  isTablet: false,
  tier: 'phone',
  width: 390,
} as const;
export const TABLET = {
  height: 900,
  isLandscape: true,
  isTablet: true,
  tier: 'tablet',
  width: 900,
} as const;

/** Đồng hồ THẬT (waitFor mặc định 1 s không đủ cho ca "không gọi gì" sau nhịp debounce 300 ms). */
export const sleep = (ms: number) =>
  act(async () => void (await new Promise((resolve) => setTimeout(resolve, ms))));

export async function typeQuery(text: string) {
  await fireEvent.changeText(screen.getByPlaceholderText('Tìm trong nhóm'), text);
}

/** `beforeEach` chung: xoá lịch sử gọi, dựng lại mặc định (điện thoại, có mạng, cờ bật, thành viên thường, chưa có tìm gần đây). */
export async function resetScreenMocks(): Promise<void> {
  jest.clearAllMocks();
  // `mockReset` (không chỉ `clearAllMocks`): hàng đợi `mockResolvedValueOnce` chưa dùng hết không được rò sang ca sau.
  mockedSearch.mockReset().mockResolvedValue(EMPTY_PAGE);
  mockedJoin.mockReset().mockResolvedValue(undefined);
  mockedHead.mockReset().mockResolvedValue({ myRole: 'MEMBER', status: 'ACTIVE' });
  jest.mocked(useBreakpoint).mockReturnValue(PHONE);
  jest.mocked(useConnectionState).mockReturnValue('connected');
  jest.mocked(useFeature).mockReturnValue(true);
  useWorkspaceSearchStore.setState({ recents: {} });
  useAuthStore.setState({ user: { id: 'u-me', name: 'Tôi' } as never });
  await AsyncStorage.clear();
}
