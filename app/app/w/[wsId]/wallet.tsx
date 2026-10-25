import { Redirect, useLocalSearchParams } from 'expo-router';

import { walletHref } from '@/features/wallet';

/**
 * p6-04 app.md §1 — `https://<domain>/w/{wsId}/wallet` mở dashboard ví nhóm. Chỉ chuyển tiếp, cùng mẫu
 * `app/w/[wsId]/index.tsx`; hàng rào đăng nhập của `(app)/_layout.tsx` vẫn áp dụng vì route đích nằm
 * trong nhóm đó, và ví tự hiện "không xem được" cho GUEST/nhóm chưa bật cờ `wallet`.
 * Intent filter Android đã phủ `/w/` (`app.config.ts`, `pathPrefix: '/w/'`) nên không cần khai thêm.
 */
export default function ShortWalletLinkRoute() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  return <Redirect href={walletHref(wsId)} />;
}
