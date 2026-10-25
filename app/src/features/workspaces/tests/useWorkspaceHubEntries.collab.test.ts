import { renderHook } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useFeature } from '@/shell/capabilities';

import type { WorkspaceRole } from '../api';
import { useWorkspaceHubEntries, type WorkspaceHubEntry } from '../hooks/useWorkspaceHubEntries';

/**
 * Lối vào "Tài liệu cộng tác" (p6-01, cờ `collab`) ở tổng quan nhóm: chỉ hiện khi cờ BẬT (chưa biết = ẩn, không chớp rồi biến), mọi vai (khách chỉ thấy tài liệu được mời), nhãn KHÁC thẻ "Tài liệu"
 * (kho tệp) của `ResourcesHubCard`, và bấm là mở đúng đường dẫn `/workspaces/{wsId}/docs`.
 */
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/shell/capabilities', () => ({ useFeature: jest.fn() }));

async function entriesFor(role: WorkspaceRole): Promise<WorkspaceHubEntry[]> {
  const { result } = await renderHook(() =>
    useWorkspaceHubEntries({ memberCount: 5, role, wsId: 'ws-1' }),
  );
  return result.current;
}

beforeEach(() => jest.clearAllMocks());

describe('useWorkspaceHubEntries — Tài liệu cộng tác', () => {
  it('cờ collab BẬT: có dòng "Tài liệu cộng tác"; bấm mở màn danh sách của nhóm', async () => {
    jest.mocked(useFeature).mockImplementation((flag: string) => flag === 'collab');
    const entries = await entriesFor('MEMBER');
    const docs = entries.find((entry) => entry.key === 'docs');

    expect(docs?.label).toBe('Tài liệu cộng tác');
    docs?.onPress();
    expect(router.push).toHaveBeenLastCalledWith('/workspaces/ws-1/docs');
  });

  it.each(['OWNER', 'ADMIN', 'MEMBER', 'GUEST'] as const)(
    'vai %s đều thấy (BE lọc tài liệu theo quyền)',
    async (role) => {
      jest.mocked(useFeature).mockImplementation((flag: string) => flag === 'collab');
      expect((await entriesFor(role)).map((entry) => entry.key)).toContain('docs');
    },
  );

  it('khách được mô tả đúng việc làm được: chỉ xem tài liệu được mời', async () => {
    jest.mocked(useFeature).mockImplementation((flag: string) => flag === 'collab');
    const docs = (await entriesFor('GUEST')).find((entry) => entry.key === 'docs');
    expect(docs?.description).toBe('Xem các tài liệu bạn được mời');
  });

  it('cờ TẮT hoặc CHƯA biết: ẩn', async () => {
    for (const flag of [false, undefined]) {
      jest.mocked(useFeature).mockReturnValue(flag);
      expect((await entriesFor('OWNER')).map((entry) => entry.key)).not.toContain('docs');
    }
  });
});
