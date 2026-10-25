import { renderHook } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useFeature } from '@/shell/capabilities';

import type { WorkspaceRole } from '../api';
import { useWorkspaceHubEntries, type WorkspaceHubEntry } from '../hooks/useWorkspaceHubEntries';

/**
 * Lối vào "Tích hợp" (p5-03) và "Tìm cố vấn" (p6-03) ở tổng quan nhóm. Khoá: chỉ hiện khi cờ phân hệ BẬT (chưa biết = ẩn, không chớp rồi biến),
 * "Tích hợp" cho mọi vai KHÔNG phải khách (MEMBER chỉ xem — mô tả nói đúng việc làm được), "Tìm cố vấn" chỉ OWNER/ADMIN; bấm là mở đúng đường dẫn.
 */
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn() }));

/** Bật đúng các cờ được nêu, tắt phần còn lại. */
function enable(...flags: string[]): void {
  jest.mocked(useFeature).mockImplementation((flag: string) => flags.includes(flag));
}

async function entriesFor(role: WorkspaceRole): Promise<WorkspaceHubEntry[]> {
  const { result } = await renderHook(() =>
    useWorkspaceHubEntries({ memberCount: 5, role, wsId: 'ws-1' }),
  );
  return result.current;
}

const keys = (entries: WorkspaceHubEntry[]): string[] => entries.map((entry) => entry.key);

beforeEach(() => jest.clearAllMocks());

describe('useWorkspaceHubEntries — Tích hợp · Tìm cố vấn', () => {
  it('OWNER/ADMIN, cờ bật: có cả hai dòng; bấm mở đúng đường dẫn của nhóm', async () => {
    enable('integration', 'mentor');
    for (const role of ['OWNER', 'ADMIN'] as const) {
      const entries = await entriesFor(role);
      expect(keys(entries)).toEqual(expect.arrayContaining(['integrations', 'mentor']));

      entries.find((entry) => entry.key === 'integrations')?.onPress();
      expect(router.push).toHaveBeenLastCalledWith('/workspaces/ws-1/integrations');
      entries.find((entry) => entry.key === 'mentor')?.onPress();
      expect(router.push).toHaveBeenLastCalledWith('/workspaces/ws-1/mentor');
    }
  });

  it('MEMBER: thấy "Tích hợp" (chỉ xem — mô tả không hứa việc kết nối) nhưng KHÔNG thấy "Tìm cố vấn"', async () => {
    enable('integration', 'mentor');
    const entries = await entriesFor('MEMBER');

    expect(keys(entries)).toContain('integrations');
    expect(keys(entries)).not.toContain('mentor');
    expect(entries.find((entry) => entry.key === 'integrations')?.description).toBe(
      'Xem các dịch vụ đang gửi thông báo vào nhóm',
    );
  });

  it('OWNER/ADMIN: mô tả "Tích hợp" nói việc KẾT NỐI', async () => {
    enable('integration');
    const entries = await entriesFor('ADMIN');

    expect(entries.find((entry) => entry.key === 'integrations')?.description).toMatch(
      /Kết nối GitHub/,
    );
  });

  it('KHÁCH (GUEST): không thấy dòng nào trong hai dòng này dù cờ bật (BE cũng chặn)', async () => {
    enable('integration', 'mentor');
    const entries = await entriesFor('GUEST');

    expect(keys(entries)).not.toContain('integrations');
    expect(keys(entries)).not.toContain('mentor');
  });

  it('cờ TẮT hoặc CHƯA biết: ẩn cả hai', async () => {
    for (const flag of [false, undefined]) {
      jest.mocked(useFeature).mockReturnValue(flag);
      const entries = await entriesFor('OWNER');

      expect(keys(entries)).not.toContain('integrations');
      expect(keys(entries)).not.toContain('mentor');
    }
  });

  it('chỉ một cờ bật: chỉ dòng của cờ đó hiện', async () => {
    enable('mentor');
    expect(keys(await entriesFor('OWNER'))).toContain('mentor');
    expect(keys(await entriesFor('OWNER'))).not.toContain('integrations');

    enable('integration');
    expect(keys(await entriesFor('OWNER'))).toContain('integrations');
    expect(keys(await entriesFor('OWNER'))).not.toContain('mentor');
  });
});

describe('useWorkspaceHubEntries — tông ô icon', () => {
  const toneOf = (entries: WorkspaceHubEntry[], key: string) =>
    entries.find((entry) => entry.key === key)?.tone;

  it('tông đi theo PHÂN HỆ, không theo vị trí: tắt một cờ không làm các dòng phía sau đổi màu', async () => {
    enable('meeting', 'wallet', 'gamification', 'collab');
    const all = await entriesFor('OWNER');
    enable('meeting', 'gamification', 'collab');
    const withoutWallet = await entriesFor('OWNER');

    for (const key of ['leaderboard', 'docs', 'whiteboards']) {
      expect(toneOf(withoutWallet, key)).toBe(toneOf(all, key));
    }
    // Khớp bảng nhận diện của Trang chủ: Lịch họp = `info`, Kênh (tin nhắn) = `brand`.
    expect(toneOf(all, 'meetings')).toBe('info');
    expect(toneOf(all, 'channels')).toBe('brand');
  });

  it('mọi dòng đều có tông, và không dòng nào dùng `danger` (không lối vào nào là việc phá huỷ)', async () => {
    enable('meeting', 'wallet', 'gamification', 'integration', 'mentor', 'collab', 'plagiarism');
    const entries = await entriesFor('OWNER');

    expect(entries.length).toBeGreaterThan(5);
    for (const entry of entries) {
      expect(entry.tone).toBeDefined();
      expect(entry.tone).not.toBe('danger');
    }
  });
});
