import AsyncStorage from '@react-native-async-storage/async-storage';

import { onboardingKey, resetOnboardingStore, useOnboardingStore } from '../store/onboarding.store';

/**
 * `AsyncStorage` đã mock toàn cục ở `jest.setup.js` (bản mock chính thức, chạy
 * thật trên Map trong bộ nhớ) — nên test này đi qua đúng đường đọc/ghi/xoá của
 * store, không phải stub.
 */
const KEY = onboardingKey('user-1', 'ws-1');

beforeEach(async () => {
  await AsyncStorage.clear();
  useOnboardingStore.setState({ records: {} });
});

describe('onboarding.store', () => {
  it('khoá theo NGƯỜI DÙNG và nhóm: onboarding:{userId}:{wsId}', () => {
    expect(KEY).toBe('onboarding:user-1:ws-1');
    expect(onboardingKey('user-2', 'ws-1')).not.toBe(KEY);
  });

  it('chưa nạp thì KHÔNG có bản ghi — nơi gọi không được hiện checklist trước lúc đó', () => {
    expect(useOnboardingStore.getState().records[KEY]).toBeUndefined();
  });

  it('hydrate khoá chưa từng lưu ⇒ bản ghi rỗng (chưa bỏ qua, chưa xong bước nào)', async () => {
    await useOnboardingStore.getState().hydrate(KEY);
    expect(useOnboardingStore.getState().records[KEY]).toEqual({ dismissed: false, done: [] });
  });

  it('dismiss ghi xuống đĩa và sống sót qua một lần nạp lại (mở app lần sau)', async () => {
    await useOnboardingStore.getState().hydrate(KEY);
    useOnboardingStore.getState().dismiss(KEY);
    // Ghi đĩa là `void writeJson(...)` (không chặn giao diện) — đợi nó xong trước khi "mở app lại".
    await new Promise((resolve) => setTimeout(resolve, 0));

    useOnboardingStore.setState({ records: {} });
    await useOnboardingStore.getState().hydrate(KEY);
    expect(useOnboardingStore.getState().records[KEY]?.dismissed).toBe(true);
  });

  it('markDone không ghi trùng cùng một bước', async () => {
    await useOnboardingStore.getState().hydrate(KEY);
    useOnboardingStore.getState().markDone(KEY, 'channel');
    useOnboardingStore.getState().markDone(KEY, 'channel');
    expect(useOnboardingStore.getState().records[KEY]?.done).toEqual(['channel']);
  });

  it('bản trong bộ nhớ thắng bản trên đĩa khi người dùng bấm lúc đang nạp', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ dismissed: false, done: [] }));
    const loading = useOnboardingStore.getState().hydrate(KEY);
    useOnboardingStore.getState().dismiss(KEY);
    await loading;
    expect(useOnboardingStore.getState().records[KEY]?.dismissed).toBe(true);
  });

  it('dữ liệu đĩa hỏng/sai kiểu ⇒ coi như chưa có, không nổ', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ dismissed: 'yes', done: 'x' }));
    await useOnboardingStore.getState().hydrate(KEY);
    expect(useOnboardingStore.getState().records[KEY]).toEqual({ dismissed: false, done: [] });
  });

  it('resetOnboardingStore xoá MỌI khoá onboarding (kể cả nhóm chưa nạp) nhưng KHÔNG đụng khoá khác', async () => {
    await AsyncStorage.setItem(onboardingKey('user-1', 'ws-chua-mo'), JSON.stringify({ dismissed: true, done: [] }));
    await AsyncStorage.setItem('theme', 'dark');
    await useOnboardingStore.getState().hydrate(KEY);

    await resetOnboardingStore();

    expect(useOnboardingStore.getState().records).toEqual({});
    expect(await AsyncStorage.getItem(onboardingKey('user-1', 'ws-chua-mo'))).toBeNull();
    expect(await AsyncStorage.getItem('theme')).toBe('dark');
  });
});
