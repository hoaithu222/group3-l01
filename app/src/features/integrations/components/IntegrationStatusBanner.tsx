import { Alert } from '@/shared/ui/alert';

import type { IntegrationStatus } from '../api/integrations.types';
import { STATUS_META, statusReasonText } from '../utils/integration-labels';

/** Banner ERROR/REVOKED (app.md §3 "Chi tiết") — nói rõ lý do bằng chữ và việc cần làm; ACTIVE thì không vẽ gì. */
export function IntegrationStatusBanner({
  status,
  reason,
}: {
  status: IntegrationStatus;
  reason: string | null;
}) {
  if (status === 'ACTIVE') return null;
  return (
    <Alert
      description={statusReasonText(reason)}
      title={`Trạng thái: ${STATUS_META[status].label}`}
      tone={status === 'ERROR' ? 'error' : 'warning'}
    />
  );
}
