import { memo } from 'react';
import { useWatch } from 'react-hook-form';

import { AuditTrailPanel } from '@/shared/widgets/audit-trail';
import { BoxPanel, Button, Callout, ConfirmWithReasonModal, Form, Text } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { useDisclosure } from '@/shared/hooks';

import { saveImpactFor } from '../constants/save-impact';
import { useConfigGroup } from '../hooks/useConfigGroup';
import type { SystemConfigItem } from '../types/system-config.types';
import { formKeyOf } from '../utils/config-fields';
import type { ConfigFormValues } from '../utils/config-form';
import ConfigDiffPreview from './ConfigDiffPreview';
import ConfigFieldRow from './ConfigFieldRow';

export interface ConfigGroupCardProps {
  item: SystemConfigItem;
  /** Có `system-config:update` — thiếu thì mọi ô chỉ đọc, không có nút lưu. */
  canEdit: boolean;
  /** Tải lại danh sách và trả bản mới của khoá này (để giữ giá trị đang nhập). */
  onReload: (key: string) => Promise<SystemConfigItem | undefined>;
}

/**
 * Một nhóm cấu hình (một khoá registry) — `BoxPanel` + ô nhập sinh từ `fields[]` của BE
 * (admin.md p0-07 §2.2). Trạng thái/hành động nằm ở `useConfigGroup`.
 */
const ConfigGroupCard = memo(function ConfigGroupCard({
  item,
  canEdit,
  onReload,
}: ConfigGroupCardProps) {
  const g = useConfigGroup({ item, onReload });
  const saveModal = useDisclosure();
  const resetModal = useDisclosure();
  const audit = useDisclosure();
  const values = useWatch({ control: g.form.control }) as ConfigFormValues;
  // Khoá có nghĩa nghiệp vụ riêng (vd `notification.defaults`) nói rõ tác động; còn lại dùng câu chung.
  const saveImpact = saveImpactFor(item.key);

  return (
    <BoxPanel
      border="hairline"
      className="h-auto"
      headerRight={
        canEdit ? (
          <div className="flex items-center gap-2">
            <Button disabled={!g.hasOverride} size="sm" variant="ghost" onClick={resetModal.open}>
              Khôi phục mặc định cả nhóm
            </Button>
            <Button
              disabled={!g.isDirty}
              loading={g.isSaving}
              size="sm"
              onClick={g.form.handleSubmit((v) => {
                g.setPending(v);
                saveModal.open();
              })}
            >
              Lưu nhóm
            </Button>
          </div>
        ) : undefined
      }
      title={item.label}
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

        <Form form={g.form} readOnly={!canEdit} onSubmit={() => undefined}>
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
            {g.fields.map((field) => (
              <ConfigFieldRow
                key={field.path}
                canEdit={canEdit}
                current={values?.[formKeyOf(field.path)]}
                field={field}
                form={g.form}
              />
            ))}
          </div>
        </Form>

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
            <span>{saveImpact}</span>
            <ConfigDiffPreview after={g.after} before={g.before} fields={g.fields} />
          </div>
        }
        open={saveModal.isOpen}
        title={`Lưu nhóm "${item.label}"`}
        onConfirm={g.save}
        onOpenChange={(open) => (open ? saveModal.open() : saveModal.close())}
      />
      <ConfirmWithReasonModal
        confirmLabel="Khôi phục mặc định"
        impact={`Toàn bộ giá trị tuỳ chỉnh của nhóm "${item.label}" bị xoá, hệ thống dùng lại mặc định. ${saveImpact}`}
        open={resetModal.isOpen}
        title="Khôi phục mặc định cả nhóm"
        onConfirm={g.restoreDefaults}
        onOpenChange={(open) => (open ? resetModal.open() : resetModal.close())}
      />
    </BoxPanel>
  );
});

export default ConfigGroupCard;
