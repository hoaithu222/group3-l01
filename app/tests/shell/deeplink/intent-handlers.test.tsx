import { render } from '@testing-library/react-native';
import { Redirect, router } from 'expo-router';
import { Text } from 'react-native';

import { useToastStore } from '@/shared/ui/feedback/toast-store';
import {
  DeepLinkRedirect,
  openAppLink,
  registerIntentHandler,
  resolveDeepLink,
  resolveIntentHref,
} from '@/shell/deeplink';
import { __resetIntentHandlersForTests } from '@/shell/deeplink/intent-handlers';

/**
 * Ý định → `Href` của route ĐÃ CÓ + thân file route chuyển tiếp (p0-12 app.md §2 `intent-handlers`, SHL-02).
 * Các đường dẫn ở đây phải trùng file route thật trong `app/` (typed routes bắt sai tên).
 */

jest.mock('expo-router', () => ({
  Redirect: jest.fn(() => null),
  router: { push: jest.fn(), replace: jest.fn() },
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      ios: { associatedDomains: ['applinks:superapp.vcijsc.com'] },
      scheme: 'superapp',
    },
  },
}));

const mockedRedirect = jest.mocked(Redirect);
const mockedPush = jest.mocked(router.push);
const CONV = '5f8d0d55b54764421b7156c3';

beforeEach(() => {
  jest.clearAllMocks();
  __resetIntentHandlersForTests();
  useToastStore.getState().clear();
});

// Toast tự tắt sau 5 giây bằng `setTimeout` — dọn để không còn hẹn giờ treo sau test.
afterEach(() => useToastStore.getState().clear());

describe('resolveIntentHref — đích mặc định', () => {
  it.each([
    [
      { code: 'C1', kind: 'LINK', type: 'INVITE' },
      { params: { code: 'C1' }, pathname: '/invite/[code]' },
    ],
    [
      { code: 'T1', kind: 'EMAIL', type: 'INVITE' },
      { params: { token: 'T1' }, pathname: '/invite/e/[token]' },
    ],
    [
      { code: 'abc-defg-hjk', type: 'MEETING_CODE' },
      { params: { id: 'abc-defg-hjk' }, pathname: '/m/[id]' },
    ],
    [
      { conversationId: CONV, type: 'CONVERSATION' },
      { params: { conversationId: CONV }, pathname: '/messages/[conversationId]' },
    ],
    [
      { conversationId: CONV, messageId: 'm1', type: 'CONVERSATION' },
      { params: { conversationId: CONV, m: 'm1' }, pathname: '/messages/[conversationId]' },
    ],
    [
      { chId: 'ch1', type: 'MESSAGE_LINK', wsId: 'ws1' },
      { params: { chId: 'ch1', wsId: 'ws1' }, pathname: '/workspaces/[wsId]/channels/[chId]' },
    ],
    [
      { chId: 'ch1', messageId: 'm1', type: 'MESSAGE_LINK', wsId: 'ws1' },
      {
        params: { chId: 'ch1', m: 'm1', wsId: 'ws1' },
        pathname: '/workspaces/[wsId]/channels/[chId]',
      },
    ],
    [
      { callId: 'k1', type: 'CALL' },
      { params: { callId: 'k1' }, pathname: '/call/[callId]' },
    ],
  ] as const)('%j', (intent, href) => {
    expect(resolveIntentHref(intent)).toEqual(href);
  });

  it('không có tin thì KHÔNG mang khoá `m` (undefined) theo — đúng như route cũ `w/[wsId]/c/[chId]`', () => {
    const href = resolveIntentHref({
      chId: 'ch1',
      messageId: undefined,
      type: 'MESSAGE_LINK',
      wsId: 'ws1',
    });

    expect(href).toEqual({
      params: { chId: 'ch1', wsId: 'ws1' },
      pathname: '/workspaces/[wsId]/channels/[chId]',
    });
    expect(Object.keys((href as { params: object }).params)).not.toContain('m');
  });
});

describe('registerIntentHandler / resolveDeepLink', () => {
  it('feature ghi đè đích của MỘT loại; các loại khác giữ mặc định', () => {
    registerIntentHandler('MEETING_CODE', ({ code }) => ({
      params: { meetingId: code },
      pathname: '/meetings/[meetingId]',
    }));

    expect(resolveDeepLink('superapp://m/abc-defg-hjk')).toEqual({
      params: { meetingId: 'abc-defg-hjk' },
      pathname: '/meetings/[meetingId]',
    });
    expect(resolveDeepLink('superapp://call/k1')).toEqual({
      params: { callId: 'k1' },
      pathname: '/call/[callId]',
    });
  });

  it('bộ xử lý trả null ⇒ null; link lạ ⇒ null', () => {
    registerIntentHandler('CALL', () => null);

    expect(resolveDeepLink('superapp://call/k1')).toBeNull();
    expect(resolveDeepLink('https://superapp.vcijsc.com/login')).toBeNull();
  });
});

describe('DeepLinkRedirect', () => {
  it('ý định mở được ⇒ <Redirect> tới đích, KHÔNG toast', async () => {
    await render(<DeepLinkRedirect intent={{ conversationId: CONV, type: 'CONVERSATION' }} />);

    expect(mockedRedirect.mock.calls[0]?.[0]).toEqual({
      href: { params: { conversationId: CONV }, pathname: '/messages/[conversationId]' },
    });
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('không mở được ⇒ về Trang chủ kèm thông báo TRUNG TÍNH (không nói vì sao)', async () => {
    registerIntentHandler('CALL', () => null);

    await render(<DeepLinkRedirect intent={{ callId: 'k1', type: 'CALL' }} />);

    expect(mockedRedirect.mock.calls[0]?.[0]).toEqual({ href: '/' });
    const [toast] = useToastStore.getState().toasts;
    expect(toast?.message).toMatch(/không còn hiệu lực|không có quyền/);
  });

  it('render được như một phần tử bình thường', async () => {
    const screen = await render(
      <>
        <DeepLinkRedirect intent={{ code: 'C1', kind: 'LINK', type: 'INVITE' }} />
        <Text>ở lại</Text>
      </>,
    );

    expect(screen.getByText('ở lại')).toBeTruthy();
  });
});

describe('openAppLink — bấm link của chính app trong nội dung', () => {
  it('link của app ⇒ đi thẳng màn đích (push, để Back về đúng màn cũ) và trả true', () => {
    expect(openAppLink(`https://superapp.vcijsc.com/c/${CONV}?m=m1`)).toBe(true);

    expect(mockedPush).toHaveBeenCalledWith({
      params: { conversationId: CONV, m: 'm1' },
      pathname: '/messages/[conversationId]',
    });
  });

  it('scheme riêng của app cũng được', () => {
    expect(openAppLink('superapp://invite/C1')).toBe(true);
  });

  it('miền lạ / link không thuộc app ⇒ false, KHÔNG điều hướng (nơi gọi mở trình duyệt)', () => {
    expect(openAppLink('https://ke-xau.com/invite/C1')).toBe(false);
    expect(openAppLink('https://superapp.vcijsc.com/login')).toBe(false);
    expect(openAppLink('không phải url')).toBe(false);
    expect(mockedPush).not.toHaveBeenCalled();
  });
});
