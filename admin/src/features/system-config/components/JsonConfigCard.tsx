import { memo, type ReactNode } from 'react';

import { useDisclosure } from '@/shared/hooks';
import { BoxPanel, Button, Callout, ConfirmWithReasonModal, Text } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { AuditTrailPanel } from '@/shared/widgets/audit-trail';

import { WORKSPACE_SAVE_IMPACT } from '../constants/save-impact';
import type { useJsonConfigField } from '../hooks/useJsonConfigField';
import type { SystemConfigItem } from '../types/system-config.types';

export type JsonConfigFieldState = ReturnType<typeof useJsonConfigField>;

export interface JsonConfigCardProps {
  item: SystemConfigItem;
  /** Tiêu đề thẻ + hộp thoại xác nhận. Mặc định nhãn của khoá (`item.label`) — đặt riêng khi nhãn khoá quá chung. */
  title?: string;
  /** Câu phụ dưới tiêu đề thẻ. */
  description?: string;
  /** Có `system-config:update` — thiếu thì không có nút lưu/khôi phục (trình sửa tự hiện chỉ-đọc). */
  canEdit: boolean;
  /** Form đang có thay đổi chưa lưu. */
  isDirty: boolean;
  g: JsonConfigFieldState;
  /** Bấm "Lưu": bên trong kiểm tra form rồi gọi `g.requestSave(...)` — khung không tự biết dữ liệu. */
  onSaveClick: () => void;
  /** Tác động/so sánh hiện trong hộp thoại lý do khi lưu. */
  saveImpact: ReactNode;
  /** Trình sửa của khoá (danh sách cột, danh sách hạn mức…). */
  children: ReactNode;
}

/**
 * Khung một thẻ cấu hình có field `json` (khác `ConfigGroupCard` sinh ô từ `fields[]`): `BoxPanel` + nút
 * "Khôi phục mặc định" / "Lưu", banner xung đột 409, nhật ký thay đổi và hai hộp thoại xác nhận có LÝ DO
 * (≥ 10 ký tự, ghi audit) — cùng mẫu với thẻ nhóm thường. Trình sửa cụ thể là `children`.
 */
const JsonConfigCard = memo(function JsonConfigCard({
  item,
  title,
  description,
  canEdit,
  isDirty,
  g,
  onSaveClick,
  saveImpact,
  children,
}: JsonConfigCardProps) {
  const audit = useDisclosure();
  const heading = title ?? item.label;

  return (
    <BoxPanel
      border="hairline"
      className="h-auto"
      description={description}
      headerRight={
        canEdit ? (
          <div className="flex items-center gap-2">
            <Button disabled={!g.hasOverride} size="sm" variant="ghost" onClick={g.resetModal.open}>
              Khôi phục mặc định
            </Button>
            <Button disabled={!isDirty} loading={g.isSaving} size="sm" onClick={onSaveClick}>
              Lưu
            </Button>
          </div>
        ) : undefined
      }
      title={heading}
    >
      <div className="flex flex-col gap-3 p-3">
        {g.showConflict && (
          <Callout
            action={
              <Button size="sm" variant="stroke" onClick={() => void g.reload()}>
                Tải lại
              </Button>
            }
            description="Giá trị bạn đang nhập vẫn được giữ để đối chiếu. Tải lại để lưu tiếp trên bản mới."
            intent="warning"
            title="Cấu hình vừa được người khác thay đổi"
          />
        )}

        {children}

        <div className="flex flex-col gap-2">
          <Button
            aria-expanded={audit.isOpen}
            className="self-start"
            size="sm"
            startIcon={
              <SystemIcon
                name={audit.isOpen ? 'angle-down-outline' : 'angle-right-outline'}
                size={14}
              />
            }
            variant="ghost"
            onClick={audit.toggle}
          >
            Nhật ký thay đổi
          </Button>
          {audit.isOpen && <AuditTrailPanel targetId={item.key} targetType="SystemConfig" />}
          {item.updatedAt && (
            <Text size="tiny" skin="muted">
              Phiên bản {item.version}
            </Text>
          )}
        </div>
      </div>

      <ConfirmWithReasonModal
        confirmLabel="Lưu cấu hình"
        impact={
          <div className="flex flex-col gap-3">
            <span>{WORKSPACE_SAVE_IMPACT}</span>
            {saveImpact}
          </div>
        }
        open={g.saveModal.isOpen}
        title={`Lưu "${heading}"`}
        onConfirm={g.confirmSave}
        onOpenChange={(open) => (open ? g.saveModal.open() : g.saveModal.close())}
      />
      <ConfirmWithReasonModal
        confirmLabel="Khôi phục mặc định"
        impact={`Toàn bộ giá trị tuỳ chỉnh của "${heading}" bị xoá, hệ thống dùng lại mặc định. ${WORKSPACE_SAVE_IMPACT}`}
        open={g.resetModal.isOpen}
        title="Khôi phục mặc định"
        onConfirm={g.confirmRestore}
        onOpenChange={(open) => (open ? g.resetModal.open() : g.resetModal.close())}
      />
    </BoxPanel>
  );
});

export default JsonConfigCard;
