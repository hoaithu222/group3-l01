import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/**
 * Máy có mạng không (`isConnected !== false` — `null` lúc chưa biết KHÔNG bị coi
 * là offline, cùng quy ước `upload.runner.ts`/`use-connection-state.ts`).
 * FileExplorer dùng để hiện banner "Bạn đang ngoại tuyến" và tắt nút tải lên.
 */
export function useIsOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)), []);
  return online;
}
