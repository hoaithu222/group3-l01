import AsyncStorage from '@react-native-async-storage/async-storage';

import { readScoped, scopedKey, writeScoped } from '@/core/storage';

import {
  MAX_PINNED_MODULES,
  sanitizePinned,
  useModulePinsStore,
} from '../module-pins.store';
import { pinFeedback, toggleModulePin } from '../toggle-module-pin';

const KEY = 'home.module-pins.v1';
const ALL = ['a', 'b', 'c', 'd'];

const ready = (pinned: string[] = [], ownerId: string | null = 'u1') =>
  useModulePinsStore.setState({ hydrated: true, ownerId, pinned });

beforeEach(async () => {
  await AsyncStorage.clear();
  useModulePinsStore.getState().reset();
});

describe('module-pins.store — bật/tắt ghim', () => {
  it('ghim theo THỨ TỰ ghim (thứ tự này là thứ tự thẻ hero) và bỏ ghim đúng mục', () => {
    ready();
    const { toggle } = useModulePinsStore.getState();

    expect(toggle('b', ALL)).toBe('pinned');
    expect(toggle('a', ALL)).toBe('pinned');
    expect(useModulePinsStore.getState().pinned).toEqual(['b', 'a']);

    expect(toggle('b', ALL)).toBe('unpinned');
    expect(useModulePinsStore.getState().pinned).toEqual(['a']);
  });

  it(`chặn ở trần ${String(MAX_PINNED_MODULES)}: ghim thứ ba trả 'full', KHÔNG đẩy ghim cũ ra`, () => {
    ready(['a', 'b']);

    expect(useModulePinsStore.getState().toggle('c', ALL)).toBe('full');
    expect(useModulePinsStore.getState().pinned).toEqual(['a', 'b']);
  });

  it('bỏ ghim luôn được, kể cả khi đang chạm trần — rồi ghim lại được', () => {
    ready(['a', 'b']);
    const { toggle } = useModulePinsStore.getState();

    expect(toggle('a', ALL)).toBe('unpinned');
    expect(toggle('c', ALL)).toBe('pinned');
    expect(useModulePinsStore.getState().pinned).toEqual(['b', 'c']);
  });

  it('ghim của phân hệ không còn được vào không tính vào trần (không chạm trần vì ghim vô hình)', () => {
    ready(['gone', 'a']);

    expect(useModulePinsStore.getState().toggle('b', ALL)).toBe('pinned');
    expect(useModulePinsStore.getState().pinned).toEqual(['a', 'b']);
  });

  it("chưa nạp xong thì 'not-ready' và KHÔNG ghi (ghi lúc này đè mất ghim đã lưu)", async () => {
    await writeScoped('u1', KEY, { pinned: ['a'] });
    useModulePinsStore.setState({ hydrated: false, ownerId: 'u1', pinned: [] });

    expect(useModulePinsStore.getState().toggle('b', ALL)).toBe('not-ready');
    expect(await readScoped('u1', KEY)).toEqual({ pinned: ['a'] });
  });

  it('phản hồi: mỗi kết quả một câu, `not-ready` thì im lặng', () => {
    expect(pinFeedback('pinned', 'Học')).toEqual({
      message: 'Đã ghim Học lên đầu Trang chủ',
      tone: 'success',
    });
    expect(pinFeedback('unpinned', 'Học')?.message).toBe('Đã bỏ ghim Học');
    expect(pinFeedback('full', 'Học')?.tone).toBe('info');
    expect(pinFeedback('not-ready', 'Học')).toBeNull();
  });

  it('`toggleModulePin` đi qua đúng store', () => {
    ready();
    expect(toggleModulePin('a', ALL)).toBe('pinned');
    expect(useModulePinsStore.getState().pinned).toEqual(['a']);
  });
});

describe('module-pins.store — lưu bền theo NGƯỜI DÙNG', () => {
  it('ghim được ghi vào khoá của người đang đăng nhập và nạp lại được', async () => {
    ready([], 'u1');
    useModulePinsStore.getState().toggle('b', ALL);
    // Ghi đĩa không chờ (`void writeScoped`) — nhường một nhịp cho lượt ghi hoàn tất.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(await AsyncStorage.getItem(scopedKey('u1', KEY))).toBe(JSON.stringify({ pinned: ['b'] }));

    useModulePinsStore.getState().reset();
    await useModulePinsStore.getState().hydrate('u1');
    expect(useModulePinsStore.getState()).toMatchObject({ hydrated: true, ownerId: 'u1', pinned: ['b'] });
  });

  it('đổi người dùng thì bỏ ghim của người cũ và nạp ghim của người mới — không lộ sang nhau', async () => {
    await writeScoped('u1', KEY, { pinned: ['a'] });
    await writeScoped('u2', KEY, { pinned: ['c'] });

    await useModulePinsStore.getState().hydrate('u1');
    expect(useModulePinsStore.getState().pinned).toEqual(['a']);

    const loadingB = useModulePinsStore.getState().hydrate('u2');
    // Giữa lúc chờ đĩa: không còn dữ liệu của A và chưa được coi là đã nạp.
    expect(useModulePinsStore.getState()).toMatchObject({ hydrated: false, ownerId: 'u2', pinned: [] });
    await loadingB;
    expect(useModulePinsStore.getState().pinned).toEqual(['c']);
  });

  it('nạp cùng một người hai lần chỉ đọc đĩa một lần (hai nơi gọi hook cùng lúc)', async () => {
    const spy = jest.spyOn(AsyncStorage, 'getItem');
    // `getItem` của mock AsyncStorage đã là `jest.fn` — `spyOn` trả lại chính nó, còn nguyên lịch sử các test trước.
    spy.mockClear();
    await Promise.all([
      useModulePinsStore.getState().hydrate('u1'),
      useModulePinsStore.getState().hydrate('u1'),
    ]);

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('không đăng nhập (null): coi như đã nạp, không đọc/ghi đĩa', async () => {
    await useModulePinsStore.getState().hydrate(null);
    expect(useModulePinsStore.getState()).toMatchObject({ hydrated: true, ownerId: null });

    expect(useModulePinsStore.getState().toggle('a', ALL)).toBe('pinned');
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
  });

  it('dữ liệu hỏng trên đĩa bị lọc: chỉ nhận mảng chuỗi khác nhau, cắt theo trần', () => {
    expect(sanitizePinned(['a', 'a', 3, '', 'b', 'c'])).toEqual(['a', 'b']);
    expect(sanitizePinned('a')).toEqual([]);
    expect(sanitizePinned(undefined)).toEqual([]);
  });
});
