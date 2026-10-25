import type { AxiosError } from 'axios';
import { useState } from 'react';

import { extractErrorCode } from '@/core/api/error.handler';
import { Button, Callout, FormModal, NumberField, TextareaField, useZodForm } from '@/shared/ui';

import { QUOTA_GIB_MAX, QUOTA_GIB_MIN } from '../constants/workspace-resources.constants';
import { resourceQuotaSchema, type ResourceQuotaFormValues } from '../schemas/resource-quota.schema';
import { useSetResourceQuota } from '../service/workspace-resources.queries';
import { bytesToGib, formatGib, gibToBytes } from '../utils/workspace-resources.utils';

export interface ResourceQuotaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  /** Hạn mức hiện hành (byte) — giá trị khởi tạo của ô nhập. */
  currentBytes: number;
  /** Tải lại số liệu tab; trả hạn mức mới (byte) để nạp lại ô nhập sau 409. */
  onReload: () => Promise<number | undefined>;
}

/**
 * "Đặt hạn mức riêng" (p3-01 admin.md §2.1): `NumberField` GiB (0,5–100) + lý do ≥ 10 ký tự →
 * `PUT /admin/workspaces/:id/resource-quota { bytes, reason }` (audit `resource.quota-override`).
 * 409 `RES_003` (người khác vừa đổi) → banner "Tải lại", giữ modal mở và giữ lý do đang gõ.
 */
export default function ResourceQuotaModal({
  open,
  onOpenChange,
  workspaceId,
  currentBytes,
  onReload,
}: ResourceQuotaModalProps) {
  const setQuota = useSetResourceQuota(workspaceId);
  const form = useZodForm<ResourceQuotaFormValues>(resourceQuotaSchema, {
    defaultValues: { gib: bytesToGib(currentBytes), reason: '' },
  });
  const [conflict, setConflict] = useState(false);

  const reload = async () => {
    const fresh = await onReload();
    if (fresh !== undefined) form.setValue('gib', bytesToGib(fresh), { shouldDirty: false });
    setConflict(false);
  };

  return (
    <FormModal<ResourceQuotaFormValues>
      confirmLabel="Đặt hạn mức"
      form={form}
      open={open}
      size="sm"
      title="Đặt hạn mức kho tài liệu riêng"
      onConfirm={async (data) => {
        if (!data) return;
        try {
          await setQuota.mutateAsync({ bytes: gibToBytes(data.gib), reason: data.reason });
        } catch (err) {
          if (extractErrorCode(err as AxiosError) === 'RES_003') setConflict(true);
          throw err; // giữ modal mở — banner/toast đã hiện
        }
      }}
      onOpenChange={onOpenChange}
    >
      {conflict && (
        <Callout
          action={
            <Button size="sm" variant="stroke" onClick={() => void reload()}>
              Tải lại
            </Button>
          }
          description="Tải lại số liệu để lấy hạn mức mới nhất rồi đặt lại. Lý do bạn đã gõ được giữ nguyên."
          intent="warning"
          title="Hạn mức vừa được người khác thay đổi"
        />
      )}
      <div className="text-body-14 text-fg-2">
        Hạn mức riêng thay cho hạn mức mặc định của hệ thống và chỉ áp dụng cho nhóm này. Thao tác
        không xoá tệp nào của nhóm.
      </div>
      <NumberField
        description={`Từ ${formatGib(QUOTA_GIB_MIN)} đến ${formatGib(QUOTA_GIB_MAX)} GiB`}
        label="Hạn mức (GiB)"
        max={QUOTA_GIB_MAX}
        min={QUOTA_GIB_MIN}
        name="gib"
        required
        step={0.5}
      />
      <TextareaField
        label="Lý do"
        maxLength={500}
        name="reason"
        placeholder="Ghi rõ lý do — sẽ lưu vào nhật ký quản trị"
        required
        rows={3}
        showCount
      />
    </FormModal>
  );
}
