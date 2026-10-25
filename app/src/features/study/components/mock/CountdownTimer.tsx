import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Text, View, type TextStyle } from 'react-native';
import { tv } from 'tailwind-variants';

import type { ThemeColorKey } from '@/shared/theme';
import { Icon } from '@/shared/ui/icon';
import { twMergeConfig } from '@/shared/utils/style/cn';

import { formatTimeLeft, timeLeftMs, useServerClock } from '../../hooks/useServerClock';
import {
  timerPhase,
  timerPhaseLabel,
  timerRatio,
  type TimerPhase,
} from '../../utils/mock-timer-utils';
import { RingGauge, type RingTone } from './RingGauge';

export interface CountdownTimerProps {
  /** Tổng thời lượng lượt thi (giây) — để vòng biết "đầy" là bao nhiêu. */
  durationSec: number;
  expiresAt: string;
  /** Gọi MỘT lần khi về 0. Server vẫn là bên quyết định (BE nhận đáp án tới `expiresAt + 5 s`). */
  onExpire: () => void;
  /** `serverNow` của response gần nhất — đổi ⇒ đồng hồ tính lại độ lệch (`useServerClock`). */
  serverNow: string;
}

/** Bốn giai đoạn = bốn tông: `info` (bản sắc Thi thử) → `warning` (dưới 5 phút) → `error` (dưới 1 phút / hết giờ). */
const timer = tv(
  {
    slots: {
      root: 'flex-row items-center gap-sm rounded-md border-hairline px-sm py-xs',
      time: 'text-header-md font-semibold',
      note: 'text-label-md',
    },
    variants: {
      phase: {
        normal: {
          root: 'border-border-info-subtle bg-surface-info',
          time: 'text-fg-1',
          note: 'text-fg-2',
        },
        warn: {
          root: 'border-border-warning-subtle bg-surface-warning',
          time: 'text-fg-1',
          note: 'font-semibold text-fg-1',
        },
        critical: {
          root: 'border-border-error-subtle bg-surface-error',
          time: 'text-error',
          note: 'font-semibold text-error',
        },
        expired: {
          root: 'border-border-error-subtle bg-surface-error',
          time: 'text-error',
          note: 'font-semibold text-error',
        },
      },
    },
    defaultVariants: { phase: 'normal' },
  },
  { twMergeConfig },
);

const RING_TONE: Record<TimerPhase, RingTone> = {
  critical: 'error',
  expired: 'error',
  normal: 'info',
  warn: 'warning',
};
const ICON_COLOR: Record<TimerPhase, ThemeColorKey> = {
  critical: 'error',
  expired: 'error',
  normal: 'info',
  warn: 'warning',
};

/** Số đổi mỗi giây: `tabular-nums` giữ bề rộng chữ số bằng nhau để mm:ss không rung qua lại. */
const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

/**
 * Đồng hồ làm bài `mm:ss` theo giờ SERVER (app.md p4-02 §2 `CountdownTimer`, §7), dạng VÒNG còn lại + số + dòng chữ.
 *
 * ⚠️ Không chỉ đổi màu: dưới 5 phút đổi tông + icon cảnh báo + dòng chữ "Còn dưới 5 phút", dưới 1 phút là "Còn dưới 1
 * phút", và `announceForAccessibility` đọc MỘT lần ở mỗi mốc — người dùng trình đọc màn hình không nhìn thấy số đếm ngược.
 * Đọc mỗi giây thì thành tiếng ồn, nên nhãn của khối thời gian KHÔNG nằm trong vùng live.
 *
 * ⚠️ Cách tính giờ giữ nguyên (`useServerClock` theo `expiresAt`): vòng chỉ là hình của `left / durationSec`.
 */
export function CountdownTimer({
  durationSec,
  expiresAt,
  onExpire,
  serverNow,
}: CountdownTimerProps) {
  const { nowMs } = useServerClock(serverNow);
  const left = timeLeftMs(expiresAt, nowMs);
  const phase = timerPhase(left);
  const fired = useRef(false);

  // Mỗi GIAI ĐOẠN chỉ đọc MỘT lần ('normal' → 'warn' → 'critical'), không phải mỗi giây. Vào thẳng 'critical' (mở lại lượt
  // dở còn < 1 phút) thì chỉ đọc mốc 1 phút — đọc cả mốc 5 phút là nhắc một điều đã lỗi thời.
  useEffect(() => {
    if (phase === 'critical') AccessibilityInfo.announceForAccessibility('Còn dưới 1 phút');
    else if (phase === 'warn') AccessibilityInfo.announceForAccessibility('Còn dưới 5 phút');
  }, [phase]);

  useEffect(() => {
    if (phase !== 'expired' || fired.current) return;
    fired.current = true;
    onExpire();
  }, [onExpire, phase]);

  const styles = timer({ phase });
  const time = formatTimeLeft(left);
  const note = timerPhaseLabel(phase);
  return (
    <View
      accessibilityLabel={`Thời gian còn lại ${time}${note ? `. ${note}` : ''}`}
      accessibilityRole="timer"
      accessible
      className={styles.root()}
    >
      <RingGauge progress={timerRatio(left, durationSec * 1000)} size={44} tone={RING_TONE[phase]}>
        <Icon
          color={ICON_COLOR[phase]}
          name={phase === 'normal' ? 'timer' : 'alert-warning'}
          size={20}
        />
      </RingGauge>
      <View className="flex-1">
        <Text className={styles.time()} maxFontSizeMultiplier={1.3} style={TABULAR}>
          {time}
        </Text>
        <Text className={styles.note()}>{note ?? 'Thời gian còn lại'}</Text>
      </View>
    </View>
  );
}
