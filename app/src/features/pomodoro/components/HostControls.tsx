import { useState } from 'react';
import { View } from 'react-native';

import { ActionMenu } from '@/shared/ui/action-menu';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/modal';
import { hapticTap } from '@/shared/utils/haptics';

import type { PomodoroCommandKind, PomodoroMyActions, PomodoroPhase } from '../api/pomodoro.types';

export interface HostControlsProps {
  actions: PomodoroMyActions | undefined;
  /** Lệnh đang chạy — nút đó quay riêng, mọi nút khác khoá (không gửi hai lệnh chồng nhau). */
  busyKind: PomodoroCommandKind | null;
  /** Ngoại tuyến: khoá mọi lệnh. */
  disabled: boolean;
  /** Mở tấm cấu hình — chỉ hiện khi server nói `canConfigure` (WAITING, tôi là chủ phòng). Vắng ⇒ không có nút. */
  onConfigure?: () => void;
  onRun: (kind: PomodoroCommandKind) => void;
  phase: PomodoroPhase;
}

type Confirm = 'end' | 'skip';

/**
 * Điều khiển của chủ phòng (app.md p5-02 §3 "Host"): Bắt đầu · Tạm dừng · Tiếp tục · Bỏ qua · Kết thúc · Cấu hình. Nút nào hiện do SERVER nói qua
 * `myActions` (client không tự suy vai trò); người không có nút nào thì không thấy khối này. Bỏ qua vòng TẬP TRUNG và Kết thúc hỏi xác nhận
 * ("Vòng này sẽ không được tính" — PM-04); bỏ qua giờ nghỉ thì không cần hỏi. Lỗi 409 do `usePomodoroCommand` toast + tải lại.
 *
 * ⚠️ Bố cục: MỘT hàng — nút chính của giai đoạn (Bắt đầu / Tiếp tục / Tạm dừng) + menu "⋯" (`ActionMenu` chung) gom thao tác phụ và
 * PHÁ HUỶ (Cấu hình, Bỏ qua, Kết thúc phiên — hàng đỏ cuối menu). Trước đây là tới 5 nút xếp dọc/ngang cấp, "Kết thúc" đỏ nằm sát
 * "Bỏ qua", cạnh nút "Rời" đỏ ở thanh đáy.
 */
export function HostControls({
  actions,
  busyKind,
  disabled,
  onConfigure,
  onRun,
  phase,
}: HostControlsProps) {
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  if (!actions) return null;
  const { canConfigure, canEnd, canPause, canResume, canSkip, canStart } = actions;
  const showConfigure = canConfigure && onConfigure !== undefined;
  if (!(canStart || canPause || canResume || canSkip || canEnd || showConfigure)) return null;
  const locked = disabled || busyKind !== null;
  // Rung "chạm" cho MỌI lệnh của chủ phòng (bắt đầu · tạm dừng · tiếp tục · bỏ qua · kết thúc) — hành động chính của phòng, gửi qua
  // mạng nên phản hồi tức thì ở máy là thứ duy nhất người bấm cảm nhận được ngay. Gọi TRƯỚC `onRun` (lệnh có thể trễ).
  const send = (kind: PomodoroCommandKind) => {
    hapticTap();
    onRun(kind);
  };
  const run = (kind: PomodoroCommandKind) => () => send(kind);
  const confirmRun = (kind: PomodoroCommandKind) => {
    setConfirm(null);
    send(kind);
  };

  return (
    <View
      accessibilityLabel="Điều khiển của chủ phòng"
      className="flex-row items-center justify-end gap-xs"
    >
      <View className="flex-1">
        {canStart ? (
          <Button
            disabled={locked}
            fullWidth
            iconLeft="play"
            label="Bắt đầu"
            loading={busyKind === 'start'}
            onPress={run('start')}
          />
        ) : null}
        {canResume ? (
          <Button
            disabled={locked}
            fullWidth
            iconLeft="play"
            label="Tiếp tục"
            loading={busyKind === 'resume'}
            onPress={run('resume')}
          />
        ) : null}
        {canPause ? (
          <Button
            disabled={locked}
            fullWidth
            iconLeft="pause"
            label="Tạm dừng"
            loading={busyKind === 'pause'}
            variant="neutral-secondary"
            onPress={run('pause')}
          />
        ) : null}
      </View>
      <ActionMenu
        accessibilityLabel="Tuỳ chọn của chủ phòng"
        items={[
          {
            disabled,
            icon: 'setting',
            key: 'configure',
            label: 'Cấu hình',
            hidden: !showConfigure,
            onPress: () => onConfigure?.(),
          },
          {
            disabled: locked,
            icon: 'arrow-right',
            key: 'skip',
            label: phase === 'FOCUS' ? 'Bỏ qua vòng' : 'Bỏ qua nghỉ',
            hidden: !canSkip,
            onPress: phase === 'FOCUS' ? () => setConfirm('skip') : run('skip'),
          },
          {
            disabled: locked,
            icon: 'cancel',
            key: 'end',
            label: 'Kết thúc phiên',
            hidden: !canEnd,
            tone: 'danger',
            onPress: () => setConfirm('end'),
          },
        ]}
        title="Phòng học"
      />

      <Dialog
        description="Vòng này sẽ không được tính vào số vòng hoàn thành."
        primaryAction={{ label: 'Vẫn bỏ qua', onPress: () => confirmRun('skip') }}
        secondaryAction={{ label: 'Không', onPress: () => setConfirm(null) }}
        title="Bỏ qua vòng tập trung?"
        variant="warning"
        visible={confirm === 'skip'}
        onClose={() => setConfirm(null)}
      />
      <Dialog
        description="Phiên sẽ kết thúc với mọi người trong phòng."
        primaryAction={{ label: 'Kết thúc phiên', onPress: () => confirmRun('end') }}
        secondaryAction={{ label: 'Không', onPress: () => setConfirm(null) }}
        title="Kết thúc phiên?"
        variant="warning"
        visible={confirm === 'end'}
        onClose={() => setConfirm(null)}
      />
    </View>
  );
}
