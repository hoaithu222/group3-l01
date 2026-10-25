import { useState } from 'react';

import { appConfig } from '@/core/config/env.config';

import { loadMapboxModule } from '../utils/native-modules';

/**
 * Bản đồ có dùng được không:
 *  · `ready`       — có token Mapbox VÀ module native đã nạp được (dev client dựng lại sau 2026-09-26);
 *  · `no-token`    — thiếu `EXPO_PUBLIC_MAPBOX_TOKEN` ⇒ bản đồ Mapbox chỉ ra nền trắng, nên KHÔNG dựng;
 *  · `unsupported` — bản cài đặt chưa có module native `@rnmapbox/maps` (chưa build lại dev client).
 * Hai ca sau đều rơi về chế độ DANH SÁCH: màn vẫn dùng được đầy đủ, chỉ mất bản đồ (không sập, không nền trắng vô nghĩa).
 */
export type MapSupport = 'ready' | 'no-token' | 'unsupported';

export function getMapSupport(): MapSupport {
  if (!appConfig.mapboxToken) return 'no-token';
  return loadMapboxModule() ? 'ready' : 'unsupported';
}

/** Chốt MỘT lần lúc dựng màn: token và module native không đổi trong phiên chạy, khỏi `require` lại mỗi lần vẽ. */
export function useMapSupport(): MapSupport {
  const [support] = useState(getMapSupport);
  return support;
}
