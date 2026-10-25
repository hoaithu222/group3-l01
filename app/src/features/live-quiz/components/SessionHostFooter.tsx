import { Text } from 'react-native';

import { Button } from '@/shared/ui/button';
import { BottomActionBar } from '@/shared/ui/navigation';

import type { LiveQuizCommand } from '../api/live-quiz.api';
import type { LiveQuizSnapshot } from '../api/live-quiz.types';

interface SessionHostFooterProps {
  data: LiveQuizSnapshot;
  pending: boolean;
  onRun: (command: LiveQuizCommand) => void;
}

/**
 * Thanh đáy của CHỦ PHÒNG: MỘT nút chính duy nhất theo giai đoạn (Bắt đầu → Kết thúc câu → Câu tiếp theo/Xem kết quả), cỡ lớn
 * tông cam của chế độ. "Huỷ phòng"/"Kết thúc phiên" là thao tác phá huỷ nên nằm ở menu "⋯" (xem `SessionScreen`).
 *
 * ⛔ `BottomActionBar`, không phải `<View>` trần: `Screen` KHÔNG đệm vùng an toàn cho khe `footer`, nên khối nút trần đè lên
 * vạch gạt ngang. ⚠️ Nơi gọi chỉ dựng component này khi còn bước kế tiếp (phase `ENDED` không có) — dựng rồi trả `null` thì
 * `Screen` vẫn chừa chỗ cho một thanh rỗng.
 */
export function SessionHostFooter({ data, onRun, pending }: SessionHostFooterProps) {
  const lastQuestion = data.currentIndex + 1 >= data.total;
  const empty = data.players.length === 0;

  return (
    <BottomActionBar contentClassName="tablet:max-w-none">
      {data.phase === 'LOBBY' ? (
        <>
          <Text accessibilityLiveRegion="polite" className="text-center text-caption-lg text-fg-2">
            {empty
              ? 'Chờ ít nhất một người chơi vào phòng để bắt đầu.'
              : `${String(data.players.length)} người đã sẵn sàng.`}
          </Text>
          <Button
            disabled={empty}
            fullWidth
            iconLeft="play"
            label="Bắt đầu"
            loading={pending}
            size="lg"
            variant="warning"
            onPress={() => onRun('start')}
          />
        </>
      ) : null}
      {data.phase === 'QUESTION' ? (
        <Button
          fullWidth
          label="Kết thúc câu"
          loading={pending}
          size="lg"
          variant="warning"
          onPress={() => onRun('next')}
        />
      ) : null}
      {data.phase === 'REVEAL' ? (
        <Button
          fullWidth
          iconRight="arrow-right"
          label={lastQuestion ? 'Xem kết quả' : 'Câu tiếp theo'}
          loading={pending}
          size="lg"
          variant="warning"
          onPress={() => onRun(lastQuestion ? 'end' : 'next')}
        />
      ) : null}
    </BottomActionBar>
  );
}
