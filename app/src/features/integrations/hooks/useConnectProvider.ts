import { useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';

import { integrationKeys } from '../queries/integrations.queries';
import { parseCallback, type CallbackOutcome } from '../utils/callback-url';

/**
 * Kết nối OAuth trong TRÌNH DUYỆT HỆ THỐNG (app.md §4): `start()` gọi BE lấy `authorizeUrl` (BE cấp `state` một lần) → `openAuthSessionAsync`
 * chờ tới khi nhà cung cấp chuyển về `superapp://integrations/callback` → đọc kết quả → làm mới danh sách. Người dùng đóng trình duyệt → `null`
 * (không làm gì). ⚠️ App bị hệ điều hành đóng giữa chừng (Android) thì kết quả đi qua route `integrations/callback` thay vì trả về đây.
 * ❌ Không bao giờ nhận/giữ token ở app — BE tự đổi mã và lưu MÃ HOÁ.
 */
export function useConnectProvider() {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);

  const connect = useCallback(
    async (start: () => Promise<{ authorizeUrl: string }>): Promise<CallbackOutcome | null> => {
      setPending(true);
      try {
        const { authorizeUrl } = await start();
        const result = await WebBrowser.openAuthSessionAsync(
          authorizeUrl,
          Linking.createURL('integrations/callback'),
        );
        if (result.type !== 'success') return null;
        void qc.invalidateQueries({ queryKey: integrationKeys.all });
        return parseCallback(result.url);
      } finally {
        setPending(false);
      }
    },
    [qc],
  );

  return { connect, pending };
}
