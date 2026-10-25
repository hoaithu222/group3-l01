import { memo, useMemo } from 'react';

import { useFeature } from '@/app/capabilities';
import { useDisclosure } from '@/shared/hooks';
import { Button, Callout, ConfirmWithReasonModal, Drawer, Form, Text } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { AuditTrailPanel } from '@/shared/widgets/audit-trail';

import { useTemplateEditor } from '../hooks/useTemplateEditor';
import type { WorkspaceTemplate } from '../types/templates.types';
import { buildChannelTypeOptions } from '../utils/channel-type-options';
import { summarizePatch } from '../utils/template-form';
import TemplateBasicsFields from './TemplateBasicsFields';
import TemplateChannelsField from './TemplateChannelsField';

export interface TemplateDrawerProps {
  template: WorkspaceTemplate;
  /** Có `system-config:update` — thiếu thì chỉ đọc, không nút Lưu. */
  canEdit: boolean;
  onClose: () => void;
  /** Tải lại danh sách và trả bản mới của mẫu này (`undefined` = mẫu không còn). */
  onReload: () => Promise<WorkspaceTemplate | undefined>;
}

const SAVE_IMPACT = 'Chỉ áp dụng cho nhóm tạo sau; nhóm đã tạo không đổi.';

/**
 * Ngăn kéo sửa MỘT mẫu nhóm (admin.md p5-04 §2.1): tên, mô tả, bật/tắt, danh sách kênh. Lưu = kiểm Zod → hộp thoại lý do kèm
 * tác động → `PUT /admin/workspace-templates/:code` với `expectedVersion`. 409 → banner "Dữ liệu đã thay đổi" GIỮ nguyên
 * dữ liệu đang nhập; 400 → lỗi gắn đúng ô. Thiếu `system-config:update` → form chỉ đọc. Mã mẫu không sửa được.
 */
const TemplateDrawer = memo(function TemplateDrawer({
  template,
  canEdit,
  onClose,
  onReload,
}: TemplateDrawerProps) {
  const editor = useTemplateEditor({ template, onReload, onMissing: onClose });
  const audit = useDisclosure();

  const voice = useFeature('voice') === true;
  const pomodoro = useFeature('pomodoro') === true;
  const typeOptions = useMemo(
    () => buildChannelTypeOptions({ voice, pomodoro }),
    [voice, pomodoro],
  );

  return (
    <Drawer
      description={<span className="font-mono">{`Mã: ${template.code}`}</span>}
      footer={
        canEdit ? (
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>
              Đóng
            </Button>
            <Button
              disabled={!editor.hasChanges}
              loading={editor.isSaving}
              size="sm"
              onClick={() => void editor.requestSave()}
            >
              Lưu thay đổi
            </Button>
          </div>
        ) : undefined
      }
      open
      size="xl"
      title={`Mẫu nhóm — ${template.name}`}
      onOpenChange={(open) => !open && onClose()}
    >
      <div className="flex flex-col gap-4">
        {editor.showConflict && (
          <Callout
            action={
              <Button size="sm" variant="stroke" onClick={() => void editor.reload()}>
                Tải bản mới
              </Button>
            }
            description="Mẫu vừa được người khác thay đổi. Giá trị bạn đang nhập vẫn được giữ để đối chiếu — tải bản mới rồi lưu tiếp."
            intent="warning"
            title="Dữ liệu đã thay đổi"
          />
        )}
        {!canEdit && (
          <Callout
            intent="info"
            title="Bạn chỉ có quyền xem — cần system-config:update để sửa mẫu."
          />
        )}

        <Form form={editor.form} readOnly={!canEdit} onSubmit={() => undefined}>
          <TemplateBasicsFields />
          <TemplateChannelsField canEdit={canEdit} typeOptions={typeOptions} />
        </Form>

        {editor.rootError && (
          <Text role="alert" size="small" skin="error">
            {editor.rootError}
          </Text>
        )}

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
          {audit.isOpen && (
            <AuditTrailPanel targetId={template.code} targetType="WorkspaceTemplate" />
          )}
          <Text size="tiny" skin="muted">{`Phiên bản ${template.version}`}</Text>
        </div>
      </div>

      <ConfirmWithReasonModal
        confirmLabel="Lưu mẫu"
        impact={
          <div className="flex flex-col gap-2">
            <span>{SAVE_IMPACT}</span>
            <span>{summarizePatch(editor.patch)}</span>
          </div>
        }
        open={editor.saveModal.isOpen}
        title={`Lưu mẫu "${template.name}"`}
        onConfirm={editor.confirmSave}
        onOpenChange={(open) => (open ? editor.saveModal.open() : editor.saveModal.close())}
      />
    </Drawer>
  );
});

export default TemplateDrawer;
