import AsyncStorage from '@react-native-async-storage/async-storage';

import { getPushPermission, type PushPermissionState } from '@/core/notifications';
import { useAuthStore } from '@/shell/store/slices/auth';

import {
  EMPTY_PRIMER_RECORD,
  PRIMER_SNOOZE_DAYS,
  clearPrimerRecord,
  primerStorageKey,
  readPrimerRecord,
  requestPushPrimer,
  shouldShowPrimer,
  snoozePrimer,
  usePushPrimerStore,
} from '../push-primer';

/**
 * `app.md` §3 "Lời mời bật thông báo": hiện MỘT lần lúc người dùng đã thấy giá trị, "Để sau" giữ 7 ngày,
 * không hỏi khi đã cấp/đã từ chối (PUSH-11), không hỏi lúc onboarding.
 */

jest.mock('@/core/notifications', () => ({ getPushPermission: jest.fn() }));
const mockedPermission = jest.mocked(getPushPermission);

const DAY_MS = 24 * 60 * 60 * 1000;

function setPermission(state: PushPermissionState) {
  mockedPermission.mockResolvedValue(state);
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  usePushPrimerStore.setState({ visible: false });
  useAuthStore.setState({ status: 'authenticated', token: 'jwt', user: { id: 'u-1' } as never });
});

afterAll(() => {
  useAuthStore.setState({ status: 'anonymous', token: null, user: null });
});

describe('shouldShowPrimer', () => {
  const now = 1_000_000_000_000;

  it('chưa hỏi + chưa từng "Để sau" → hiện', () => {
    expect(
      shouldShowPrimer({ now, permission: 'undetermined', record: EMPTY_PRIMER_RECORD }),
    ).toBe(true);
  });

  it('đã cấp → không cần', () => {
    expect(shouldShowPrimer({ now, permission: 'granted', record: EMPTY_PRIMER_RECORD })).toBe(false);
  });

  it('PUSH-11: đã từ chối → KHÔNG hiện (hộp thoại hệ thống không hiện được nữa, lối duy nhất là Cài đặt)', () => {
    expect(shouldShowPrimer({ now, permission: 'denied', record: EMPTY_PRIMER_RECORD })).toBe(false);
  });

  it('chưa đọc xong quyền → không hiện (tránh chớp)', () => {
    expect(shouldShowPrimer({ now, permission: null, record: EMPTY_PRIMER_RECORD })).toBe(false);
  });

  it('"Để sau" chưa hết hạn → không hiện; hết hạn → hiện lại', () => {
    const record = { dismissedUntil: now + 1000, lastPromptAt: now - 1000 };
    expect(shouldShowPrimer({ now, permission: 'undetermined', record })).toBe(false);
    expect(shouldShowPrimer({ now: now + 1000, permission: 'undetermined', record })).toBe(true);
    expect(shouldShowPrimer({ now: now + 5000, permission: 'undetermined', record })).toBe(true);
  });
});

describe('lưu trạng thái primer theo người dùng', () => {
  it('snoozePrimer ghi mốc +7 ngày, đọc lại được', async () => {
    const now = 1_700_000_000_000;
    await snoozePrimer('u-1', now);

    await expect(readPrimerRecord('u-1')).resolves.toEqual({
      dismissedUntil: now + PRIMER_SNOOZE_DAYS * DAY_MS,
      lastPromptAt: now,
    });
    expect(PRIMER_SNOOZE_DAYS).toBe(7);
  });

  it('khoá theo user — máy dùng chung không thừa hưởng "Để sau" của người trước', async () => {
    await snoozePrimer('u-1', 1_700_000_000_000);
    await expect(readPrimerRecord('u-2')).resolves.toEqual(EMPTY_PRIMER_RECORD);
  });

  it('clearPrimerRecord xoá sạch (đăng xuất)', async () => {
    await snoozePrimer('u-1');
    await clearPrimerRecord('u-1');

    await expect(AsyncStorage.getItem(primerStorageKey('u-1'))).resolves.toBeNull();
    await expect(readPrimerRecord('u-1')).resolves.toEqual(EMPTY_PRIMER_RECORD);
  });

  it('dữ liệu hỏng trong kho → coi như chưa có, không ném', async () => {
    // `readJson` cố ý `console.warn` ở __DEV__ khi JSON hỏng — giữ log test sạch.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await AsyncStorage.setItem(primerStorageKey('u-1'), '{hỏng');
    await expect(readPrimerRecord('u-1')).resolves.toEqual(EMPTY_PRIMER_RECORD);
    warn.mockRestore();
  });
});

describe('requestPushPrimer', () => {
  it('đủ điều kiện → bật tấm primer', async () => {
    setPermission('undetermined');
    await expect(requestPushPrimer()).resolves.toBe(true);
    expect(usePushPrimerStore.getState().visible).toBe(true);
  });

  it('quyền đã cấp / đã từ chối → không hiện', async () => {
    for (const state of ['granted', 'denied'] as const) {
      setPermission(state);
      await expect(requestPushPrimer()).resolves.toBe(false);
    }
    expect(usePushPrimerStore.getState().visible).toBe(false);
  });

  it('đang "Để sau" → không hiện', async () => {
    setPermission('undetermined');
    await snoozePrimer('u-1');
    await expect(requestPushPrimer()).resolves.toBe(false);
  });

  it('chưa đăng nhập → không hiện', async () => {
    setPermission('undetermined');
    useAuthStore.setState({ status: 'anonymous', token: null, user: null });
    await expect(requestPushPrimer()).resolves.toBe(false);
  });

  it('đã đang hiện → không mở chồng', async () => {
    setPermission('undetermined');
    usePushPrimerStore.setState({ visible: true });
    await expect(requestPushPrimer()).resolves.toBe(false);
    expect(mockedPermission).not.toHaveBeenCalled();
  });

  it('đăng xuất trong lúc đọc kho → không hiện cho người đã rời', async () => {
    mockedPermission.mockImplementation(async () => {
      useAuthStore.setState({ status: 'anonymous', token: null, user: null });
      return 'undetermined';
    });
    await expect(requestPushPrimer()).resolves.toBe(false);
  });
});
