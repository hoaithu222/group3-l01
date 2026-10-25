import type { ConnectionQuality } from '../../media/meeting-media.types';

/**
 * Chữ báo chất lượng mạng của CHÍNH MÌNH. `null` = tốt/không rõ ⇒ không hiện gì: cảnh báo chỉ đáng thấy khi có việc, thanh tiêu đề luôn
 * hiện "Mạng tốt" thì thành nhiễu và người dùng học cách phớt lờ luôn cả lúc nó báo thật.
 */
export function networkQualityLabel(quality: ConnectionQuality): string | null {
  if (quality === 'poor') return 'Mạng yếu';
  if (quality === 'lost') return 'Mạng mất';
  return null;
}
