import { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Toggle } from '@/shared/ui/toggle';
import { hapticTap } from '@/shared/utils/haptics';

import type { VoiceJoinPrefs } from '../store/voice-join.prefs';

export interface JoinOptionsProps {
  /** Kênh cho phép video (`voiceSettings.allowVideo`) — tắt thì không có công tắc camera. */
  allowVideo: boolean;
  /** Khoá cả hai nút (mất mạng, phòng đầy, bị mời ra…). ⚠️ Kèm `hint` khi lý do chưa được nói ở chỗ khác — không chỉ làm mờ nút. */
  disabled?: boolean;
  /** Dòng chữ dưới nút nói lý do khoá. */
  hint?: string | null;
  loading: boolean;
  onJoin: (options: VoiceJoinPrefs) => void;
}

/**
 * "Tham gia" · "Tham gia để nghe" · công tắc Camera (app.md §2). Chạm kênh chỉ mở preview; CHỌN ở đây mới là ý định vào phòng.
 * "Để nghe" vào với mic tắt và KHÔNG xin quyền mic (VR-02); camera mặc định tắt.
 */
export function JoinOptions({ allowVideo, disabled: blocked = false, hint = null, loading, onJoin }: JoinOptionsProps) {
  const [camera, setCamera] = useState(false);
  const disabled = loading || blocked;

  return (
    <View className="gap-sm">
      {allowVideo ? (
        <Toggle description="Mặc định tắt — bạn có thể bật sau khi vào phòng." label="Bật camera khi vào" value={camera} onChange={setCamera} />
      ) : null}
      {/* Icon cho hai cách vào (micro · loa) — hai nút cùng cỡ, icon giúp phân biệt nhanh "nói được" với "chỉ nghe"; nhãn chữ vẫn nói rõ.
          Rung nhẹ TRƯỚC khi vào (kết nối phòng mất một lúc) — phản hồi tức thì của cú chạm. */}
      <Button
        disabled={disabled}
        fullWidth
        iconLeft="mic-01"
        label="Tham gia"
        loading={loading}
        onPress={() => {
          hapticTap();
          onJoin({ camera: allowVideo && camera, listenOnly: false });
        }}
      />
      <Button
        disabled={disabled}
        fullWidth
        iconLeft="audio"
        label="Tham gia để nghe"
        variant="neutral-secondary"
        onPress={() => {
          hapticTap();
          onJoin({ camera: false, listenOnly: true });
        }}
      />
      {hint ? <Text className="text-center text-body-md text-fg-2">{hint}</Text> : null}
    </View>
  );
}
