import { useState } from 'react';

import { BottomSheet, SheetActions, SheetList } from '@/shared/ui/bottom-sheet';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem, ListItemDefaultsProvider } from '@/shared/ui/list';
import { LoadingMore } from '@/shared/ui/progress';

import type { RoomPerson } from '../../utils/room-people.utils';
import { LeaveTransferList } from './LeaveTransferList';

export interface LeaveHostSheetProps {
  busy: boolean;
  candidates: readonly RoomPerson[];
  onClose: () => void;
  onEndForAll: () => void;
  onLeave: () => void;
  onLeaveAndTransfer: (userId: string) => void;
}

type Step = 'choose' | 'confirmEnd' | 'transfer';

/**
 * Tấm "Rời cuộc họp" cho chủ trì/đồng chủ trì (app.md p2-05 §3.2): ba lựa chọn — "Rời (giữ cuộc họp)", "Rời và giao quyền cho…" (chọn một
 * người rồi xác nhận), "Kết thúc cho mọi người" (hàng đỏ, phải qua bước xác nhận — hành động không hoàn tác, ảnh hưởng mọi người).
 *
 * ⚠️ MỘT `BottomSheet` đổi nội dung theo bước chứ không xếp ba tấm chồng nhau: đóng/mở liên tiếp thì hoạt ảnh trượt của tấm cũ và tấm mới
 * chồng lên nhau. State bước nằm ở đây; cha chỉ dựng component này khi cần (đóng ⇒ gỡ hẳn ⇒ lần sau luôn bắt đầu ở bước đầu).
 *
 * ✅ Ba bước, MỘT khuôn: bước chọn là danh sách hàng (menu — icon · tiêu đề · mô tả hệ quả), hai bước sau có hàng nút
 * [Quay lại | việc chính] ĐỨNG YÊN ở đáy (`SheetActions`) — nút chính không đổi chỗ giữa các bước, "Quay lại" luôn ở cùng một vị trí.
 * ❌ Bản cũ: ba nút khác kiểu xếp trong thân + một dòng chú thích chen giữa, mỗi bước một bố cục riêng.
 */
