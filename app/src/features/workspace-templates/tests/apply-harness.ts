import type { QueryClient } from '@tanstack/react-query';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useConnectionState } from '@/core/socket';
import { useFeature } from '@/shell/capabilities';

import { workspaceTemplatesService } from '../api/workspace-templates.service';
import type { ApplyTemplateResult } from '../api';
import { TEMPLATES } from './fixtures';

/**
 * Đồ dùng chung của các test MÀN "Áp mẫu cho nhóm" (`ApplyTemplateScreen.*.test.tsx`).
 *
 * ⚠️ `jest.mock(...)` (expo-router, capabilities, socket, service) PHẢI nằm trong TỪNG file test: babel-jest chỉ hoist trong chính file
 * đó. File này chỉ dùng lại các module đã bị mock — nạp nó SAU các `jest.mock` (import thường luôn được hoist xuống sau).
 */
export const mockedApply = jest.mocked(workspaceTemplatesService.apply);
export const mockedHead = jest.mocked(workspaceTemplatesService.getWorkspaceHead);
export const mockedList = jest.mocked(workspaceTemplatesService.list);
export const mockedNames = jest.mocked(workspaceTemplatesService.listChannelNames);

export const APPLIED: ApplyTemplateResult = {
  createdChannels: [{ id: 'c-1', key: 'thong-bao', name: 'Thông báo' }],
  skipped: [{ key: 'thao-luan', reason: 'NAME_EXISTS' }],
};

/** `beforeEach` chung: chủ nhóm, nhóm đang hoạt động, có mạng, cờ bật, ba mẫu, chưa có kênh trùng tên. */
export function resetApplyMocks(): void {
  jest.clearAllMocks();
  // `mockReset` (không chỉ `clearAllMocks`): hàng đợi `mockResolvedValueOnce` chưa dùng hết không được rò sang ca sau.
  mockedApply.mockReset().mockResolvedValue(APPLIED);
  mockedHead.mockReset().mockResolvedValue({ myRole: 'OWNER', status: 'ACTIVE' });
  mockedList.mockReset().mockResolvedValue(TEMPLATES);
  mockedNames.mockReset().mockResolvedValue([]);
  jest.mocked(useConnectionState).mockReturnValue('connected');
  jest.mocked(useFeature).mockReturnValue(true);
}

/** Chọn thẻ mẫu theo tên (chờ danh sách tải xong). */
export async function pickTemplate(name: string): Promise<void> {
  await fireEvent.press(await screen.findByText(name));
}

export const applyButton = () => screen.getByRole('button', { name: 'Áp mẫu' });

/**
 * Chờ mọi truy vấn đang chạy XONG. Chọn mẫu bật thêm truy vấn "tên kênh hiện có" (`listChannelNames`); kết quả về SAU khi test kết thúc là
 * cập nhật state ngoài `act` (cảnh báo "not wrapped in act").
 */
export const waitForIdle = (queryClient: QueryClient) =>
  waitFor(() => expect(queryClient.isFetching()).toBe(0));
