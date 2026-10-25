import { View } from 'react-native';

import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';

import type { RoomRole } from '../../api/meeting-room.types';
import type { StageLayout } from '../../store/meeting-room.store';
import { HostActionsSection } from './HostActionsSection';
import { MoreActionTile, type MoreActionTileProps } from './MoreActionTile';
import { isHostLikeRole } from './role.utils';

export interface MoreActionsSheetProps {
  /** Thiết bị/bản dựng chia sẻ được màn hình (iOS chưa có Broadcast Extension ⇒ `false` ⇒ ẨN mục, không để mục chết). */
  canScreenShare: boolean;
  /** Ghi đè quyền "Kết thúc cho mọi người" (theo `myActions.canEnd`); vắng thì theo vai trò chủ trì/đồng chủ trì. */
  canEndForAll?: boolean;
  layout: StageLayout;
  /** Cuộc họp đang khoá (người mới không vào được). */
  locked: boolean;
  onChangeLayout: (layout: StageLayout) => void;
  onClose: () => void;
  onEndForAll: () => void;
  onFlipCamera: () => void;
  onLowerAllHands: () => void;
  onMuteAll: () => void;
  /** p2-06: mở tấm "Ghi hình" (chủ trì + cuộc họp cho phép + hạ tầng hỗ trợ). Vắng = ẩn mục (không để mục chết). */
  onRecord?: () => void;
  onToggleLock: () => void;
  onToggleScreenShare: () => void;
  onToggleSpeaker: () => void;
  /** Số người đang giơ tay (`raisedHandOrder(people).size`) — có thì mục "Hạ tay mọi người" nói rõ bằng chữ. Tuỳ chọn. */
  raisedHands?: number;
  /** Dòng phụ của mục "Ghi hình" — trạng thái bằng CHỮ ("Đang ghi…", "Đang chờ đồng ý"). */
  recordStatus?: string;
  role: RoomRole;
  screenSharing: boolean;
  speakerOn: boolean;
  visible: boolean;
}

/** Số ô mỗi hàng của lưới thao tác nhanh — ô ~100dp ở máy 360dp, nhãn 2 dòng vừa đủ. */
const COLUMNS = 3;

/** Cắt thành các hàng ĐỦ `COLUMNS` ô; hàng cuối thiếu thì chèn `null` (ô trống giữ chỗ) để mọi ô cùng bề rộng. */
function toRows<T>(items: T[]): (T | null)[][] {
  const rows: (T | null)[][] = [];
  for (let start = 0; start < items.length; start += COLUMNS) {
    const row: (T | null)[] = items.slice(start, start + COLUMNS);
    while (row.length < COLUMNS) row.push(null);
    rows.push(row);
  }
  return rows;
}

/**
 * Menu "Thêm" của phòng họp (khuôn "More options" của Meet): LƯỚI ô thao tác nhanh — chia sẻ màn hình, đổi camera, loa, bố cục Lưới/Diễn
 * giả — rồi, CHỈ với chủ trì/đồng chủ trì, nhóm "Điều khiển của chủ trì" (`HostActionsSection`) và nút đỏ "Kết thúc cho mọi người" ở chân tấm.
 *
 *  · Chọn một mục thì tấm TỰ ĐÓNG rồi mới chạy việc — việc cần xác nhận (tắt mic tất cả, kết thúc) hiện hộp thoại ở cha, không kẹt sau tấm.
 *  · Trạng thái bằng CHỮ trên ô ("Đang chọn", "Đang dùng loa ngoài"), không chỉ màu nền/viền.
 *  · ⛔ KHÔNG có "Bật mic người khác" (P0).
 */
export function MoreActionsSheet(props: MoreActionsSheetProps) {
  const { canScreenShare, layout, role, screenSharing, speakerOn } = props;
  const hostLike = isHostLikeRole(role);
  const canEnd = props.canEndForAll ?? hostLike;
  const run = (action: () => void) => () => {
    props.onClose();
    action();
  };
  const layoutTile = (target: StageLayout, label: string, icon: MoreActionTileProps['icon']): MoreActionTileProps => ({
    description: layout === target ? 'Đang chọn' : undefined,
    icon,
    label,
    onPress: run(() => props.onChangeLayout(target)),
    selected: layout === target,
  });
  const tiles: MoreActionTileProps[] = [
    ...(canScreenShare
      ? [{ icon: 'lap', label: screenSharing ? 'Dừng chia sẻ màn hình' : 'Chia sẻ màn hình', onPress: run(props.onToggleScreenShare), selected: screenSharing, tone: 'info' } as const]
      : []),
    { icon: 'reload', label: 'Đổi camera trước/sau', onPress: run(props.onFlipCamera), tone: 'brand' },
    {
      description: speakerOn ? 'Đang dùng loa ngoài' : 'Đang dùng loa trong',
      icon: 'audio',
      label: speakerOn ? 'Chuyển sang loa trong' : 'Chuyển sang loa ngoài',
      onPress: run(props.onToggleSpeaker),
      tone: 'accent',
    },
    layoutTile('GRID', 'Bố cục lưới', 'contact-list'),
    layoutTile('SPEAKER', 'Bố cục diễn giả', 'user'),
  ];

  return (
    <BottomSheet
      footer={canEnd ? <Button fullWidth label="Kết thúc cho mọi người" variant="danger" onPress={run(props.onEndForAll)} /> : undefined}
      scrollable
      title="Thêm"
      visible={props.visible}
      onClose={props.onClose}
    >
      {/* Đệm dưới chỉ khi KHÔNG có nút "Kết thúc" ở chân tấm — có chân tấm thì khe tới hàng nút đã do `footer` lo. */}
      <View className={canEnd ? 'gap-lg' : 'gap-lg pb-md'}>
        <View accessibilityRole="menu" className="gap-xs">
          {toRows(tiles).map((row) => (
            <View key={row.map((tile) => tile?.label ?? '-').join('|')} className="flex-row gap-xs">
              {row.map((tile, index) => (tile ? <MoreActionTile key={tile.label} {...tile} /> : <View key={`empty-${String(index)}`} className="flex-1" />))}
            </View>
          ))}
        </View>
        {hostLike ? (
          <HostActionsSection
            locked={props.locked}
            raisedHands={props.raisedHands}
            recordStatus={props.recordStatus}
            onLowerAllHands={run(props.onLowerAllHands)}
            onMuteAll={run(props.onMuteAll)}
            onRecord={props.onRecord ? run(props.onRecord) : undefined}
            onToggleLock={run(props.onToggleLock)}
          />
        ) : null}
      </View>
    </BottomSheet>
  );
}
