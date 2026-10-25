import { isAxiosError } from 'axios';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { getErrorCode } from '@/core/api/client.helpers';
import type { Capabilities } from '@/core/capabilities';
import { queryClient } from '@/core/config/query-client';
import { socket, SocketEvent, useSocketEvent } from '@/core/socket';

import { CAPABILITIES_QUERY_KEY, refreshCapabilities } from './use-capabilities';

/** `config:updated` (be.md p0-07 §6): chỉ báo "có gì đổi" — KHÔNG mang giá trị cấu hình (không lộ cấu hình admin). */
export interface ConfigUpdatedEvent {
  configVersion: string;
  keys: string[];
  serverNow?: string;
  v?: number;
}

/** Ở nền ≥ chừng này rồi mới quay lại thì làm mới (304 rẻ) — không làm mới mỗi lần liếc thông báo. */
export const FOREGROUND_REFRESH_AFTER_MS = 60_000;
/** `CFG_005` bắn dồn (nhiều request cùng trúng cờ tắt) chỉ làm mới MỘT lần trong chừng này. */
export const CFG_005_REFRESH_THROTTLE_MS = 30_000;

/**
 * Giữ `GET /capabilities` mới theo sự kiện (p0-07 `app.md` §4) — mount MỘT lần ở `AppProviders`, sau khi phiên
 * `authenticated`. Bốn tín hiệu:
 *
 *  1. `config:updated` mang `configVersion` KHÁC bản đang giữ → làm mới (cùng version thì bỏ — bản này đã tự cập nhật);
 *  2. app quay lại foreground sau ≥ 60 s ở nền → làm mới có điều kiện;
 *  3. socket NỐI LẠI (không tính lần nối đầu) — có thể đã lỡ `config:updated`;
 *  4. một API trả `CFG_005` ("tính năng chưa bật" — cờ vừa tắt mà app chưa biết) → làm mới, tối đa một lần/30 s.
 *
 * Dùng `queryClient` dùng chung (không phải `useQueryClient()`): hook được gọi ở `AppProviders`, NGOÀI
 * `QueryClientProvider` — cùng cách `usePermissionRevokedHandler`.
 */
export function useConfigSync(): void {
  const hasConnected = useRef(false);

  useSocketEvent<ConfigUpdatedEvent>(SocketEvent.CONFIG_UPDATED, (event) => {
    const current = queryClient.getQueryData<Capabilities>(CAPABILITIES_QUERY_KEY)?.configVersion;
    if (event.configVersion !== current) void refreshCapabilities(queryClient);
  });

  useEffect(() => {
    let backgroundedAt: number | null = null;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundedAt ??= Date.now();
        return;
      }
      if (state !== 'active') return;
      const away = backgroundedAt === null ? 0 : Date.now() - backgroundedAt;
      backgroundedAt = null;
      if (away >= FOREGROUND_REFRESH_AFTER_MS) void refreshCapabilities(queryClient);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const onConnect = () => {
      // Lần nối ĐẦU đi kèm lượt tải capabilities đầu tiên — chỉ nối lại mới có thể đã lỡ sự kiện.
      if (hasConnected.current) void refreshCapabilities(queryClient);
      hasConnected.current = true;
    };
    socket.on('connect', onConnect);
    return () => {
      socket.off('connect', onConnect);
    };
  }, []);

  useEffect(() => {
    let lastRefreshAt = 0;
    const onError = (error: unknown) => {
      if (!isAxiosError(error) || getErrorCode(error) !== 'CFG_005') return;
      const now = Date.now();
      if (now - lastRefreshAt < CFG_005_REFRESH_THROTTLE_MS) return;
      lastRefreshAt = now;
      void refreshCapabilities(queryClient);
    };
    const unsubscribeQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') onError(event.action.error);
    });
    const unsubscribeMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') onError(event.action.error);
    });
    return () => {
      unsubscribeQueries();
      unsubscribeMutations();
    };
  }, []);
}
