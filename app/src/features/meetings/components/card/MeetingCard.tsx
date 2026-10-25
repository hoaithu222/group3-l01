import { Pressable, Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { formatTime } from '@/shared/utils/format/date.utils';
import { cn } from '@/shared/utils/style/cn';

import type { MeetingListItemDto, MeetingStatus } from '../../api/meetings.types';
import {
  JOIN_LABEL,
  PLATFORM_LABEL,
  RSVP_LABEL,
  STATUS_LABEL,
} from '../../constants/meetings.constants';
import { formatTimeRange, meetingZoneNote } from '../../utils/meeting-time.utils';
import { MeetingStatusBadge } from './MeetingStatusBadge';

export interface MeetingCardProps {
  item: MeetingListItemDto;
  /** Nút nhanh vào họp khi server cho phép (`myActions.canJoin`) — mở chi tiết/phòng; KHÔNG tự suy quyền ở client. */
  onJoin: (item: MeetingListItemDto) => void;
  onPress: (item: MeetingListItemDto) => void;
}

/**
 * Vạch màu theo trạng thái cạnh cột giờ — CÙNG bảng màu với `MeetingStatusBadge` (sắp tới xanh dương · đang diễn ra xanh lá · đã kết
 * thúc xám · huỷ đỏ). Trang trí thuần: nghĩa nằm ở CHỮ của badge, vạch chỉ để quét dọc agenda là thấy ngay cuộc nào đang diễn ra.
 * ⛔ Chuỗi TĨNH, đừng ghép `bg-${…}`: NativeWind chỉ sinh class nhìn thấy nguyên văn trong mã nguồn.
 */
const ACCENT: Record<MeetingStatus, string> = {
  CANCELLED: 'bg-error',
  ENDED: 'bg-border-strong',
  LIVE: 'bg-success',
  SCHEDULED: 'bg-info',
};

/** Cửa sổ "Sắp bắt đầu": còn ≤ 10 phút tới giờ bắt đầu. */
const SOON_WINDOW_MS = 10 * 60 * 1000;

/**
 * Cuộc họp CHƯA bắt đầu nhưng còn ≤ 10 phút — điểm nhấn tĩnh (viền + dòng "Sắp bắt đầu"), ⛔ không vòng lặp.
 * ⚠️ Tính theo giờ lúc VẼ, không hẹn giờ vẽ lại (agenda tự làm mới khi quay lại màn / socket đổi trạng thái) ⇒ có thể
 * trễ tới lượt vẽ sau: đủ cho một gợi ý thị giác, ⛔ KHÔNG dùng làm luật được vào họp (việc của `myActions.canJoin`).
 */
function startsSoon(item: MeetingListItemDto): boolean {
  if (item.status !== 'SCHEDULED') return false;
  const lead = new Date(item.startAt).getTime() - Date.now();
  return lead > 0 && lead <= SOON_WINDOW_MS;
}

/**
 * Thẻ một cuộc họp trong agenda (app.md p2-04 §3): cột GIỜ bên trái (bắt đầu đậm, kết thúc nhạt — giờ THIẾT BỊ, README §7) + vạch
 * trạng thái + khối nội dung (tiêu đề · badge trạng thái bằng chữ; dòng phụ có icon hình thức: nền tảng · số người · phản hồi của tôi ·
 * giờ theo múi giờ cuộc họp khi khác). Agenda được quét bằng GIỜ nên giờ đứng thành cột thẳng hàng giữa các thẻ, thay vì chìm trong dòng chữ 14 xám như bản cũ.
 * Chỉ có metadata (OWNER/ADMIN không tham dự) ⇒ "Chỉ xem tóm tắt". Đã huỷ ⇒ tiêu đề gạch ngang + chữ "Đã huỷ" ở badge (không chỉ gạch).
 *
 * Nút vào họp ở HÀNG RIÊNG dưới thân thẻ, ngoài vùng bấm mở chi tiết: đặt cạnh tiêu đề + badge thì máy 360dp chỉ còn ~55dp cho tiêu
 * đề; lồng vào trong `Pressable` của thân thẻ thì trình đọc màn hình gộp mất nút vào nhãn của thẻ.
 *
 * ── Điểm nhấn theo trạng thái (thẻ là HÀNG của SectionList ⇒ ⛔ không `BorderBeam`/`Reveal` trong hàng) ──────────────
 * - Đang diễn ra: chấm nhịp nhỏ cạnh badge (không nhãn — chữ badge đã nói) + nút vào họp XANH LÁ, cỡ `md`, rộng hết thẻ —
 *   việc cần làm NGAY nổi hơn hẳn nút `sm` nép góc phải của cuộc họp chưa tới giờ.
 * - Còn ≤ 10 phút: viền `info` + dòng "Sắp bắt đầu" có icon đồng hồ — tĩnh, cùng tông "Sắp tới"; badge GIỮ chữ "Sắp tới".
 */
export function MeetingCard({ item, onJoin, onPress }: MeetingCardProps) {
  const cancelled = item.status === 'CANCELLED';
  const live = item.status === 'LIVE';
  const soon = startsSoon(item);
  const canJoin = item.myActions.canJoin && !cancelled;
  const joinLabel = item.myActions.joinVia ? JOIN_LABEL[item.myActions.joinVia] : 'Vào cuộc họp';
  const rsvp = item.myRsvp && item.myRsvp !== 'PENDING' ? RSVP_LABEL[item.myRsvp] : null;
  const zone = meetingZoneNote(item.startAt, item.timezone);
  const people = item.attendeeCount > 0 ? `${String(item.attendeeCount)} người` : null;
  const meta = [PLATFORM_LABEL[item.platform], people, rsvp ? `Bạn: ${rsvp}` : null, zone || null]
    .filter(Boolean)
    .join(' · ');
  const label = [
    item.title,
    formatTimeRange(item.startAt, item.endAt),
    STATUS_LABEL[item.status],
    soon ? 'Sắp bắt đầu' : null,
    meta,
    item.isMetadataOnly ? 'Chỉ xem tóm tắt' : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View
      className={cn(
        'mx-md mb-sm overflow-hidden rounded-md border-hairline bg-bg-1',
        soon ? 'border-border-info' : 'border-border-1',
      )}
    >
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        onPress={() => onPress(item)}
      >
        {({ pressed }) => (
          // ⛔ `collapsable={false}`: nền chỉ có LÚC NHẤN — Fabric làm phẳng View không nền thì vệt nhấn vẽ sai lớp.
          <View
            className={cn('flex-row gap-sm p-md', pressed && 'bg-bg-primary')}
            collapsable={false}
          >
            {/* `min-w-12`: mọi thẻ cùng bề ngang cột giờ ⇒ vạch trạng thái của các thẻ thẳng một đường dọc. */}
            <View className="min-w-12 gap-3xs">
              <Text
                className={cn('text-label-lg font-semibold', cancelled ? 'text-fg-2' : 'text-fg-1')}
              >
                {formatTime(item.startAt)}
              </Text>
              <Text className="text-caption-lg text-fg-2">{formatTime(item.endAt)}</Text>
            </View>
            <View className={cn('w-1 rounded-full', ACCENT[item.status])} />
            <View className="flex-1 gap-2xs">
              <View className="flex-row items-start gap-xs">
                <Text
                  className={cn(
                    'flex-1 text-label-lg font-semibold',
                    cancelled ? 'text-fg-2 line-through' : 'text-fg-1',
                  )}
                  numberOfLines={2}
                >
                  {item.title}
                </Text>
                <MeetingStatusBadge pulse status={item.status} />
              </View>
              {/* Icon theo HÌNH THỨC dẫn dòng phụ: quét agenda là tách được họp tại chỗ (ghim địa điểm) với họp trực tuyến (máy
                  quay) mà không phải đọc chữ. Trang trí thuần — nghĩa đã nằm ở tên nền tảng trong dòng chữ. `h-4`: hộp icon cao
                  gần đúng một dòng `caption-lg` (17) ⇒ icon đứng giữa DÒNG ĐẦU khi dòng phụ dài xuống hai dòng. */}
              <View className="flex-row items-start gap-2xs">
                <View className="h-4 justify-center">
                  <Icon
                    color="fg-2"
                    name={item.format === 'OFFLINE' ? 'location' : 'video-camera'}
                    size={14}
                  />
                </View>
                <Text className="flex-1 text-caption-lg text-fg-2">{meta}</Text>
              </View>
              {/* Chữ + icon (không chỉ viền màu) — màu KHÔNG là dấu hiệu duy nhất; đã có trong `label` của thẻ. */}
              {soon ? (
                <View className="flex-row items-center gap-3xs">
                  <Icon color="info" name="clock" size={12} />
                  <Text className="text-caption-lg font-semibold text-info">Sắp bắt đầu</Text>
                </View>
              ) : null}
              {item.isMetadataOnly ? (
                <View className="flex-row items-center gap-3xs">
                  <Icon color="fg-2" name="lock" size={12} />
                  <Text className="text-caption-lg text-fg-2">Chỉ xem tóm tắt</Text>
                </View>
              ) : null}
            </View>
          </View>
        )}
      </Pressable>
      {canJoin ? (
        <View className="items-end border-t-hairline border-divider-1 px-md py-sm">
          <Button
            accessibilityLabel={`${joinLabel}: ${item.title}`}
            fullWidth={live}
            iconLeft="video-camera"
            label={joinLabel}
            size={live ? 'md' : 'sm'}
            variant={live ? 'success' : 'primary'}
            onPress={() => onJoin(item)}
          />
        </View>
      ) : null}
    </View>
  );
}
