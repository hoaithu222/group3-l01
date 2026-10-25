import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';

import { statusBanner, statusLabel, type StatusTone } from '../utils/editor-status';
import type { StatusPayload } from '../webview/doc-editor-bridge.types';

export interface EditorStatusRowProps {
  /** Có được sửa không (đã đồng bộ, không chỉ đọc) — quyết việc hiện nút "Sửa". */
  editable: boolean;
  status: StatusPayload | null;
  tokenProblem: boolean;
  uploading: boolean;
  onEdit: () => void;
}

const BADGE_VARIANT: Record<StatusTone, 'error' | 'neutral' | 'success' | 'warning'> = {
  error: 'error',
  neutral: 'neutral',
  success: 'success',
  warning: 'warning',
};

/**
 * Dải trạng thái dưới `AppBar` của editor: chấm trạng thái bằng CHỮ ("Đã lưu"/"Đang đồng bộ…"/"Mất kết nối"/"Chưa lưu được — sẽ thử lại"),
 * nút "Sửa" (đưa con trỏ về cuối — mở tài liệu KHÔNG tự bật bàn phím) và tối đa MỘT banner ưu tiên cao nhất (`statusBanner`).
 *
 * ⚠️ `Badge` không phải phần tử phải-nhận-chạm nên đặt cạnh nút trong `flex-row` cùng khoảng trống: dòng phụ "Đang tải ảnh lên…"
 * có `flex-1` để nút "Sửa" không bị đẩy ra ngoài màn ở cỡ chữ lớn (Text cạnh nút trong `flex-row` phải có `flex-1`).
 * `accessibilityLiveRegion="polite"`: đổi trạng thái lưu được đọc lên mà không giật tiêu điểm của người dùng.
 */
export function EditorStatusRow({
  editable,
  onEdit,
  status,
  tokenProblem,
  uploading,
}: EditorStatusRowProps) {
  const label = statusLabel(status);
  const banner = statusBanner(status, tokenProblem);

  return (
    <View className="gap-xs px-md pb-xs pt-2xs">
      <View className="min-h-[40px] flex-row items-center gap-xs">
        <View accessibilityLiveRegion="polite" className="flex-1 flex-row items-center gap-xs">
          <Badge label={label.text} size="sm" variant={BADGE_VARIANT[label.tone]} />
        </View>
        {uploading ? (
          <View accessibilityLiveRegion="polite" className="flex-1 items-end">
            <Badge label="Đang tải ảnh lên…" size="sm" variant="info" />
          </View>
        ) : null}
        {editable ? <Button label="Sửa" size="sm" variant="secondary" onPress={onEdit} /> : null}
      </View>
      {banner ? <Alert description={banner.text} tone={banner.tone} /> : null}
    </View>
  );
}
