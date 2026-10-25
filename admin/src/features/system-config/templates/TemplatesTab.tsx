import { memo, useCallback, useState } from 'react';

import { useAuthStore } from '@/app/store';
import { Button, Callout, ConfirmWithReasonModal, EmptyState, Skeleton } from '@/shared/ui';

import TemplateDrawer from './components/TemplateDrawer';
import TemplateTable from './components/TemplateTable';
import { useTemplateReorder } from './hooks/useTemplateReorder';
import { useWorkspaceTemplates } from './service/templates.queries';
import type { WorkspaceTemplate } from './types/templates.types';

const NO_TEMPLATES: WorkspaceTemplate[] = [];

/**
 * Tab "Mẫu nhóm" (`?tab=templates`, p5-04 admin.md §2.1) — xem/sửa nội dung và bật/tắt các mẫu workspace
 * (Nhóm môn học, Đồ án, Nhóm tự học). KHÔNG tạo/xoá mã mẫu (seed bằng `npm run db:seed:templates`). Xem cần
 * `system-config:view` (do route lo); sửa cần `system-config:update` — thiếu thì bảng và ngăn kéo chỉ đọc.
 * Mọi ghi đều có lý do + `expectedVersion` + nhật ký, và chỉ áp cho nhóm tạo SAU.
 */
const TemplatesTab = memo(function TemplatesTab() {
  const canEdit = useAuthStore((s) => s.hasPermission)('system-config', 'update');
  const { data, isLoading, isError, refetch } = useWorkspaceTemplates();
  const templates = data ?? NO_TEMPLATES;

  const [openCode, setOpenCode] = useState<string | null>(null);
  const reorder = useTemplateReorder(templates, canEdit);
  const selected = templates.find((t) => t.code === openCode) ?? null;

  const handleClose = useCallback(() => setOpenCode(null), []);
  const reloadSelected = useCallback(
    async () => (await refetch()).data?.find((t) => t.code === openCode),
    [refetch, openCode],
  );

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  if (isError) {
    return (
      <Callout
        action={
          <Button size="sm" variant="stroke" onClick={() => void refetch()}>
            Thử lại
          </Button>
        }
        intent="error"
        title="Không tải được danh sách mẫu nhóm"
      />
    );
  }

  if (templates.length === 0) {
    return (
      <EmptyState
        description="Chạy `npm run db:seed:templates` ở backend để tạo ba mẫu mặc định."
        title="Chưa có mẫu nhóm"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Callout
        description="Sửa mẫu chỉ ảnh hưởng nhóm tạo sau; nhóm đã tạo không đổi. Mẫu tắt không hiện khi tạo nhóm."
        intent="info"
        title="Mẫu nhóm"
      />
      <TemplateTable
        canEdit={canEdit}
        templates={reorder.rows}
        onOpen={setOpenCode}
        onReorder={reorder.handleReorder}
      />

      {selected && (
        <TemplateDrawer
          key={selected.code}
          canEdit={canEdit}
          template={selected}
          onClose={handleClose}
          onReload={reloadSelected}
        />
      )}

      <ConfirmWithReasonModal
        confirmLabel="Lưu thứ tự"
        impact={
          <div className="flex flex-col gap-2">
            <span>{`Thứ tự mới: ${reorder.sequence}.`}</span>
            <span>Chỉ đổi thứ tự hiển thị khi chọn mẫu tạo nhóm; nhóm đã tạo không đổi.</span>
          </div>
        }
        open={reorder.isOpen}
        title="Đổi thứ tự mẫu nhóm"
        onConfirm={reorder.confirm}
        onOpenChange={(open) => !open && reorder.cancel()}
      />
    </div>
  );
});

export default TemplatesTab;
