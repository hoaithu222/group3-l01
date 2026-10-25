import dayjs from 'dayjs';
import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { serverNowMs } from '@/shell/store/slices/clock/clock.store';

import { checkWhen, combineDateAndTime, formatWhen, type WhenWindow } from '../../utils/local-time';
import { buildPresets, type WhenPresetKind } from '../../utils/when-presets';
import { DateTimeFields } from './DateTimeFields';

export interface WhenPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  kind: WhenPresetKind;
  /** Cửa sổ hợp lệ theo `limits.*` (cách ≥ `minLeadMs`, không quá `maxMs`). */
  window: WhenWindow;
  /** Chủ ngữ của câu lỗi: "Thời điểm gửi" / "Thời điểm nhắc". */
  subject: string;
  /** Đầu câu tóm tắt: "Gửi lúc" / "Nhắc lúc". */
  summaryPrefix: string;
  submitLabel: string;
  pending: boolean;
  /** Lỗi từ BE thuộc ô thời gian (`SCHED_001`/`REMIND_001`) — hiện cùng lỗi kiểm ở client. */
  timeError?: string;
  /** Lỗi khác từ BE (`SCHED_002`, `MSG_004`, `REMIND_002`…) — khối cảnh báo trong tấm. */
  otherError?: string;
  /** Nút kèm khối cảnh báo (vd "Xem tin đã hẹn" cho `SCHED_002`). */
  otherAction?: ReactNode;
  /** Khối phía trên (xem trước nội dung). */
  header?: ReactNode;
  onSubmit: (at: Date) => void;
}

const CUSTOM = 'custom';

/**
 * Tấm "Chọn thời gian" dùng chung cho hẹn giờ gửi, nhắc lại tin, đổi giờ và gửi lại (p7-04 app.md §3 `ScheduleSendSheet`/`RemindMeSheet`): gợi ý nhanh (mốc đã qua/chưa đủ khoảng
 * cách tối thiểu bị BỎ) + "Chọn thời gian" (ngày + giờ theo giờ MÁY). Dưới ô chọn luôn có câu tóm tắt "Gửi lúc 20:00 Thứ hai 21/09 (giờ máy)" để người dùng biết CHÍNH XÁC mình đã chọn gì.
 *
 * State (mốc đã chọn, ngày/giờ tự chọn) nằm ở tấm và reset nhờ `key` do nơi gọi đổi mỗi lần mở — như `RequestConfirmSheet`. Kiểm cửa sổ ở client trước khi gọi API
 * (`checkWhen`, cùng luật `isWithinWindow` của BE) nên lỗi hiện tại chỗ, không tốn một lượt mạng; BE vẫn kiểm lại (giờ máy chủ). Ngoại tuyến ⇒ nút tắt "Kết nối lại để gửi".
 */
export function WhenPickerSheet({
  visible,
  onClose,
  title,
  description,
  kind,
  window,
  subject,
  summaryPrefix,
  submitLabel,
  pending,
  timeError,
  otherError,
  otherAction,
  header,
  onSubmit,
}: WhenPickerSheetProps) {
  const offline = useConnectionState() === 'offline';
  const [nowMs] = useState(serverNowMs);
  const [presets] = useState(() => buildPresets(kind, nowMs, window));
  const [choice, setChoice] = useState<string>(presets[0]?.key ?? CUSTOM);
  const [date, setDate] = useState<Date | null>(null);
  const [time, setTime] = useState('');
  const [localError, setLocalError] = useState<string>();

  const at =
    choice === CUSTOM
      ? date && time !== ''
        ? combineDateAndTime(date, time)
        : null
      : (presets.find((p) => p.key === choice)?.at ?? null);

  const submit = () => {
    if (!at) {
      setLocalError('Hãy chọn ngày và giờ');
      return;
    }
    const message = checkWhen(at, serverNowMs(), window, subject);
    setLocalError(message ?? undefined);
    if (!message) onSubmit(at);
  };

  return (
    <BottomSheet
      // Lỗi BE không thuộc ô thời gian ghim dưới tiêu đề (khe `alert`) — cùng nút kèm theo ("Xem tin đã hẹn").
      alert={
        otherError ? (
          <Alert actions={otherAction} description={otherError} tone="error" />
        ) : undefined
      }
      description={description}
      dismissOnBackdrop={!pending}
      footer={
        <Button
          disabled={offline}
          fullWidth
          label={offline ? 'Kết nối lại để gửi' : submitLabel}
          loading={pending}
          onPress={submit}
        />
      }
      scrollable
      title={title}
      visible={visible}
      onClose={onClose}
    >
      {/* ⛔ Không `pb-*` cuối thân: vùng `footer` tự cách nội dung 12dp. */}
      <View className="gap-md">
        {header}
        <View
          accessibilityLabel="Thời điểm"
          accessibilityRole="radiogroup"
          className="flex-row flex-wrap gap-xs"
        >
          {presets.map((preset) => (
            <Chip
              key={preset.key}
              label={preset.label}
              role="radio"
              selected={choice === preset.key}
              onPress={() => setChoice(preset.key)}
            />
          ))}
          <Chip
            label="Chọn thời gian"
            role="radio"
            selected={choice === CUSTOM}
            onPress={() => setChoice(CUSTOM)}
          />
        </View>
        {choice === CUSTOM ? (
          <DateTimeFields
            date={date}
            maxDate={dayjs(nowMs).add(window.maxMs, 'millisecond').toDate()}
            minDate={new Date(nowMs)}
            time={time}
            timeError={localError ?? timeError}
            onChangeDate={setDate}
            onChangeTime={setTime}
          />
        ) : null}
        {at ? (
          <Text accessibilityLiveRegion="polite" className="text-body-md text-fg-2">
            {`${summaryPrefix} ${formatWhen(at)} (giờ máy)`}
          </Text>
        ) : null}
        {choice !== CUSTOM && (localError ?? timeError) ? (
          <Text accessibilityLiveRegion="polite" className="text-caption-sm text-error">
            {localError ?? timeError}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}
