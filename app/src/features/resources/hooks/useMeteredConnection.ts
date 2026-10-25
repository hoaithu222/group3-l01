import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

/** Đang dùng kết nối tính phí (dữ liệu di động) — `details.isConnectionExpensive` của NetInfo. Chưa biết ⇒ `false`. */
export function useMeteredConnection(): boolean {
  const [expensive, setExpensive] = useState(false);
  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        const details = state.details as { isConnectionExpensive?: boolean } | null;
        setExpensive(details?.isConnectionExpensive === true);
      }),
    [],
  );
  return expensive;
}
