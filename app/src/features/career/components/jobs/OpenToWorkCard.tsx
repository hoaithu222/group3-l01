import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Card } from '@/shared/ui/card';
import { Toggle } from '@/shared/ui/toggle';

import type { JobSettings } from '../../api/recruiter.types';

export interface OpenToWorkCardProps {
  /** Mất mạng ⇒ khoá công tắc: đổi mà không tới server thì màn nói "đã bật" trong khi dữ liệu chưa hề được chia sẻ. */
  offline: boolean;
  /** Đang chờ server xác nhận lượt BẬT (không lạc quan). */
  pendingOn: boolean;
  settings: JobSettings;
  onToggle: (next: boolean) => void;
}

/**
 * Thẻ Open to work (app.md §2 `OpenToWorkCard`): công tắc + trạng thái bằng CHỮ + "doanh nghiệp sẽ thấy gì" (chi tiết ở `RecruiterVisibilityPreview`).
 * Bảng tin nhà tuyển dụng đang tắt (`recruiterEnabled = false`) ⇒ công tắc chỉ TẮT được: đang bật thì cho tắt (BE vẫn nhận `PUT` tắt), đang tắt thì khoá kèm giải thích.
 */
export function OpenToWorkCard({ offline, onToggle, pendingOn, settings }: OpenToWorkCardProps) {
  const blocked = !settings.recruiterEnabled && !settings.openToWork;

  return (
    <Card title="Open to work">
      <View className="gap-sm">
        <Toggle
          description="Doanh nghiệp đã được duyệt tìm thấy hồ sơ của bạn và gửi lời mời. Bạn chọn có tiếp chuyện hay không."
          disabled={offline || pendingOn || blocked}
          label="Cho doanh nghiệp tìm thấy tôi"
          value={settings.openToWork}
          onChange={onToggle}
        />
        <Text accessibilityLiveRegion="polite" className="text-caption-lg text-fg-2">
          {settings.openToWork
            ? 'Đang bật — hồ sơ của bạn hiện trong tìm kiếm của doanh nghiệp đã duyệt. Tắt là biến mất ngay.'
            : 'Đang tắt — không doanh nghiệp nào tìm thấy bạn. Lời mời đã nhận vẫn còn.'}
        </Text>
        {offline ? (
          <Text className="text-caption-lg text-fg-2">Cần có mạng để đổi cài đặt này.</Text>
        ) : null}
        {blocked ? (
          <Alert
            description="Bảng tin nhà tuyển dụng đang tạm tắt nên chưa bật được. Bạn vẫn xem được các lời mời đã nhận."
            tone="warning"
          />
        ) : null}
      </View>
    </Card>
  );
}
