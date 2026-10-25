import { Text, View } from 'react-native';

import { computeDndUntil } from '@/core/notifications';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Chip } from '@/shared/ui/chip';
import { IconTile } from '@/shared/ui/icon-tile';
import { Section } from '@/shared/ui/section';
import { formatDateTime } from '@/shared/utils/format/date.utils';
import { hapticSelection, hapticTap } from '@/shared/utils/haptics';

import { DND_ACTIVE_HINT, DND_IDLE_HINT, DND_OPTIONS } from '../constants/notification.messages';

export interface DndCardProps {
  disabled: boolean;
  /** ISO UTC đến khi nào còn "Không làm phiền"; rỗng = đang tắt. */
  dndUntil: string | null | undefined;
  /** `null` = tắt. Nơi gọi tự gọi `update.mutate({ dndUntil })`. */
  onChange: (dndUntil: string | null) => void;
}

/**
 * "Không làm phiền": đang TẮT thì hiện ba lối chọn nhanh dạng chip (1 giờ · 8 giờ · sáng mai); đang BẬT thì thẻ đổi sang
 * tông cảnh báo nổi bật — hạn kết thúc ghi to, kèm nút "Tắt" — để người dùng thấy ngay mình đang tạm dừng thông báo.
 *
 * ⚠️ Chip `role="button"` (mỗi chip là MỘT hành động bật ngay, không phải trạng thái chọn). `flex-wrap` để máy hẹp hoặc
 * chữ hệ thống to thì chip xuống dòng thay vì tràn mép.
 * `flex-1` ở khối chữ cạnh ô icon: `Text` trong `flex-row` không có nó thì mô tả dài tràn ra ngoài mép phải thẻ.
 */
export function DndCard({ disabled, dndUntil, onChange }: DndCardProps) {
  const active = Boolean(dndUntil);

  return (
    <Section icon="noti-off" title="Không làm phiền">
      <Card>
        <View className="flex-row items-start gap-sm">
          <IconTile name="noti-off" size="lg" tone={active ? 'warning' : 'neutral'} />
          <View className="flex-1 gap-2xs">
            {active ? (
              <>
                <Text className="text-label-md text-fg-2">Đang bật đến</Text>
                <Text className="text-label-lg font-semibold text-fg-1">
                  {formatDateTime(dndUntil)}
                </Text>
              </>
            ) : (
              <Text className="text-label-lg font-semibold text-fg-1">Tạm dừng thông báo đẩy</Text>
            )}
            <Text className="text-body-md text-fg-2">
              {active ? DND_ACTIVE_HINT : DND_IDLE_HINT}
            </Text>
          </View>
        </View>

        {active ? (
          <Button
            disabled={disabled}
            fullWidth
            label="Tắt"
            variant="secondary"
            onPress={() => {
              hapticSelection();
              onChange(null);
            }}
          />
        ) : (
          <View className="flex-row flex-wrap gap-xs">
            {DND_OPTIONS.map((option) => (
              <Chip
                key={option.duration}
                disabled={disabled}
                label={option.label}
                size="sm"
                onPress={() => {
                  // Chip là HÀNH ĐỘNG bật ngay (không phải chọn trong nhóm) ⇒ nhịp "chạm" của hành động chính.
                  hapticTap();
                  onChange(computeDndUntil(option.duration, new Date()));
                }}
              />
            ))}
          </View>
        )}
      </Card>
    </Section>
  );
}
