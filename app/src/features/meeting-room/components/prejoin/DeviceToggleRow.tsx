import { View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Divider } from '@/shared/ui/divider';
import { Icon } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { Toggle } from '@/shared/ui/toggle';
import { hapticSelection } from '@/shared/utils/haptics';

export interface DeviceToggleRowProps {
  /** Tên đường ra âm thanh hiện tại ("Loa ngoài", "Tai nghe"…) — không có thì "Mặc định". */
  audioRouteLabel?: string;
  /** Quyền camera bị từ chối — hiện dòng nhắc "vẫn vào được, không có camera" (một dòng cố định, không popup lặp). */
  camDenied: boolean;
  camOn: boolean;
  micDenied: boolean;
  micOn: boolean;
  onOpenAudioRoute: () => void;
  onToggleCam: () => void;
  onToggleMic: () => void;
}

const micNote = (on: boolean, denied: boolean): string =>
  denied
    ? 'Chưa có quyền micro. Bạn vẫn vào được cuộc họp và chỉ nghe.'
    : on
      ? 'Đang bật — mọi người nghe được bạn.'
      : 'Đang tắt — mọi người không nghe thấy bạn.';

const camNote = (on: boolean, denied: boolean): string =>
  denied
    ? 'Chưa có quyền camera. Bạn vẫn vào được cuộc họp, không có hình ảnh.'
    : on
      ? 'Đang bật — mọi người thấy bạn.'
      : 'Đang tắt — mọi người không thấy bạn.';

/**
 * Thiết bị trước khi vào họp (app.md p2-05 §3.2 `DeviceToggleRow`): micro + camera là hai công tắc `switch` — MẶC ĐỊNH TẮT, không tự bật ở
 * bất kỳ bước nào (§7) — và một hàng mở tấm chọn loa/tai nghe/Bluetooth. Trạng thái nằm ở CHỮ dưới nhãn, không chỉ ở vị trí núm.
 *
 * ⚠️ Công tắc KHÔNG bị khoá khi quyền bị từ chối: chạm lại là cơ hội hỏi quyền lần nữa (hoặc mở Cài đặt) — việc đó do hook của cha lo.
 */
/**
 * Tông ô icon theo TRẠNG THÁI thiết bị: bật = `success`, tắt = `neutral`, bị từ chối quyền = `warning`. Chỉ là mốc nhìn phụ — trạng thái
 * thật nằm ở CHỮ dưới nhãn (`micNote`/`camNote`) và ở vai `switch` của công tắc.
 */
const deviceTone = (on: boolean, denied: boolean): IconTileTone =>
  denied ? 'warning' : on ? 'success' : 'neutral';

export function DeviceToggleRow({
  audioRouteLabel,
  camDenied,
  camOn,
  micDenied,
  micOn,
  onOpenAudioRoute,
  onToggleCam,
  onToggleMic,
}: DeviceToggleRowProps) {
  // Ô icon đứng NGOÀI công tắc (trang trí, không nhận chạm) — vùng chạm + nhãn trợ năng vẫn là cả hàng `Toggle` như cũ.
  return (
    <Card>
      <View className="gap-sm">
        <View className="flex-row items-center gap-sm">
          <IconTile name="mic-01" size="md" tone={deviceTone(micOn, micDenied)} />
          <View className="flex-1">
            <Toggle
              description={micNote(micOn, micDenied)}
              label="Micro"
              value={micOn}
              onChange={() => {
                hapticSelection();
                onToggleMic();
              }}
            />
          </View>
        </View>
        <Divider />
        <View className="flex-row items-center gap-sm">
          <IconTile name="video-camera" size="md" tone={deviceTone(camOn, camDenied)} />
          <View className="flex-1">
            <Toggle
              description={camNote(camOn, camDenied)}
              label="Camera"
              value={camOn}
              onChange={() => {
                hapticSelection();
                onToggleCam();
              }}
            />
          </View>
        </View>
        <Divider />
        <ListItem
          label="Âm thanh ra"
          leading={<IconTile name="audio" size="md" tone="accent" />}
          trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
          value={audioRouteLabel ?? 'Mặc định'}
          onPress={onOpenAudioRoute}
        />
      </View>
    </Card>
  );
}
