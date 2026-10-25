import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { BottomSheet, SheetActions, SheetList } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { ListItem } from '@/shared/ui/list';
import { ProgressRing } from '@/shared/ui/progress-ring';

import type { RoomRecording } from '../../store/meeting-room.store';
import { elapsedSeconds, formatDuration, remainingMs } from '../../utils/clock.utils';
import { isRecordingActive } from '../../utils/recording-state.utils';

export interface ConsentRequestSheetProps {
  busy: 'REQUEST' | 'RESPOND' | 'START' | 'STOP' | null;
  /** Câu lỗi của lần thao tác gần nhất (`REC_001` kèm số người chưa đồng ý, `REC_003` thử lại…). */
  error: string | null;
  /** Giờ SERVER (ms) — đếm ngược hạn yêu cầu + đồng hồ bản ghi. */
  nowMs: number;
  recording: RoomRecording | null;
  visible: boolean;
  onClose: () => void;
  onRequest: () => void;
  onStart: () => void;
  onStop: () => void;
}

/** Luật đồng ý — chữ của bước "chưa hỏi" (người dùng đọc TRƯỚC khi gửi yêu cầu). */
const RULES =
  'Mọi người đang trong phòng sẽ được hỏi ý kiến. Chỉ bắt đầu ghi được khi tất cả đồng ý. Bản ghi lưu 90 ngày và người trong cuộc họp có thể xem.';

/**
 * Tiến độ đồng ý: chỉ SỐ, không tên (tránh áp lực, README §2). Chưa có số đếm ⇒ một dòng chờ.
 * ✅ Kẻ ngăn giữa các hàng, bỏ ở hàng CUỐI — hàng hạn/hết hạn LUÔN có mặt nên luôn là hàng cuối; hai hàng trên luôn có kẻ.
 * ⚠️ Các hàng nằm trong `SheetList` (lề 16, KHÔNG khe): để trong thân `padded` thì khe 8 chen giữa kẻ và hàng kế tiếp, hở một dải trắng.
 */
function ConsentRows({ leftSec, rec }: { leftSec: number; rec: RoomRecording }) {
  const c = rec.counts;
  const total = c ? c.accepted + c.pending + c.declined : 0;
  return (
    <>
      {c ? (
        <ListItem
          divider
          label="Đã đồng ý"
          leading={
            // Vòng tiến độ thuần trang trí — nghĩa (số người) đã nằm trong chữ của hàng, ẩn để trình đọc không đọc hai lần.
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <ProgressRing
                progress={total > 0 ? c.accepted / total : 0}
                size={24}
                tone="success"
              />
            </View>
          }
          value={`${String(c.accepted)}/${String(total)}`}
        />
      ) : (
        <ListItem divider label="Đang chờ mọi người trả lời…" />
      )}
      {c && c.declined > 0 ? <ListItem divider label="Từ chối" value={String(c.declined)} /> : null}
      {leftSec > 0 ? (
        <ListItem label="Hết hạn sau" value={`${String(leftSec)} giây`} />
      ) : (
        // Cách gỡ nằm ngay dưới trạng thái (không thêm dòng gợi ý ở hàng nút — hàng nút giữ nguyên chiều cao khi hết hạn).
        <ListItem
          description="Bấm “Nhắc lại” để gửi yêu cầu mới."
          label="Yêu cầu"
          tone="warning"
          value="Đã hết hạn"
        />
      )}
    </>
  );
}

