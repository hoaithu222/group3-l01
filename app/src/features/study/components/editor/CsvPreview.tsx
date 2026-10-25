import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Badge } from '@/shared/ui/badge';
import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

import type { CsvParseResult } from '../../utils/csv-import';
import { csvOutcome, describeDelimiter } from '../../utils/csv-import-summary';

const PREVIEW_ROWS = 5;
const ERROR_ROWS = 5;

export interface CsvPreviewProps {
  /** Số mục còn thêm được vào bộ (`itemsPerSetMax` − số mục hiện có) — để báo thẻ vượt sức chứa. */
  capacity: number;
  result: CsvParseResult;
}

/**
 * Bản XEM TRƯỚC của tấm nhập CSV: số thẻ hợp lệ / số dòng bị bỏ qua (huy hiệu CÓ CHỮ), bảng vài thẻ đầu (thuật ngữ | định nghĩa), cảnh
 * báo vượt sức chứa, và từng dòng lỗi kèm SỐ DÒNG ("Dòng 3: Thiếu thuật ngữ.") để người dùng sửa đúng chỗ trong bảng tính gốc. Người dùng
 * thấy chính xác cái gì SẼ được thêm trước khi bấm nút — và biết vì sao một dòng bị bỏ.
 */
export function CsvPreview({ capacity, result }: CsvPreviewProps) {
  const outcome = csvOutcome(result);
  const { cards, errors } = result;
  const shown = cards.slice(0, PREVIEW_ROWS);
  const hidden = cards.length - PREVIEW_ROWS;

  return (
    <View accessibilityLiveRegion="polite" className="gap-sm">
      <View className="flex-row flex-wrap items-center gap-xs">
        <Badge
          label={outcome.valid > 0 ? `${outcome.valid} thẻ hợp lệ` : 'Chưa có thẻ hợp lệ'}
          variant={outcome.valid > 0 ? 'success' : 'neutral'}
        />
        {outcome.skipped > 0 ? (
          <Badge label={`${outcome.skipped} dòng bị bỏ qua`} variant="error" />
        ) : null}
      </View>
      <Text className="text-caption-sm text-fg-2">
        Phân cách bằng {describeDelimiter(result.delimiter)}
        {result.hasHeader ? ' · đã bỏ dòng tiêu đề' : ''}
      </Text>

      {cards.length > 0 ? (
        <View className="rounded-sm border-hairline border-border-1 bg-bg-1 px-sm">
          {shown.map((card, index) => (
            <View
              key={card.line}
              className={cn(
                'flex-row gap-sm py-xs',
                index < shown.length - 1 && 'border-b border-b-divider-1',
              )}
            >
              <Text className="w-1/3 text-label-md text-fg-1" numberOfLines={2}>
                {card.term}
              </Text>
              <Text className="flex-1 text-body-md text-fg-2" numberOfLines={2}>
                {card.definition}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {hidden > 0 ? (
        <Text className="text-caption-sm text-fg-2">… và {hidden} thẻ nữa.</Text>
      ) : null}

      {result.overflow > 0 ? (
        <Alert
          description={`Bộ chỉ còn chỗ cho ${capacity} mục — ${result.overflow} thẻ cuối sẽ không được thêm.`}
          tone="warning"
        />
      ) : null}

      {errors.length > 0 ? (
        <View className="gap-xs rounded-sm bg-surface-error p-sm">
          {errors.slice(0, ERROR_ROWS).map((error) => (
            <View key={`${error.line}-${error.message}`} className="flex-row items-start gap-xs">
              <Icon color="error" name="alert-warning" size={16} />
              <Text className="flex-1 text-caption-sm text-fg-1">
                Dòng {error.line}: {error.message}
              </Text>
            </View>
          ))}
          {errors.length > ERROR_ROWS ? (
            <Text className="text-caption-sm text-fg-1">
              … và {errors.length - ERROR_ROWS} dòng khác.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
