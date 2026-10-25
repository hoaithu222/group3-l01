import AsyncStorage from '@react-native-async-storage/async-storage';

import { readScoped, writeScoped } from '@/core/storage';

import { sanitizeUsage, useModuleUsageStore } from '../module-usage.store';

const KEY = 'home.module-usage.v1';

beforeEach(async () => {
  await AsyncStorage.clear();
  useModuleUsageStore.getState().reset();
  jest.restoreAllMocks();
});

describe('module-usage.store', () => {
  it('đếm lượt mở và ghi mốc gần nhất', async () => {
    await useModuleUsageStore.getState().hydrate(null);
    jest.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000);

    useModuleUsageStore.getState().record('study');
    useModuleUsageStore.getState().record('study');

    expect(useModuleUsageStore.getState().usage.study).toEqual({ count: 2, lastAt: 2000 });
  });

  it('thứ hạng đọc ẢNH CHỤP ĐÓNG BĂNG lúc nạp: mở thêm trong phiên không làm thứ hạng đổi', async () => {
    await writeScoped('u1', KEY, { usage: { study: { count: 3, lastAt: 5 } } });
    await useModuleUsageStore.getState().hydrate('u1');

    useModuleUsageStore.getState().record('study');
    useModuleUsageStore.getState().record('calls');

    expect(useModuleUsageStore.getState().usage.study?.count).toBe(4);
    // Ảnh chụp giữ nguyên: ô không đổi chỗ dưới ngón tay, thứ hạng mới chỉ áp ở lần nạp kế tiếp.
    expect(useModuleUsageStore.getState().ranking).toEqual({ study: { count: 3, lastAt: 5 } });
  });

  it('lượt mở được lưu theo người dùng và nạp lại ở phiên sau (ảnh chụp mới có lượt vừa ghi)', async () => {
    await useModuleUsageStore.getState().hydrate('u1');
    useModuleUsageStore.getState().record('meetings');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect((await readScoped<{ usage: Record<string, { count: number }> }>('u1', KEY))?.usage.meetings?.count).toBe(1);

    useModuleUsageStore.getState().reset();
    await useModuleUsageStore.getState().hydrate('u1');
    expect(useModuleUsageStore.getState().ranking.meetings?.count).toBe(1);
  });

  it('chưa nạp xong thì KHÔNG ghi lượt mở (ghi lúc này đè mất bảng đã lưu bằng bảng thiếu)', async () => {
    await writeScoped('u1', KEY, { usage: { study: { count: 9, lastAt: 1 } } });
    useModuleUsageStore.setState({ hydrated: false, ownerId: 'u1' });

    useModuleUsageStore.getState().record('study');

    expect(useModuleUsageStore.getState().usage).toEqual({});
    expect((await readScoped<{ usage: unknown }>('u1', KEY))?.usage).toEqual({
      study: { count: 9, lastAt: 1 },
    });
  });

  it('đổi người dùng thì bỏ bảng của người cũ ngay, không lộ thói quen của họ', async () => {
    await writeScoped('u1', KEY, { usage: { study: { count: 5, lastAt: 1 } } });
    await useModuleUsageStore.getState().hydrate('u1');

    const loadingNext = useModuleUsageStore.getState().hydrate('u2');
    expect(useModuleUsageStore.getState()).toMatchObject({ hydrated: false, ranking: {}, usage: {} });
    await loadingNext;
    expect(useModuleUsageStore.getState().usage).toEqual({});
  });

  it('dữ liệu hỏng trên đĩa bị lọc: chỉ nhận mục có count/lastAt là số hữu hạn không âm', () => {
    expect(
      sanitizeUsage({
        bad1: { count: -1, lastAt: 1 },
        bad2: { count: 'x', lastAt: 1 },
        bad3: null,
        bad4: { count: Number.NaN, lastAt: 1 },
        ok: { count: 2.9, lastAt: 7 },
      }),
    ).toEqual({ ok: { count: 2, lastAt: 7 } });
    expect(sanitizeUsage([1, 2])).toEqual({});
    expect(sanitizeUsage(null)).toEqual({});
  });
});
