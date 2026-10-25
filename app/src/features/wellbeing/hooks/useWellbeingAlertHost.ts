import { useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useSocketEvent } from '@/core/socket';

import { parseAlertPayload } from '../api/wellbeing.schemas';
import { WELLBEING_ALERT_EVENT } from '../constants/wellbeing.constants';
import { wellbeingKeys } from '../queries/wellbeing.keys';
import { useWellbeingSetting } from '../queries/wellbeing.queries';
import { isAlertSuppressedRoute } from '../utils/alert-routes';
import { applyAlertPayload } from '../utils/wellbeing-cache';
import { useAlertActions } from './useAlertActions';
import { useWellbeingEnabled } from './useWellbeingEnabled';

/**
 * Bộ não của `WellbeingAlertHost` (app.md p7-03 §2/§4). Hai nguồn cho MỘT thẻ cảnh báo, cùng đổ vào cache cài đặt:
 *  · `GET /me/wellbeing` → `pendingAlert` (mở app, lỡ sự kiện lúc offline, cảnh báo vào hộp thư ngoài giờ — WELL-05);
 *  · socket `wellbeing:alert` (`user:{id}`, mọi thiết bị) → đặt `pendingAlert` ngay rồi làm mới cho khớp BE.
 * Làm mới khi socket nối lại và khi app về `active` — CHỈ khi cài đặt đã cũ (`stale`), nên chuyển app qua lại không thành mưa request.
 *
 * Không hiện khi: cờ `burnout` tắt (không nghe, không gọi) · chưa bật hoặc đã tắt nhắc nhẹ · đang ở route hoãn (thi thử, gọi, họp, live quiz) hoặc chính nhánh `me/wellbeing`
 * (`isAlertSuppressedRoute`). Nút ✕ chỉ ẨN thẻ trong phiên này (`hiddenId`, bộ nhớ — không lưu bền): cảnh báo vẫn chờ ở BE và hiện lại ở màn Sức khoẻ/lần mở app sau.
 * ⛔ Không log payload, không lưu bền, không tính điểm/mức ở đây — mức chỉ nằm trong cache bộ nhớ và chỉ màn Sức khoẻ mới hiện chữ mức.
 */
export function useWellbeingAlertHost() {
  const enabled = useWellbeingEnabled();
  const client = useQueryClient();
  const pathname = usePathname();
  const setting = useWellbeingSetting();
  const [hiddenId, setHiddenId] = useState<string | null>(null);

  useSocketEvent<unknown>(WELLBEING_ALERT_EVENT, (raw) => {
    if (!enabled) return;
    const payload = parseAlertPayload(raw);
    if (!payload) return;
    applyAlertPayload(client, payload);
    void client.invalidateQueries({ queryKey: wellbeingKeys.setting() });
  });

  const refreshIfStale = useCallback(() => {
    void client.refetchQueries({ queryKey: wellbeingKeys.setting(), stale: true });
  }, [client]);

  useSocketEvent('connect', () => {
    if (enabled) refreshIfStale();
  });

  useEffect(() => {
    if (!enabled) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshIfStale();
    });
    return () => subscription.remove();
  }, [enabled, refreshIfStale]);

  const data = setting.data;
  const pending = enabled && data?.enabled && data.alertsEnabled ? data.pendingAlert : null;
  const alert =
    pending && pending.id !== hiddenId && !isAlertSuppressedRoute(pathname) ? pending : null;
  const actions = useAlertActions(alert?.id ?? null);

  return {
    ...actions,
    alert,
    hide: () => {
      if (alert) setHiddenId(alert.id);
    },
  };
}
