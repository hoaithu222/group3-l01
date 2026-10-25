import { memo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import { Button, Callout, EmptyState, Skeleton, Toolbar } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { useQueryParams } from '@/shared/hooks';
import { AuditTrailPanel } from '@/shared/widgets/audit-trail';

import PlagiarismConfigForm from '../components/PlagiarismConfigForm';
import PlagiarismOverview from '../components/PlagiarismOverview';
import ReindexModal from '../components/ReindexModal';
import { usePlagiarismConfig } from '../service/plagiarism.queries';
import type { PlagiarismRange } from '../service/plagiarism.types';

const RANGE_PARAM = 'range';
const RANGE_OPTIONS: Array<{ label: string; value: PlagiarismRange }> = [
  { label: '7 ngày', value: '7d' },
  { label: '30 ngày', value: '30d' },
  { label: '90 ngày', value: '90d' },
];
const AUDIT_ACTIONS = ['plagiarism.config-update', 'plagiarism.reindex'] as const;

/**
 * Tab "Kiểm tra trùng lặp" của `system-config` (p7-05 admin.md). Admin KHÔNG BAO GIỜ thấy tên tệp, nội dung hay điểm
 * theo từng tài liệu của một nhóm — chỉ số liệu tổng hợp, cấu hình và bảo trì chỉ mục.
 */
const PlagiarismTab = memo(function PlagiarismTab() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canView = hasPermission('system-config', 'view');
  const canUpdate = hasPermission('system-config', 'update');
  const { getParam, setParam } = useQueryParams();
  const range = (RANGE_OPTIONS.find((o) => o.value === getParam(RANGE_PARAM))?.value ?? '30d') as PlagiarismRange;
  const [reindexOpen, setReindexOpen] = useState(false);

  const config = usePlagiarismConfig();

  if (!canView) {
    return <EmptyState description="Bạn không có quyền xem trang này" title="Không có quyền" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <Callout
        description="Chỉ hiện số liệu tổng hợp — quản trị nền tảng không xem tên tệp, nội dung hay điểm theo tài liệu của một nhóm."
        icon="lock-bold"
        intent="neutral"
        variant="ghost"
      />

      <Toolbar
        left={
          <div className="flex items-center gap-1">
            {RANGE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={option.value === range ? 'primary' : 'ghost'}
                onClick={() => setParam(RANGE_PARAM, option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        }
        right={
          canUpdate ? (
            <Button
              size="sm"
              startIcon={<SystemIcon name="arrows-rotate-outline" size={16} />}
              variant="stroke"
              onClick={() => setReindexOpen(true)}
            >
              Lập chỉ mục lại
            </Button>
          ) : null
        }
      />

      <PlagiarismOverview range={range} />

      {config.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : config.isError || !config.data ? (
        <Callout
          action={
            <Button size="sm" variant="stroke" onClick={() => void config.refetch()}>
              Thử lại
            </Button>
          }
          intent="error"
          title="Không tải được cấu hình"
        />
      ) : (
        <PlagiarismConfigForm canEdit={canUpdate} config={config.data} />
      )}

      <AuditTrailPanel actions={AUDIT_ACTIONS} />
      <ReindexModal open={reindexOpen} onOpenChange={setReindexOpen} />
    </div>
  );
});

export default PlagiarismTab;
