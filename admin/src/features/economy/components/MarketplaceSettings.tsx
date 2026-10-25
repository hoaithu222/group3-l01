import { memo, useState } from 'react';

import { useAuthStore } from '@/app/store';
import {
  BoxPanel,
  Button,
  Callout,
  FormModal,
  NumberField,
  Skeleton,
  Text,
  ToggleField,
  useZodForm,
} from '@/shared/ui';
import { AuditTrailPanel } from '@/shared/widgets/audit-trail';

import { economySettingsFormSchema, type EconomySettingsFormValues } from '../schemas/economy-settings.schema';
import { useUpdateEconomySettings } from '../service/economy.mutations';
import { useEconomySettings } from '../service/economy.queries';
import type { EconomySettingsValue } from '../types/marketplace.types';
import { isVersionConflict } from '../utils/economy-errors';

const ECONOMY_CONFIG_TARGET_ID = 'economy';

/**
 * Bật/tắt chợ, phí nền tảng, cấp độ tối thiểu tự duyệt (admin.md p7-02 §2.1 "Chợ") — đây LÀ `SystemConfig` khoá `economy` (BE
 * `system-config.registry.ts`), ghi qua đường CHUNG `/admin/system-config/economy` (CAS `expectedVersion` + lý do + nhật ký, cùng cơ chế
 * `ConfigGroupCard` của trang "Cấu hình hệ thống" — nhưng KHÔNG import feature đó, `feature-structure.md` admin cấm import chéo feature).
 * Mặc định TẮT (chờ điều khoản bản quyền được chủ dự án duyệt) — trang này chỉ hiện trạng thái hiện tại, không tự bật.
 */
const MarketplaceSettings = memo(function MarketplaceSettings() {
  const canEdit = useAuthStore((s) => s.hasPermission)('system-config', 'update');
  const { data, isLoading, isError, refetch } = useEconomySettings();
  const [editing, setEditing] = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  if (isError || !data) {
    return (
      <Callout
        action={
          <Button size="sm" variant="stroke" onClick={() => void refetch()}>
            Thử lại
          </Button>
        }
        description="Không tải được cấu hình chợ tài liệu."
        intent="error"
        title="Lỗi tải cấu hình"
      />
    );
  }

  const { effective, version } = data;

  return (
    <BoxPanel border="hairline" className="h-auto" title="Cài đặt chợ">
      <div className="flex flex-col gap-3 p-3">
        <Callout
          description={
            effective.marketplaceEnabled
              ? `Chợ đang MỞ — phí nền tảng ${String(effective.marketplaceFeePercent)}%, tin niêm yết được duyệt tự động từ cấp độ ${String(effective.sellerMinLevel)} (đã từng có tin được duyệt).`
              : 'Chợ đang ĐÓNG — người dùng không niêm yết/mua được (COIN_008). Chỉ mở sau khi điều khoản bản quyền tài liệu bán đã được chủ dự án duyệt.'
          }
          intent={effective.marketplaceEnabled ? 'success' : 'warning'}
          title={effective.marketplaceEnabled ? 'Chợ đang mở' : 'Chợ đang đóng'}
        />
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setEditing(true)}>
              Sửa cấu hình
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAudit((s) => !s)}>
              {showAudit ? 'Ẩn nhật ký' : 'Nhật ký thay đổi'}
            </Button>
          </div>
        )}
        {showAudit && <AuditTrailPanel targetId={ECONOMY_CONFIG_TARGET_ID} targetType="SystemConfig" />}
        <Text size="tiny" skin="muted">
          Phiên bản cấu hình {version}
        </Text>
      </div>

      {editing && (
        <MarketplaceSettingsForm
          expectedVersion={version}
          values={effective}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void refetch();
          }}
        />
      )}
    </BoxPanel>
  );
});

function MarketplaceSettingsForm({
  values,
  expectedVersion,
  onClose,
  onSaved,
}: {
  values: EconomySettingsValue;
  expectedVersion: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const update = useUpdateEconomySettings();
  const form = useZodForm<EconomySettingsFormValues>(economySettingsFormSchema, {
    defaultValues: { ...values, reason: '' },
  });

  return (
    <FormModal<EconomySettingsFormValues>
      confirmLabel="Lưu cấu hình"
      form={form}
      open
      size="sm"
      title="Sửa cấu hình chợ"
      onConfirm={async (data) => {
        if (!data) return;
        const { reason, ...value } = data;
        try {
          await update.mutateAsync({ value, expectedVersion, reason });
        } catch (err) {
          if (isVersionConflict(err)) {
            onClose();
            return;
          }
          throw err;
        }
        onSaved();
      }}
      onOpenChange={(open) => !open && onClose()}
    >
      <ToggleField
        description="Chờ điều khoản bản quyền tài liệu bán được chủ dự án duyệt trước khi bật ở môi trường có người dùng thật."
        label="Bật chợ tài liệu"
        name="marketplaceEnabled"
      />
      <NumberField label="Phí nền tảng mỗi giao dịch (%)" max={50} min={0} name="marketplaceFeePercent" required />
      <NumberField
        description="Người bán dưới cấp này hoặc chưa từng có tin được duyệt sẽ vào hàng chờ duyệt."
        label="Cấp độ tối thiểu để tự duyệt"
        max={200}
        min={1}
        name="sellerMinLevel"
        required
      />
    </FormModal>
  );
}

export default MarketplaceSettings;
