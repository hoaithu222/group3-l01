import { useEffect, useState } from 'react';
import { Pressable, Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import { useAssetUrl } from '@/core/uploads/use-asset-url';
import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import type { MessageAttachment } from '../../api/chat.types';
import { useVoicePlayerStore } from '../../store/voice-player.store';

const SPEEDS = [1, 1.5, 2] as const;
const BAR_COUNT = 32;
/** Mỗi lần vuốt lên/xuống trên thanh tua (trình đọc màn hình) nhảy bấy nhiêu giây. */
const SEEK_STEP_SECONDS = 5;
const SEEK_ACTIONS = [
  { label: 'Tua tới 5 giây', name: 'increment' },
  { label: 'Tua lùi 5 giây', name: 'decrement' },
] as const;

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm}:${ss.toString().padStart(2, '0')}`;
}

/** Trải mảng waveform gốc (≤ 64 mẫu) về đúng `BAR_COUNT` cột hiển thị. */
function sampleBars(waveform: number[]): number[] {
  if (waveform.length === 0) return new Array<number>(BAR_COUNT).fill(20);
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const index = Math.floor((i / BAR_COUNT) * waveform.length);
    return waveform[index] ?? 0;
  });
}

/**
 * ⛔ KHÔNG ghép chuỗi class động (`` `bg-${tint}` ``) — NativeWind chỉ sinh CSS
 * cho chuỗi TĨNH đọc được lúc build; biến nội suy runtime bị bỏ qua ÂM THẦM
 * (mất màu, không lỗi nào báo, `check:classes` bắt đúng ca này). Trả nguyên
 * văn theo từng nhánh.
 */
function barColorClass(filled: boolean, tone: 'default' | 'onAction'): string {
  if (tone === 'onAction') return filled ? 'bg-action-fg' : 'bg-action-tint';
  return filled ? 'bg-fg-brand' : 'bg-bg-3';
}
function textToneClass(tone: 'default' | 'onAction'): string {
  return tone === 'onAction' ? 'text-action-fg' : 'text-fg-2';
}
/**
 * Nút phát trước đây LUÔN `bg-bg-2` (gần trắng) bất kể tông — trên bong bóng CỦA MÌNH (`onAction`, nền
 * `bg-action-base` tối ở light mode/sáng ở dark mode), icon `action-fg` (trắng ở light, gần đen ở dark) vẽ
 * lên đúng một vòng tròn `bg-bg-2` KHÔNG ĂN KHỚP màu bong bóng ⇒ trắng-trên-trắng-gần-trắng (light) / tối-trên-tối
 * (dark), gần như vô hình. `onAction` bỏ nền vòng tròn để icon nằm THẲNG lên bong bóng, giống cách `barColorClass`/
 * `textToneClass` đã làm với vạch waveform và chữ.
 */
function playButtonBgClass(tone: 'default' | 'onAction'): string {
  return tone === 'onAction' ? '' : 'bg-bg-2';
}

export interface VoiceNotePlayerProps {
  attachment: MessageAttachment;
  tone: 'default' | 'onAction';
}

/** Phát/dừng, waveform kéo được, thời lượng, tốc độ 1×/1.5×/2× (app.md §3). */
export function VoiceNotePlayer({ attachment, tone }: VoiceNotePlayerProps) {
  const { data } = useAssetUrl(attachment.assetId);
  const player = useAudioPlayer(data ? { uri: data.url } : null);
  const status = useAudioPlayerStatus(player);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [barsWidth, setBarsWidth] = useState(0);
  const playingAssetId = useVoicePlayerStore((s) => s.playingAssetId);
  const setPlayingAssetId = useVoicePlayerStore((s) => s.setPlaying);

  // "Một player phát tại một thời điểm" (app.md §5) — ai đó KHÁC vừa bấm phát
  // thì tự dừng mình. `player.pause()` đụng vào module NATIVE — thuộc "đồng bộ
  // với hệ thống ngoài React", đúng việc của `useEffect`, KHÔNG được gọi thẳng
  // lúc render (React Compiler cấm side-effect trong thân render thuần).
  useEffect(() => {
    if (playingAssetId !== attachment.assetId && status.playing) player.pause();
  }, [playingAssetId, attachment.assetId, status.playing, player]);

  const bars = sampleBars(attachment.waveform);
  const duration = status.duration || (attachment.durationMs ?? 0) / 1000;
  const progress = duration > 0 ? Math.min(1, status.currentTime / duration) : 0;

  const togglePlay = () => {
    if (status.playing) {
      player.pause();
    } else {
      setPlayingAssetId(attachment.assetId);
      player.play();
    }
  };

  const seekFromTap = (event: GestureResponderEvent) => {
    if (duration <= 0 || barsWidth <= 0) return;
    const ratio = Math.min(1, Math.max(0, event.nativeEvent.locationX / barsWidth));
    void player.seekTo(ratio * duration);
  };

  const seekBy = (deltaSeconds: number) => {
    if (duration <= 0) return;
    void player.seekTo(Math.min(duration, Math.max(0, status.currentTime + deltaSeconds)));
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1;
    setSpeed(next);
    player.setPlaybackRate(next);
  };

  return (
    <View className="w-60 flex-row items-center gap-xs">
      <Pressable
        accessibilityLabel={status.playing ? 'Dừng' : 'Phát tin nhắn thoại'}
        accessibilityRole="button"
        className={cn('h-9 w-9 items-center justify-center rounded-full', playButtonBgClass(tone))}
        hitSlop={4}
        onPress={togglePlay}
      >
        <Icon color={tone === 'onAction' ? 'action-fg' : 'fg-brand'} name={status.playing ? 'pause' : 'play'} size={18} />
      </Pressable>

      {/* Thanh tua: chạm vào vị trí là đủ cho người nhìn thấy, nhưng trình đọc màn hình không chỉ được toạ độ —
          nên là `adjustable` (vuốt lên/xuống tua ±5 giây) kèm giá trị "0:12 trên 0:45", thay vì một nút không nói gì. */}
      <Pressable
        accessibilityActions={SEEK_ACTIONS}
        accessibilityLabel="Vị trí phát tin nhắn thoại"
        accessibilityRole="adjustable"
        accessibilityValue={{
          max: Math.round(duration),
          min: 0,
          now: Math.round(status.currentTime),
          text: `${formatTime(status.currentTime)} trên ${formatTime(duration)}`,
        }}
        className="h-9 flex-1 flex-row items-end gap-3xs"
        hitSlop={4}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'increment') seekBy(SEEK_STEP_SECONDS);
          if (event.nativeEvent.actionName === 'decrement') seekBy(-SEEK_STEP_SECONDS);
        }}
        onLayout={(e: LayoutChangeEvent) => setBarsWidth(e.nativeEvent.layout.width)}
        onPress={seekFromTap}
      >
        {bars.map((value, i) => (
           
          <View
            key={i}
            className={cn('w-1 flex-1 rounded-full', barColorClass(i / BAR_COUNT <= progress, tone))}
            style={{ height: Math.max(3, (value / 100) * 28) }}
          />
        ))}
      </Pressable>

      {/* Nút chỉ có chữ 10px (~16dp cao): `min-h-11 min-w-11` cho hộp chạm thật 44dp — `hitSlop` 4 cũ chỉ ra ~24dp. */}
      <Pressable
        accessibilityLabel={`Tốc độ ${speed}x`}
        accessibilityRole="button"
        className="min-h-11 min-w-11 items-center justify-center"
        onPress={cycleSpeed}
      >
        <Text className={cn('text-label-xs', textToneClass(tone))}>{speed}×</Text>
      </Pressable>

      <Text className={cn('text-label-xs', textToneClass(tone))}>{formatTime(duration - status.currentTime)}</Text>
    </View>
  );
}
