import { QueryClient } from '@tanstack/react-query';

import type { WellbeingSetting } from '../api/wellbeing.types';
import { wellbeingKeys } from '../queries/wellbeing.keys';
import { isAlertSuppressedRoute } from '../utils/alert-routes';
import {
  applyAlertPayload,
  applyDataDeleted,
  applyOptedOut,
  clearPendingAlert,
} from '../utils/wellbeing-cache';
import { assessment, disabledSetting, setting } from './wellbeing.harness';

/** Vá cache cảnh báo (nguồn duy nhất của "đang có cảnh báo chờ") và route hoãn cảnh báo. */
const key = wellbeingKeys.setting();
const cached = (client: QueryClient) => client.getQueryData<WellbeingSetting>(key);
const pending = { id: 'x', level: 'HIGH', suggestion: null } as const;
const someHistory = { assessments: [assessment()], dailies: [], days: 7 };

describe('vá cache cảnh báo', () => {
  it('socket đặt pendingAlert CHỈ khi đang bật và còn cho nhắc', () => {
    const client = new QueryClient();
    client.setQueryData(key, setting());
    applyAlertPayload(client, { assessmentId: 'a9', level: 'HIGH', suggestion: 'SLEEP' });
    expect(cached(client)?.pendingAlert).toEqual({ id: 'a9', level: 'HIGH', suggestion: 'SLEEP' });

    for (const blocked of [setting({ alertsEnabled: false }), disabledSetting()]) {
      client.setQueryData(key, blocked);
      applyAlertPayload(client, { assessmentId: 'a9', level: 'HIGH', suggestion: null });
      expect(cached(client)?.pendingAlert).toBeNull();
    }
  });

  it('chưa có cache ⇒ bỏ qua (không dựng cài đặt giả)', () => {
    const client = new QueryClient();
    applyAlertPayload(client, { assessmentId: 'a9', level: 'MEDIUM', suggestion: null });
    expect(client.getQueryData(key)).toBeUndefined();
  });

  it('gỡ ĐÚNG cảnh báo đã bấm — cảnh báo mới hơn thì giữ', () => {
    const client = new QueryClient();
    client.setQueryData(key, setting({ pendingAlert: { ...pending, id: 'moi' } }));
    clearPendingAlert(client, 'cu');
    expect(cached(client)?.pendingAlert?.id).toBe('moi');
    clearPendingAlert(client, 'moi');
    expect(cached(client)?.pendingAlert).toBeNull();
  });

  it('xoá dữ liệu ⇒ mất đánh giá + cảnh báo chờ + lịch sử, vẫn bật', () => {
    const client = new QueryClient();
    client.setQueryData(wellbeingKeys.history(7), someHistory);
    client.setQueryData(key, setting({ latest: assessment(), pendingAlert: pending }));

    applyDataDeleted(client);

    expect(cached(client)).toMatchObject({ enabled: true, latest: null, pendingAlert: null });
    expect(client.getQueryData(wellbeingKeys.history(7))).toBeUndefined();
  });

  it('tắt theo dõi ⇒ mọi lịch sử (7 và 30 ngày) bị xoá khỏi bộ nhớ NGAY', () => {
    const client = new QueryClient();
    client.setQueryData(wellbeingKeys.history(7), someHistory);
    client.setQueryData(wellbeingKeys.history(30), { ...someHistory, days: 30 });

    applyOptedOut(client, disabledSetting());

    expect(cached(client)?.enabled).toBe(false);
    expect(client.getQueryData(wellbeingKeys.history(7))).toBeUndefined();
    expect(client.getQueryData(wellbeingKeys.history(30))).toBeUndefined();
  });
});

describe('route hoãn cảnh báo', () => {
  it.each([
    ['/study/attempts/abc', true],
    ['/call/xyz', true],
    ['/meetings/m1/room', true],
    ['/study/live/q1', true],
    ['/me/wellbeing', true],
    ['/me/wellbeing/settings', true],
    ['/study/live/join', false],
    ['/study/live/history', false],
    ['/me', false],
    ['/', false],
    [null, false],
    [undefined, false],
  ])('%s ⇒ hoãn = %s', (path, suppressed) => {
    expect(isAlertSuppressedRoute(path)).toBe(suppressed);
  });
});
