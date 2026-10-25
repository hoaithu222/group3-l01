import { memo } from 'react';
import { useFormContext } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { Button, FieldArray, NumberField, Text } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';

import {
  QUOTA_GIB_MAX,
  QUOTA_GIB_MIN,
  WORKSPACE_MODULE_PATH,
} from '../constants/quota-overrides.constants';
import type { QuotaOverridesFormValues } from '../schemas/quota-overrides.schema';

export interface QuotaOverridesEditorProps {
  /** Có `system-config:update` — thiếu thì chỉ đọc (không sửa, không bỏ hạn mức). */
  canEdit: boolean;
  /** Có `workspace:view` — có thì mã nhóm là link tới tab Tài liệu của nhóm. */
  canViewWorkspace: boolean;
}

/**
 * Trình sửa danh sách hạn mức kho tài liệu riêng theo nhóm (field `json` `quotaOverrides`, p3-01). Mỗi hàng:
 * mã nhóm rút gọn (chỉ có id — cấu hình không lưu tên nhóm) + hạn mức GiB (`NumberField` 0,5–100) + "Bỏ hạn
 * mức" (nhóm quay về mặc định). KHÔNG có nút thêm nhóm: đặt hạn mức cho MỘT nhóm làm ở tab Tài liệu của
 * nhóm đó (có lý do + nhật ký từng nhóm). Phải nằm trong `<Form>`.
 */
const QuotaOverridesEditor = memo(function QuotaOverridesEditor({
  canEdit,
  canViewWorkspace,
}: QuotaOverridesEditorProps) {
  const { formState } = useFormContext<QuotaOverridesFormValues>();
  const listError = formState.errors.overrides?.root?.message ?? formState.errors.overrides?.message;

  return (
    <FieldArray<QuotaOverridesFormValues, 'overrides'> name="overrides">
      {({ fields, remove }) => (
        <div className="flex flex-col gap-3">
          {fields.length === 0 && (
            <Text size="small" skin="muted">
              Chưa nhóm nào có hạn mức riêng — mọi nhóm dùng hạn mức mặc định ở trên.
            </Text>
          )}
          {fields.map((field, index) => (
            <div key={field.id} className="grid grid-cols-1 items-start gap-3 md:grid-cols-[12rem_1fr_auto]">
              <div className="flex flex-col gap-1 md:pt-6">
                {canViewWorkspace ? (
                  <Link
                    className="font-mono text-caption-12 text-link hover:underline"
                    title={field.workspaceId}
                    to={`${WORKSPACE_MODULE_PATH}/${field.workspaceId}?tab=resources`}
                  >
                    Nhóm #{field.workspaceId.slice(-6)}
                  </Link>
                ) : (
                  <span className="font-mono text-caption-12 text-fg-3" title={field.workspaceId}>
                    Nhóm #{field.workspaceId.slice(-6)}
                  </span>
                )}
              </div>
              <NumberField
                description={`Từ ${QUOTA_GIB_MIN.toLocaleString('vi-VN')} đến ${QUOTA_GIB_MAX} GiB`}
                label={`Hạn mức nhóm #${field.workspaceId.slice(-6)} (GiB)`}
                max={QUOTA_GIB_MAX}
                min={QUOTA_GIB_MIN}
                name={`overrides.${index}.gib`}
                step={0.5}
              />
              {canEdit && (
                <Button
                  aria-label={`Bỏ hạn mức riêng của nhóm #${field.workspaceId.slice(-6)}`}
                  className="md:mt-6"
                  size="sm"
                  skin="danger"
                  startIcon={<SystemIcon name="trash-outline" size={14} />}
                  variant="ghost"
                  onClick={() => remove(index)}
                >
                  Bỏ hạn mức
                </Button>
              )}
            </div>
          ))}
          {listError && (
            <Text role="alert" size="small" skin="error">
              {listError}
            </Text>
          )}
          <Text size="tiny" skin="muted">
            Đặt hạn mức riêng cho một nhóm: mở nhóm đó → tab Tài liệu → "Đặt hạn mức riêng".
          </Text>
        </div>
      )}
    </FieldArray>
  );
});

export default QuotaOverridesEditor;
