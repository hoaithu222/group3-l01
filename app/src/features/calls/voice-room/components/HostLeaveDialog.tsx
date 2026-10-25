import { useState } from 'react';
import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { BottomSheet, ConfirmSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { Button, LinkButton } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';

import type { CallParticipantDto } from '../../api/calls.types';

export interface HostLeaveDialogProps {
  busy: boolean;
  /** Người đang KẾT NỐI trong phòng (không phải mình), theo thứ tự vào phòng — phần tử đầu là người vào lâu nhất. */
  candidates: CallParticipantDto[];
  onClose: () => void;
  onEndForEveryone: () => void;
  /** Rời mà không chọn: hệ thống tự chuyển chủ phòng ngay theo quy tắc failover. */
  onLeaveAuto: () => void;
  onTransfer: (userId: string) => void;
  visible: boolean;
}

/**
 * Hộp thoại khi CHỦ PHÒNG bấm Rời (VR-11, README §3.2): chuyển quyền cho một người (mặc định người vào lâu nhất) · "Kết thúc cho mọi
 * người" (nguy hiểm — nút riêng, có nhãn) · "Rời, để hệ thống tự chọn". Một mình trong phòng → chỉ còn "Rời và kết thúc phòng".
 * Dạng tấm trượt (danh sách chọn người, có thể dài) chứ không `Dialog` — Dialog không cuộn.
 *
 * ✅ Ba lối rời nằm ở `footer` (đứng yên): danh sách người dài thì chúng vẫn luôn trong tầm ngón cái, không phải cuộn hết danh sách
 * mới thấy nút. ⚠️ Không dùng `SheetActions`: đây là BA hành động khác hạng (nút chính · liên kết an toàn · nút phá huỷ kèm chú
 * thích), không phải cặp [Phụ | Chính]. Việc phá huỷ đứng CUỐI — cùng luật "nhóm nguy hiểm xuống cuối" của `ActionMenuSheet`.
 */
export function HostLeaveDialog({
  busy,
  candidates,
  onClose,
  onEndForEveryone,
  onLeaveAuto,
  onTransfer,
  visible,
}: HostLeaveDialogProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const chosen =
    candidates.find((c) => c.userId === picked)?.userId ?? candidates[0]?.userId ?? null;

  if (candidates.length === 0) {
    // Một mình trong phòng ⇒ chỉ còn MỘT việc để xác nhận: `ConfirmSheet` (ô biểu tượng + câu hỏi + [Huỷ | Rời…]) thay cho tấm có
    // tiêu đề + một nút đỏ trơn không có đường lui. Nhãn nút dài (> 14 ký tự) ⇒ `column`, chia đôi là nhãn bị cắt "Rời và kết…".
    return (
      <ConfirmSheet
        actionsLayout="column"
        confirmLabel="Rời và kết thúc phòng"
        description="Bạn là người duy nhất trong phòng. Rời đi sẽ kết thúc phòng."
        icon="logout"
        // `loading` chứ không chỉ `confirmDisabled`: nút quay cho biết lệnh đang đi, và "Huỷ" + nền mờ bị khoá cùng lúc.
        loading={busy}
        title="Rời phòng?"
        tone="danger"
        visible={visible}
        onClose={onClose}
        onConfirm={onEndForEveryone}
      />
    );
  }

  return (
    <BottomSheet
      description="Chọn người nhận quyền chủ phòng trước khi rời."
      footer={
        <View className="gap-sm">
          <Button
            disabled={busy || !chosen}
            fullWidth
            label="Chuyển quyền và rời"
            onPress={() => chosen && onTransfer(chosen)}
          />
          <View className="items-center">
            <LinkButton disabled={busy} label="Rời, để hệ thống tự chọn" onPress={onLeaveAuto} />
          </View>
          {/* Chú thích đi SÁT nút nó giải thích (khe 4, không phải khe 12 của cả cụm) — mắt đọc thành một khối. */}
          <View className="gap-2xs">
            <Button
              disabled={busy}
              fullWidth
              label="Kết thúc cho mọi người"
              variant="danger-secondary"
              onPress={onEndForEveryone}
            />
            <Text className="text-center text-caption-lg text-fg-2">
              Kết thúc sẽ ngắt mọi người khỏi phòng ngay.
            </Text>
          </View>
        </View>
      }
      // Danh sách hàng có kẻ ⇒ tràn viền + `SheetList` (lề 16): thân `padded` chèn khe 8 giữa các hàng, kẻ và hàng kế tiếp hở ra.
      padded={false}
      scrollable
      title="Bạn là chủ phòng"
      visible={visible}
      onClose={onClose}
    >
      <SheetList accessibilityLabel="Người nhận quyền chủ phòng" accessibilityRole="radiogroup">
        {candidates.map((c, index) => {
          const selected = c.userId === chosen;
          const name = c.name || 'Thành viên';
          return (
            <ListItem
              key={c.userId}
              description={index === 0 ? 'Vào phòng lâu nhất' : undefined}
              divider={index < candidates.length - 1}
              emphasis="title"
              label={name}
              labelNumberOfLines={2}
              leading={
                // Trang trí: tên đã nằm ở nhãn hàng ⇒ ẩn avatar khỏi trình đọc màn hình (không đọc tên hai lần).
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Avatar
                    name={name}
                    size="sm"
                    source={c.avatarUrl ? { uri: c.avatarUrl } : undefined}
                  />
                </View>
              }
              selected={selected}
              trailing={
                selected ? (
                  <Icon color="fg-brand" label="Đang chọn" name="checkmark-circle" />
                ) : undefined
              }
              onPress={() => setPicked(c.userId)}
            />
          );
        })}
      </SheetList>
    </BottomSheet>
  );
}
