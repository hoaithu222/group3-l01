import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Stepper } from '@/shared/ui/stepper';
import { Toggle } from '@/shared/ui/toggle';
import { useAuthStore } from '@/shell/store/slices/auth';

import { pomodoroKeys } from '../api/pomodoro.keys';
import { pomodoroService } from '../api/pomodoro.service';
import type { PomodoroConfig, PomodoroSnapshot } from '../api/pomodoro.types';
import { usePomodoroLimits, type LimitRange } from '../hooks/usePomodoroLimits';
import { applySnapshot } from '../queries/pomodoro.cache';
import { pomodoroErrorMessage, isStaleCommand, pomodoroErrorCode } from '../utils/pomodoro-errors';

export interface PomodoroConfigSheetProps {
  channelId: string;
  offline: boolean;
  onClose: () => void;
  snapshot: PomodoroSnapshot;
  visible: boolean;
}

function StepperRow(props: {
  label: string;
  onChange: (value: number) => void;
  range: LimitRange;
  step: number;
  value: number;
}) {
  const { label, onChange, range, step, value } = props;
  return (
    <View className="flex-row items-center justify-between gap-sm">
      <Text className="flex-1 text-body-md text-fg-1">{label}</Text>
      <Stepper
        accessibilityLabel={label}
        max={range.max}
        min={range.min}
        step={step}
        value={value}
        onChange={onChange}
      />
    </View>
  );
}

/**
 * Cấu hình chu kỳ (app.md p5-02 §3 "Config sheet"): 4 bộ tăng/giảm + công tắc tự chuyển giai đoạn, khoảng lấy từ `capabilities.limits.pomodoro`.
 * Chỉ đổi được khi phiên CHƯA bắt đầu (WAITING) hoặc kênh chưa có phiên (lưu làm mặc định của kênh — người có `manage`); phiên đã chạy ⇒ `CALL_POMO_003`
 * hiện ngay trong tấm. Nháp nằm ở `draft` (chỉ phần người dùng đã sửa) nên mở lại luôn hiện cấu hình MỚI NHẤT của server mà không cần effect reset.
 */
export function PomodoroConfigSheet({
  channelId,
  offline,
  onClose,
  snapshot,
  visible,
}: PomodoroConfigSheetProps) {
  const queryClient = useQueryClient();
  const myId = useAuthStore((state) => state.user?.id);
  const limits = usePomodoroLimits();
  const [draft, setDraft] = useState<Partial<PomodoroConfig>>({});
  const config: PomodoroConfig = { ...snapshot.config, ...draft };
  const set = <K extends keyof PomodoroConfig>(key: K, value: PomodoroConfig[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const save = useMutation({
    mutationFn: () =>
      pomodoroService.updateConfig(channelId, {
        ...config,
        expectedVersion: snapshot.sessionId ? snapshot.version : undefined,
      }),
    onError: (error) => {
      // Phiên vừa đổi (đã bắt đầu / version lệch): tải lại để sheet và nút phản ánh đúng.
      if (isStaleCommand(error) || pomodoroErrorCode(error) === 'CALL_POMO_003') {
        void queryClient.invalidateQueries({ queryKey: pomodoroKeys.snapshot(channelId) });
      }
    },
    onSuccess: (next) => {
      applySnapshot(queryClient, channelId, next, myId);
      close();
    },
  });

  function close(): void {
    setDraft({});
    save.reset();
    onClose();
  }

  return (
    <BottomSheet
      // Lỗi đứng yên dưới tiêu đề (`Alert` có icon + tông): ở cuối thân cuộn thì khuất sau 4 bộ tăng/giảm + 2 công tắc.
      alert={
        save.isError ? (
          <Alert
            description={pomodoroErrorMessage(save.error, 'Không lưu được cấu hình, thử lại sau')}
            tone="error"
          />
        ) : undefined
      }
      description="Áp dụng cho phiên này. Chỉ đổi được khi phiên chưa bắt đầu."
      dismissOnBackdrop={!save.isPending}
      footer={
        <Button
          disabled={offline}
          fullWidth
          label={offline ? 'Kết nối lại để lưu' : 'Lưu cấu hình'}
          loading={save.isPending}
          onPress={() => save.mutate()}
        />
      }
      scrollable
      title="Cấu hình Pomodoro"
      visible={visible}
      onClose={close}
    >
      <View className="gap-md py-xs">
        <StepperRow
          label="Tập trung (phút)"
          range={limits.focusMinutes}
          step={5}
          value={config.focusMinutes}
          onChange={(v) => set('focusMinutes', v)}
        />
        <StepperRow
          label="Nghỉ ngắn (phút)"
          range={limits.shortBreakMinutes}
          step={1}
          value={config.shortBreakMinutes}
          onChange={(v) => set('shortBreakMinutes', v)}
        />
        <StepperRow
          label="Nghỉ dài (phút)"
          range={limits.longBreakMinutes}
          step={5}
          value={config.longBreakMinutes}
          onChange={(v) => set('longBreakMinutes', v)}
        />
        <StepperRow
          label="Số vòng tới lần nghỉ dài"
          range={limits.cyclesBeforeLongBreak}
          step={1}
          value={config.cyclesBeforeLongBreak}
          onChange={(v) => set('cyclesBeforeLongBreak', v)}
        />
        <Toggle
          description="Hết giờ tự sang giai đoạn kế tiếp, không cần chủ phòng bấm"
          label="Tự chuyển giai đoạn"
          value={config.autoAdvance}
          onChange={(v) => set('autoAdvance', v)}
        />
        <Toggle
          description="Mặc định chủ phòng cũng tắt mic khi tập trung như mọi người"
          label="Chủ phòng được nói khi tập trung"
          value={config.hostCanSpeakInFocus}
          onChange={(v) => set('hostCanSpeakInFocus', v)}
        />
      </View>
    </BottomSheet>
  );
}
