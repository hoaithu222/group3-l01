import { View } from 'react-native';

import type { IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { ListItem, ListItemDefaultsProvider } from '@/shared/ui/list';
import { Section } from '@/shared/ui/section';

export interface HostActionsSectionProps {
  locked: boolean;
  onLowerAllHands: () => void;
  onMuteAll: () => void;
  /** p2-06: mở tấm "Ghi hình". Vắng = ẩn mục (không để mục chết). */
  onRecord?: () => void;
  onToggleLock: () => void;
  /** Số người đang giơ tay — có thì mục "Hạ tay mọi người" nói rõ bằng chữ. */
  raisedHands?: number;
  /** Dòng phụ của mục "Ghi hình" — trạng thái bằng CHỮ ("Đang ghi…", "Đang chờ đồng ý"). */
  recordStatus?: string;
}

const tile = (name: IconName, tone: IconTileTone) => <IconTile name={name} size="sm" tone={tone} />;

/**
 * Nhóm "Điều khiển của chủ trì" trong menu "Thêm" (CHỈ chủ trì/đồng chủ trì — nơi gọi quyết): Ghi hình · Khoá/Mở khoá · Hạ tay mọi người ·
 * Tắt mic tất cả. Việc phá huỷ "Kết thúc cho mọi người" là nút đỏ ở chân tấm, không nằm ở đây.
 *
 * ✅ Hàng danh sách (không phải ô lưới) vì mỗi việc cần một dòng HỆ QUẢ ("Người mới sẽ không vào được…") — việc của chủ trì ảnh hưởng cả
 * phòng, đọc trước khi bấm. ⛔ KHÔNG có "Bật mic người khác" (P0): chủ trì chỉ TẮT được. Nhãn phổ thông "Tắt mic tất cả" (không "Mute all").
 * ⚠️ MỘT `View` bọc các hàng: `Section` xếp con bằng `gap` — hàng có kẻ ngăn nằm trần trong đó thì giữa kẻ và hàng kế hở một dải trắng.
 */
export function HostActionsSection({
  locked,
  onLowerAllHands,
  onMuteAll,
  onRecord,
  onToggleLock,
  raisedHands,
  recordStatus,
}: HostActionsSectionProps) {
  const hands =
    raisedHands === undefined
      ? undefined
      : raisedHands > 0
        ? `${String(raisedHands)} người đang giơ tay.`
        : 'Không ai đang giơ tay.';
  return (
    // `tone="default"`: tiêu đề nhóm CẤP HAI trong tấm (16 semibold, chữ chính) — tông `brand` 18 ngang cỡ tiêu đề tấm, tranh thứ bậc.
    <Section icon="shield-user" title="Điều khiển của chủ trì" tone="default">
      <View>
        <ListItemDefaultsProvider emphasis="title">
          {onRecord ? (
            <ListItem
              description={recordStatus}
              divider
              label="Ghi hình"
              leading={tile('video-camera', 'warning')}
              onPress={onRecord}
            />
          ) : null}
          <ListItem
            description={
              locked
                ? 'Cho phép người mới tham gia trở lại.'
                : 'Người mới sẽ không vào được khi cuộc họp đang khoá.'
            }
            divider
            label={locked ? 'Mở khoá cuộc họp' : 'Khoá cuộc họp'}
            leading={tile('lock', 'accent')}
            onPress={onToggleLock}
          />
          <ListItem
            description={hands}
            divider
            label="Hạ tay mọi người"
            leading={tile('circle-arrow-down-01', 'info')}
            onPress={onLowerAllHands}
          />
          <ListItem
            description="Mọi người bị tắt mic; ai cần nói sẽ tự bật lại."
            label="Tắt mic tất cả"
            leading={tile('mic-01', 'neutral')}
            onPress={onMuteAll}
          />
        </ListItemDefaultsProvider>
      </View>
    </Section>
  );
}
