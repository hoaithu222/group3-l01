import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useAuthStore } from '@/shell/store/slices/auth';

import type { WorkspaceDetail } from '../api';
import { useOnboardingChecklist } from '../hooks/useOnboardingChecklist';
import { onboardingKey, useOnboardingStore } from '../store/onboarding.store';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const NOW = Date.now();

function workspace(overrides: Partial<WorkspaceDetail> = {}): WorkspaceDetail {
  return {
    id: 'ws-1',
    status: 'ACTIVE',
    myRole: 'OWNER',
    defaultChannelId: 'ch-chung',
    createdAt: new Date(NOW - 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  } as WorkspaceDetail;
}

const KEY = onboardingKey('user-1', 'ws-1');

beforeEach(async () => {
  await AsyncStorage.clear();
  useOnboardingStore.setState({ records: {} });
  useAuthStore.setState({ user: { id: 'user-1', email: 'a@x.vn', name: 'An', roles: [], permissions: [] } });
  jest.mocked(router.push).mockClear();
});

describe('useOnboardingChecklist — khi nào hiện', () => {
  it('OWNER của nhóm ACTIVE mới tạo, chưa làm gì ⇒ hiện sau khi nạp trạng thái xong', async () => {
    const { result } = await renderHook(() => useOnboardingChecklist(workspace(), 1));
    await waitFor(() => expect(result.current.visible).toBe(true));
    expect(result.current.doneCount).toBe(0);
  });

  it('CHƯA nạp xong trạng thái ⇒ chưa hiện (⛔ hiện rồi mới ẩn = chớp mỗi lần mở màn)', async () => {
    // AsyncStorage đọc mãi không xong — mô phỏng khung hình đầu, lúc store còn rỗng.
    // `Once` + KHÔNG `mockRestore`: hàm này là `jest.fn` của bản mock chính thức, restore sẽ xoá luôn cài đặt gốc của nó.
    jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(() => new Promise(() => undefined));
    const { result } = await renderHook(() => useOnboardingChecklist(workspace(), 1));

    expect(result.current.visible).toBe(false);
  });

  it.each([
    ['MEMBER không phải người quản trị', workspace({ myRole: 'MEMBER' })],
    ['GUEST', workspace({ myRole: 'GUEST' })],
    ['nhóm đã lưu trữ', workspace({ status: 'ARCHIVED' })],
    ['nhóm tạo quá 14 ngày', workspace({ createdAt: new Date(NOW - 30 * 24 * 60 * 60 * 1000).toISOString() })],
  ])('%s ⇒ KHÔNG hiện', async (_label, detail) => {
    const { result } = await renderHook(() => useOnboardingChecklist(detail, 1));
    await waitFor(() => expect(useOnboardingStore.getState().records[KEY]).toBeDefined());
    expect(result.current.visible).toBe(false);
  });

  it('chưa có workspace (đang tải) ⇒ không hiện, không nổ', async () => {
    const { result } = await renderHook(() => useOnboardingChecklist(undefined, 0));
    expect(result.current.visible).toBe(false);
  });

  it('"Để sau" ⇒ ẩn ngay và nhớ (không hiện lại)', async () => {
    const { result } = await renderHook(() => useOnboardingChecklist(workspace(), 1));
    await waitFor(() => expect(result.current.visible).toBe(true));

    await act(async () => result.current.dismiss());

    expect(result.current.visible).toBe(false);
    expect(useOnboardingStore.getState().records[KEY]?.dismissed).toBe(true);
  });

  it('làm xong cả ba bước ⇒ tự ẩn', async () => {
    useOnboardingStore.setState({ records: { [KEY]: { dismissed: false, done: ['channel', 'message'] } } });
    // memberCount > 1 ⇒ bước "Mời" xong (suy từ dữ liệu).
    const { result } = await renderHook(() => useOnboardingChecklist(workspace(), 3));
    expect(result.current.doneCount).toBe(3);
    expect(result.current.visible).toBe(false);
  });
});

describe('useOnboardingChecklist — openStep', () => {
  async function mounted() {
    const hook = await renderHook(() => useOnboardingChecklist(workspace(), 1));
    await waitFor(() => expect(hook.result.current.visible).toBe(true));
    return hook;
  }

  it('invite ⇒ mở màn mời, KHÔNG ghi xong (mở mà chưa tạo link chưa phải là xong)', async () => {
    const { result } = await mounted();
    await act(async () => result.current.openStep('invite'));

    expect(router.push).toHaveBeenCalledWith({ pathname: '/workspaces/[wsId]/invite', params: { wsId: 'ws-1' } });
    expect(useOnboardingStore.getState().records[KEY]?.done).toEqual([]);
  });

  it('channel ⇒ mở danh sách kênh và ghi nhận đã tới đó', async () => {
    const { result } = await mounted();
    await act(async () => result.current.openStep('channel'));

    expect(router.push).toHaveBeenCalledWith({ pathname: '/workspaces/[wsId]/channels', params: { wsId: 'ws-1' } });
    expect(useOnboardingStore.getState().records[KEY]?.done).toEqual(['channel']);
  });

  it('message ⇒ mở thẳng kênh mặc định để gửi tin đầu', async () => {
    const { result } = await mounted();
    await act(async () => result.current.openStep('message'));

    expect(router.push).toHaveBeenCalledWith({
      pathname: '/workspaces/[wsId]/channels/[chId]',
      params: { wsId: 'ws-1', chId: 'ch-chung' },
    });
    expect(useOnboardingStore.getState().records[KEY]?.done).toEqual(['message']);
  });
});