/**
 * Tấm "Ghi hình" của chủ trì/đồng chủ trì (app.md p2-06 §3 `RecordButton` + `ConsentRequestSheet`): chưa hỏi → luật đồng ý + "Gửi yêu cầu
 * đồng ý"; đang hỏi → tiến độ bằng SỐ + đếm ngược hạn 120 s, hàng nút [Nhắc lại | Bắt đầu ghi] ("Bắt đầu ghi" chỉ bật khi MỌI người trong
 * phòng đã đồng ý; "Nhắc lại" gửi yêu cầu mới); đang ghi → đồng hồ + "Dừng ghi". Không bao giờ ghi khi còn người chưa đồng ý (server cũng
 * chặn `REC_001`).
 *
 * ✅ Nút chính của MỌI trạng thái nằm ở `footer` (đứng yên ở đáy): trước đây nút nằm trong thân nên đổi trạng thái là nút nhảy chỗ ngay dưới
 * ngón tay. Luật/giải thích ở `description`, trạng thái là các hàng nhãn–giá trị (`ListItem`) thay cho dòng chữ trơn — tấm tràn viền
 * (`padded={false}`) + `SheetList` như mọi tấm danh sách hàng.
 */
export function ConsentRequestSheet(props: ConsentRequestSheetProps) {
  const { busy, error, nowMs, recording: rec, visible } = props;
  const active = isRecordingActive(rec);
  const asking = rec?.status === 'CONSENT_REQUESTED';
  const leftSec = asking ? Math.ceil(remainingMs(rec.expiresAt, nowMs) / 1000) : 0;
  const ready = asking && !!rec.counts && rec.counts.pending === 0 && rec.counts.declined === 0;

  let description = RULES;
  let body: ReactNode = null;
  let footer: ReactNode;
  if (active && rec) {
    const stopping = rec.status === 'STOPPING';
    description = 'Bản ghi lưu 90 ngày và người trong cuộc họp có thể xem.';
    body = stopping ? (
      <ListItem label="Đang dừng ghi hình…" />
    ) : (
      // Đồng hồ đỏ = ĐANG GHI — cùng tông với nhãn "● Đang ghi hình" của phòng; nghĩa vẫn nằm ở chữ của nhãn, không chỉ ở màu.
      <ListItem
        label="Đang ghi hình"
        tone="error"
        value={formatDuration(elapsedSeconds(rec.startedAt, nowMs))}
      />
    );
    footer = (
      <Button
        disabled={stopping}
        fullWidth
        iconLeft="pause"
        label="Dừng ghi"
        loading={busy === 'STOP'}
        variant="danger"
        onPress={props.onStop}
      />
    );
  } else if (asking) {
    description = 'Chỉ bắt đầu ghi được khi mọi người trong phòng đã đồng ý.';
    body = <ConsentRows leftSec={leftSec} rec={rec} />;
    footer = (
      <SheetActions
        // ⚠️ Không kèm icon: nửa hàng máy 360dp (~150dp) vừa khít "Bắt đầu ghi", thêm icon 24 + khe 8 là nhãn bị cắt.
        primary={{
          disabled: !ready || leftSec <= 0 || busy === 'REQUEST',
          label: 'Bắt đầu ghi',
          loading: busy === 'START',
          onPress: props.onStart,
        }}
        secondary={{
          disabled: busy === 'START',
          label: 'Nhắc lại',
          loading: busy === 'REQUEST',
          onPress: props.onRequest,
        }}
      />
    );
  } else {
    footer = (
      <Button
        fullWidth
        iconLeft="direct"
        label="Gửi yêu cầu đồng ý"
        loading={busy === 'REQUEST'}
        onPress={props.onRequest}
      />
    );
  }

  return (
    <BottomSheet
      alert={error ? <Alert description={error} tone="error" /> : undefined}
      description={description}
      footer={footer}
      // Chiều cao theo nội dung ở cả ba trạng thái — mốc 200dp chỉ đệm thêm một dải trắng dưới hàng nút ở bước "chưa hỏi".
      minHeight={0}
      padded={false}
      title="Ghi hình cuộc họp"
      visible={visible}
      onClose={props.onClose}
    >
      {/* ⚠️ Không `pb-*`: dưới hàng cuối là `footer` (luôn có), khe tới hàng nút do tấm lo. Bước "chưa hỏi" không có hàng ⇒ không dựng. */}
      {body ? <SheetList accessibilityRole="list">{body}</SheetList> : null}
    </BottomSheet>
  );
}
