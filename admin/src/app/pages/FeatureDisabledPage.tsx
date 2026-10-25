import { memo } from 'react';

import { EmptyState, PageShell } from '@/shared/ui';

/**
 * Trang hiện khi vào URL của một phân hệ có `featureFlag` đang TẮT ở BE
 * (`capabilities.features[flag].enabled === false`).
 *
 * Khác `PlaceholderPage` (chưa code xong): ở đây UI đã có, chỉ đang bị vận
 * hành tắt qua `system-config` — quay lại là dùng được ngay, không cần deploy.
 */
const FeatureDisabledPage = memo(function FeatureDisabledPage() {
  return (
    <PageShell variant="center">
      <EmptyState
        description="Liên hệ quản trị viên nếu bạn cho rằng đây là nhầm lẫn."
        icon="do-not-enter-bold"
        title="Phân hệ chưa được bật trên hệ thống này"
      />
    </PageShell>
  );
});

export default FeatureDisabledPage;
