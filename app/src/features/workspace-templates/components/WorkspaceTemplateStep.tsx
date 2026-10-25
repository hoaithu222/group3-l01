import { useEffect } from 'react';
import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { LinkButton } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import type { TemplateStepProps } from '@/shared/workspace-templates';
import { useFeature } from '@/shell/capabilities';

import { useTemplates } from '../queries/workspace-templates.queries';
import { TemplatePicker } from './TemplatePicker';

/**
 * BƯỚC CHỌN MẪU của form tạo nhóm (app.md p5-04 §3 "Tạo nhóm – bước mẫu"): "Không dùng mẫu" + các mẫu → kênh có ô tick (mặc
 * định theo `defaultSelected`). Form tạo nhóm (`workspaces`) không import feature này — FILE ROUTE `workspaces/new.tsx` nối hai
 * bên qua slot (`TemplateStepProps`).
 *
 * Bước PHỤ, không được cản việc tạo nhóm: cờ phụ `workspaceTemplates` tắt/chưa biết → không hiện gì; không có mẫu nào → không hiện
 * gì; tải lỗi → một dòng báo + "Thử lại", người dùng vẫn tạo nhóm không mẫu được.
 */
export function WorkspaceTemplateStep({
  disabled,
  onChange,
  refreshToken,
  value,
}: TemplateStepProps) {
  const enabled = useFeature('workspaceTemplates') === true;
  const { data, isError, isPending, refetch } = useTemplates(enabled);

  // BE vừa từ chối mẫu (`TPL_001`): tải lại để mẫu đã tắt biến mất khỏi danh sách.
  useEffect(() => {
    if (refreshToken > 0) void refetch();
  }, [refreshToken, refetch]);

  // Mẫu đang chọn không còn trong danh sách vừa tải ⇒ về "Không dùng mẫu", đừng giữ một lựa chọn không còn tồn tại.
  const stillListed =
    value === null || data === undefined || data.some((template) => template.code === value.code);
  useEffect(() => {
    if (!stillListed) onChange(null);
  }, [stillListed, onChange]);

  if (!enabled) return null;
  if (isPending) {
    // Cùng khuôn khối thật (dòng tiêu đề `Section` + thẻ danh sách mẫu ~4 dòng) — khối 128dp cũ "nở" gấp đôi lúc mẫu về,
    // đẩy cả form xuống dưới tay người đang gõ.
    return (
      <View className="gap-sm">
        <Skeleton className="w-1/2" />
        <Skeleton className="h-60" variant="card" />
      </View>
    );
  }
  if (isError) {
    return (
      <Alert
        actions={<LinkButton label="Thử lại" size="sm" onPress={() => void refetch()} />}
        description="Không tải được mẫu nhóm. Bạn vẫn có thể tạo nhóm không dùng mẫu."
        tone="warning"
      />
    );
  }
  if (data.length === 0) return null;

  // Tiêu đề "Mẫu nhóm (không bắt buộc)" nằm ở CHÍNH khối chọn mẫu (`optionsTitle`), không bọc thêm một `Section` ngoài — hai
  // tiêu đề chồng nhau ("Mẫu nhóm…" rồi ngay dưới là "Chọn mẫu") vừa thừa chữ vừa làm trình đọc màn hình đếm hai mốc cho một khối.
  return (
    <TemplatePicker
      disabled={disabled}
      optionsTitle="Mẫu nhóm (không bắt buộc)"
      templates={data}
      value={value}
      onChange={onChange}
    />
  );
}
