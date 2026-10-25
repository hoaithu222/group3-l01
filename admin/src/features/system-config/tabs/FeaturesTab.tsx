import { Fragment, memo, useCallback, useMemo, useState } from 'react';

import { useCapabilities } from '@/app/capabilities';
import { useAuthStore } from '@/app/store';
import { useDisclosure } from '@/shared/hooks';
import { AuditTrailPanel } from '@/shared/widgets/audit-trail';
import {
  Button,
  Callout,
  ConfirmWithReasonModal,
  Drawer,
  EmptyState,
  SectionHeader,
  Skeleton,
  Table,
  Text,
} from '@/shared/ui';
import { showToast } from '@/shared/utils/toast.utils';

import { buildFeatureColumns } from '../components/feature-table.columns';
import RecordingSupportNotice from '../components/RecordingSupportNotice';
import { FEATURES_KEY } from '../constants/features.constants';
import { SUB_FEATURE_GROUP_LABELS } from '../constants/sub-features';
import { useSystemConfigList, useUpdateSystemConfig } from '../service/system-config.queries';
import { configErrorCode } from '../utils/config-errors';
import {
  buildFeatureRows,
  featureRowKey,
  featureToggleImpact,
  groupSubFeatureRows,
  splitFeatureRows,
  type PendingToggle,
} from '../utils/feature-rows';

/**
 * Tab "Tính năng" — bật/tắt phân hệ (admin.md p0-07 §2.3).
 *
 * `PUT features` thay TOÀN BỘ override nên mỗi lần bật/tắt gửi
 * `{ ...stored, [module]: next }`.
 */
const FeaturesTab = memo(function FeaturesTab() {
  const canEdit = useAuthStore((s) => s.hasPermission)('system-config', 'update');
  const list = useSystemConfigList();
  const caps = useCapabilities();
  const update = useUpdateSystemConfig();

  const [pending, setPending] = useState<PendingToggle | null>(null);
  const audit = useDisclosure();

  const item = list.data?.find((i) => i.key === FEATURES_KEY);
  const rows = useMemo(() => (item ? buildFeatureRows(item, caps.data) : []), [item, caps.data]);
  const { modules, subs } = useMemo(() => splitFeatureRows(rows), [rows]);

  const handleConfirm = useCallback(
    async (reason: string) => {
      if (!pending || !item) return;
      try {
        await update.mutateAsync({
          key: FEATURES_KEY,
          value: { ...item.stored, [pending.row.id]: pending.next },
          expectedVersion: item.version,
          reason,
        });
        setPending(null);
      } catch (err) {
        const code = configErrorCode(err);
        if (code === 'RES_003') {
          showToast('warning', 'Cấu hình vừa được người khác thay đổi — đã tải lại, hãy thử lại');
          void list.refetch();
          setPending(null);
          return;
        }
        // CFG_003/CFG_004: toast đã hiện; thử lại cũng vẫn bị chặn ⇒ đóng modal.
        if (code === 'CFG_003' || code === 'CFG_004') {
          setPending(null);
          return;
        }
        throw err;
      }
    },
    [pending, item, update, list],
  );

  const columns = useMemo(() => buildFeatureColumns({ canEdit, onToggle: setPending }), [canEdit]);
  const subColumns = useMemo(
    () => buildFeatureColumns({ canEdit, onToggle: setPending, labelHeader: 'Tiện ích' }),
    [canEdit],
  );

  if (list.isLoading || caps.isLoading) return <Skeleton className="h-64 w-full" />;

  if (list.isError || !item) {
    return (
      <Callout
        action={
          <Button size="sm" variant="stroke" onClick={() => void list.refetch()}>
            Thử lại
          </Button>
        }
        intent="error"
        title="Không tải được danh sách tính năng"
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState description="Hệ thống chưa khai báo phân hệ nào." title="Chưa có tính năng" />
    );
  }

  const turningOff = pending ? !pending.next : false;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Text size="tiny" skin="muted">
          Phiên bản cấu hình {item.version}
        </Text>
        <Button size="sm" variant="ghost" onClick={audit.open}>
          Nhật ký
        </Button>
      </div>

      <RecordingSupportNotice />
      <Table columns={columns} data={modules} pagination={false} rowKey={featureRowKey} />
      {groupSubFeatureRows(subs).map(({ parentId, rows: groupRows }) => (
        <Fragment key={parentId}>
          <SectionHeader
            description="Tiện ích của phân hệ — mặc định bật, chỉ có hiệu lực khi phân hệ cha đang bật."
            title={SUB_FEATURE_GROUP_LABELS[parentId] ?? 'Tiện ích'}
          />
          <Table columns={subColumns} data={groupRows} pagination={false} rowKey={featureRowKey} />
        </Fragment>
      ))}

      <ConfirmWithReasonModal
        confirmLabel={turningOff ? 'Tắt tính năng' : 'Bật tính năng'}
        confirmTone={turningOff ? 'danger' : 'primary'}
        impact={featureToggleImpact(pending)}
        open={pending !== null}
        title={`${turningOff ? 'Tắt' : 'Bật'} "${pending?.row.label ?? ''}"`}
        onConfirm={handleConfirm}
        onOpenChange={(open) => !open && setPending(null)}
      />

      <Drawer
        open={audit.isOpen}
        side="right"
        size="md"
        title="Nhật ký cấu hình tính năng"
        onOpenChange={(open) => (open ? audit.open() : audit.close())}
      >
        <AuditTrailPanel targetId={FEATURES_KEY} targetType="SystemConfig" />
      </Drawer>
    </div>
  );
});

export default FeaturesTab;
