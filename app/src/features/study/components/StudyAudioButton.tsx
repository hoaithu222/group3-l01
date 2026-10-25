import { Button, type ButtonSize } from '@/shared/ui/button';

import { useAssetAudio } from '../hooks/useAssetAudio';

export interface StudyAudioButtonProps {
  assetId: string;
  /** Nhãn hiện + đọc lên — mặc định "Nghe phát âm". Trình soạn có nhiều ô nên nên nói rõ của ô nào. */
  label?: string;
  /** Cỡ nút — mặc định `sm` (40dp + vùng chạm mở rộng của `Button`). Màn học có chỗ thì có thể dùng `md`. */
  size?: ButtonSize;
}

/**
 * Nút loa phát âm thanh của mục học (`expo-audio`) — bấm mới phát, bấm lại để dừng. Xem `useAssetAudio` về lý do xin URL
 * lúc bấm. `Button` của bộ chung lo vòng quay khi đang xin URL và khoá bấm chồng.
 *
 * Đang phát ⇒ nút đổi sang dáng ĐẶC (`primary`) + icon tạm dừng + chữ "Dừng": nhìn là biết âm thanh đang chạy, không phải nhớ
 * xem vừa bấm chưa. Màu chỉ hỗ trợ — icon và chữ đổi theo trạng thái nên vẫn rõ khi mù màu.
 */
export function StudyAudioButton({ assetId, label = 'Nghe phát âm', size = 'sm' }: StudyAudioButtonProps) {
  const audio = useAssetAudio(assetId);

  return (
    <Button
      accessibilityLabel={audio.playing ? `Dừng phát: ${label}` : label}
      iconLeft={audio.playing ? 'pause' : 'audio'}
      label={audio.playing ? 'Dừng' : label}
      loading={audio.loading}
      size={size}
      variant={audio.playing ? 'primary' : 'secondary'}
      onPress={() => void audio.toggle()}
    />
  );
}
