import { useState } from 'react';

import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { Icon } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';

import {
  inheritLabel,
  MUTE_DURATIONS,
  mutedUntilFromHours,
  NOTIFY_CHOICE_LABEL,
  type NotifyChoice,
} from './notify-mode';

export interface NotifyModeSheetProps {
  /** Chế độ đang áp dụng ở NƠI NÀY (không phải giá trị hiệu lực): `INHERIT` = chưa đặt riêng. */
  current: NotifyChoice;
  /** Giá trị mà `INHERIT` sẽ kế thừa THỰC TẾ (tài khoản → nhóm) — hiện "Theo mặc định (Mọi tin)". */
  inherited?: Exclude<NotifyChoice, 'INHERIT'>;
  onClose: () => void;
  /** `mutedUntil` chỉ có nghĩa với `MUTED` + `supportsDuration`; mọi lựa chọn khác gửi `null` (xoá hạn tắt tiếng cũ). */
  onSelect: (choice: NotifyChoice, mutedUntil: string | null) => void;
  /** Có `MENTIONS`? Tin 1-1 chỉ có Mọi tin / Tắt (không có "nhắc tên"). Mặc định `true`. */
  showMentions?: boolean;
  /** Tắt tiếng có chọn thời lượng (chỉ hội thoại có `mutedUntil`). Mặc định `false`: chỉ "Tắt tiếng". */
  supportsDuration?: boolean;
  title: string;
  visible: boolean;
}

/**
 * Chọn chế độ thông báo — DÙNG CHUNG cho cài đặt nhóm làm việc, kênh và hội thoại (p1-07 `app.md` §3): Mọi tin ·
 * Chỉ nhắc tên & luồng · Tắt tiếng (+ thời lượng) · Theo mặc định (giá trị kế thừa thực tế).
 *
 * Thuần trình bày: nơi gọi tự đổi `NotifyChoice` ↔ enum BE (`notify-mode.ts`) và tự gọi API.
 * "Tắt tiếng vẫn giữ mục nhắc đến bạn trong Hoạt động" — nói rõ để người dùng không tưởng sẽ mất nhắc tên.
 */
export function NotifyModeSheet({
  current,
  inherited,
  onClose,
  onSelect,
  showMentions = true,
  supportsDuration = false,
  title,
  visible,
}: NotifyModeSheetProps) {
  const [pickingDuration, setPickingDuration] = useState(false);

  const close = () => {
    setPickingDuration(false);
    onClose();
  };
  const choose = (choice: NotifyChoice, mutedUntil: string | null = null) => {
    onSelect(choice, mutedUntil);
    close();
  };

  const choices: NotifyChoice[] = showMentions
    ? ['ALL', 'MENTIONS', 'MUTED', 'INHERIT']
    : ['ALL', 'MUTED', 'INHERIT'];

  return (
    <BottomSheet
      description={pickingDuration ? undefined : 'Tắt tiếng vẫn giữ mục nhắc đến bạn trong Hoạt động.'}
      padded={false}
      title={pickingDuration ? 'Tắt tiếng trong bao lâu?' : title}
      visible={visible}
      onClose={close}
    >
      {/* `SheetList`: tấm `padded={false}` + `ListItem` trần thì hàng dính sát mép tấm — `ListItem` không tự có lề. Hàng đang chọn có nền
          tint chạy trong lề 16 (đúng bản vẽ danh sách chọn), giống `SelectSheet`. */}
      <SheetList className="pb-md">
        {pickingDuration
          ? MUTE_DURATIONS.map((option, index) => (
              <ListItem
                key={option.label}
                divider={index < MUTE_DURATIONS.length - 1}
                emphasis="title"
                label={option.label}
                onPress={() => choose('MUTED', mutedUntilFromHours(option.hours))}
              />
            ))
          : choices.map((choice, index) => (
              <ListItem
                key={choice}
                divider={index < choices.length - 1 && current !== choice}
                emphasis="title"
                label={choice === 'INHERIT' ? inheritLabel(inherited) : NOTIFY_CHOICE_LABEL[choice]}
                selected={current === choice}
                trailing={
                  current === choice ? (
                    <Icon color="fg-brand" label="Đang chọn" name="checkmark-circle" size="sm" />
                  ) : undefined
                }
                onPress={() =>
                  choice === 'MUTED' && supportsDuration ? setPickingDuration(true) : choose(choice)
                }
              />
            ))}
      </SheetList>
    </BottomSheet>
  );
}
