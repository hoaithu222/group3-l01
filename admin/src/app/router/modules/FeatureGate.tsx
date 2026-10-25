import type { ReactNode } from 'react';

import { useCapabilities } from '@/app/capabilities';
import FeatureDisabledPage from '@/app/pages/FeatureDisabledPage';
import { LazyLoadFallback } from '../components/LazyLoadFallback';
import { isFeatureFlagEnabled } from './feature-flag.utils';
import type { FeatureFlagSpec } from './feature-flag.utils';

interface FeatureGateProps {
  /** Tên cờ trong `capabilities.features` (vd `'communication'`, `'o2o'`), hoặc MẢNG tên cờ — bật khi bất kỳ cờ nào bật. */
  flag: FeatureFlagSpec;
  children: ReactNode;
}

/**
 * Chặn route của một module có `featureFlag` khi cờ đó đang TẮT ở BE.
 *
 * Bốn trạng thái, KHÔNG gộp:
 *  - Query SẼ KHÔNG BAO GIỜ chạy (`fetchStatus === 'idle'` khi vẫn `isPending`
 *    — `useCapabilities` tắt `enabled` vì chưa đăng nhập, kể cả ở chế độ
 *    `authEnabled=false` không có backend nào) → coi như BẬT (fail-open),
 *    không có gì để chờ nên KHÔNG kẹt `LazyLoadFallback` mãi mãi.
 *  - ĐANG tải (`fetchStatus !== 'idle'`) → `LazyLoadFallback`, chờ không kết
 *    luận vội.
 *  - Tải xong nhưng LỖI (mất mạng, BE 5xx) → coi như BẬT (fail-open). Một lượt
 *    `/capabilities` trục trặc không nên khoá cứng cả phân hệ cho MỌI người —
 *    quyền truy cập THẬT vẫn do `PermissionGuard`/BE quyết định ở tầng dưới.
 *  - Tải xong và có dữ liệu → đọc đúng cờ.
 */
export function FeatureGate({ flag, children }: FeatureGateProps) {
  const { data, isPending, isError, fetchStatus } = useCapabilities();

  const willNeverFetch = isPending && fetchStatus === 'idle';
  if (isPending && !willNeverFetch) return <LazyLoadFallback />;

  const enabled = isError || willNeverFetch || (!!data && isFeatureFlagEnabled(data.features, flag));
  if (!enabled) return <FeatureDisabledPage />;

  return <>{children}</>;
}