export function LeaveHostSheet({
  busy,
  candidates,
  onClose,
  onEndForAll,
  onLeave,
  onLeaveAndTransfer,
}: LeaveHostSheetProps) {
  const [step, setStep] = useState<Step>('choose');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const back = () => setStep('choose');
  const canTransfer = candidates.length > 0;

  if (step === 'transfer') {
    return (
      <BottomSheet
        description="Chọn người sẽ làm đồng chủ trì trong phiên họp khi bạn rời phòng."
        // Đang gửi yêu cầu rời: chạm nền mờ là đóng tấm mà việc vẫn chạy — khoá như `ConfirmSheet`.
        dismissOnBackdrop={!busy}
        footer={
          <SheetActions
            // ⚠️ "Rời và giao quyền" dài hơn nửa hàng ở máy 360dp ⇒ xếp dọc (nút chính trên) thay vì cắt thành "Rời và giao…".
            layout="column"
            primary={{
              disabled: selectedId === null,
              label: 'Rời và giao quyền',
              loading: busy,
              onPress: () => {
                if (selectedId) onLeaveAndTransfer(selectedId);
              },
            }}
            secondary={{ disabled: busy, label: 'Quay lại', onPress: back }}
          />
        }
        padded={false}
        scrollable
        title="Giao quyền cho…"
        visible
        onClose={onClose}
      >
        {/* `SheetList`: tấm `padded={false}` + `ListItem` trần ⇒ avatar và tên dính sát mép tấm (`ListItem` không tự có lề).
            `emphasis="title"`: tên người là TIÊU ĐỀ của hàng (chữ chính), không phải nhãn xám của hàng nhãn–giá trị. */}
        <SheetList accessibilityLabel="Người nhận quyền" accessibilityRole="radiogroup">
          <ListItemDefaultsProvider emphasis="title">
            <LeaveTransferList
              candidates={candidates}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </ListItemDefaultsProvider>
        </SheetList>
      </BottomSheet>
    );
  }

  if (step === 'confirmEnd') {
    return (
      <BottomSheet
        description="Mọi người sẽ bị ngắt khỏi cuộc họp ngay và cuộc họp không thể tiếp tục. Thao tác này không hoàn tác được."
        dismissOnBackdrop={!busy}
        footer={
          <SheetActions
            primary={{ label: 'Kết thúc', loading: busy, onPress: onEndForAll }}
            secondary={{ disabled: busy, label: 'Quay lại', onPress: back }}
            tone="danger"
          />
        }
        // Thân rỗng (tiêu đề + mô tả đã nói đủ): bỏ mốc 229dp của tấm "thông tin" — giữ nó là thừa một dải trắng dưới hàng nút.
        minHeight={0}
        // Tiêu đề nói RÕ việc sắp xảy ra (cùng chữ với `confirmCopy` của phòng), không phải "Bạn chắc chứ?" trống trơn.
        title="Kết thúc cuộc họp cho mọi người?"
        visible
        onClose={onClose}
      >
        {null}
      </BottomSheet>
    );
  }

  // Hàng khoá (đang gửi / chưa có ai để giao quyền): ô icon về `neutral` để không trông như còn bấm được (khuôn `HostParticipantMenu`).
  const transferBlocked = busy || !canTransfer;

  return (
    <BottomSheet
      description="Bạn là chủ trì. Chọn cách rời cuộc họp."
      dismissOnBackdrop={!busy}
      padded={false}
      title="Rời cuộc họp"
      visible
      onClose={onClose}
    >
      <SheetList accessibilityRole="menu" className="pb-md">
        <ListItem
          description="Mọi người vẫn họp tiếp khi bạn rời."
          disabled={busy}
          divider
          emphasis="title"
          label="Rời (giữ cuộc họp)"
          leading={<IconTile name="logout" size="sm" tone={busy ? 'neutral' : 'brand'} />}
          // ⚠️ `ListItem` không có `loading`: vòng quay CÓ NHÃN ("Đang rời cuộc họp", `busy`) ở khe cuối hàng vừa bấm — hàng giữ
          // nguyên chỗ, trình đọc màn hình vẫn biết việc đang chạy.
          trailing={busy ? <LoadingMore className="py-0" label="Đang rời cuộc họp" /> : undefined}
          onPress={onLeave}
        />
        <ListItem
          // Lý do KHÔNG giao được nằm ngay dưới nhãn của hàng bị khoá — thay cho dòng chú thích rời chen giữa các nút.
          description={
            canTransfer
              ? 'Chọn người làm đồng chủ trì rồi rời phòng.'
              : 'Chưa có ai khác trong phòng'
          }
          disabled={transferBlocked}
          divider
          emphasis="title"
          label="Rời và giao quyền cho…"
          leading={
            <IconTile name="user-setting-1" size="sm" tone={transferBlocked ? 'neutral' : 'info'} />
          }
          // Mũi tên: hàng này MỞ bước chọn người (không rời ngay). Trang trí — không nhãn nên tự ẩn khỏi trình đọc màn hình.
          trailing={
            <Icon
              color={transferBlocked ? 'action-disabled-fg' : 'fg-2'}
              name="arrow-right-small"
            />
          }
          onPress={() => setStep('transfer')}
        />
        <ListItem
          description="Mọi người bị ngắt khỏi cuộc họp, không thể tiếp tục."
          disabled={busy}
          emphasis="danger"
          label="Kết thúc cho mọi người"
          leading={<IconTile name="cancel" size="sm" tone={busy ? 'neutral' : 'danger'} />}
          onPress={() => setStep('confirmEnd')}
        />
      </SheetList>
    </BottomSheet>
  );
}
