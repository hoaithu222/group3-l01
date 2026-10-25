import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Checkbox } from '@/shared/ui/checkbox';
import { IconTile } from '@/shared/ui/icon-tile';
import { formatFileSize } from '@/shared/utils/format/file-size.utils';
import { cn } from '@/shared/utils/style/cn';

import type { EligibleResource } from '../api/plagiarism.types';
import { fingerprintStatusLabel } from '../utils/level-label';

interface ResourcePickerListProps {
  data: EligibleResource[];
  onToggle: (resourceId: string) => void;
  selected: ReadonlySet<string>;
}

function isSelectable(status: EligibleResource['fingerprintStatus']): boolean {
  return status === 'READY' || status === 'PENDING';
}

/** Dòng phụ: đuôi tệp · dung lượng · lý do/trạng thái chuẩn bị (nếu có). */
function metaOf(item: EligibleResource, statusText: string | null): string {
  return [item.extension?.toUpperCase(), formatFileSize(item.size), statusText]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Danh sách chọn nhiều tệp (app.md `ResourcePickerList`): tệp `UNSUPPORTED`/`NO_TEXT`/`TOO_LARGE`/`FAILED` bị khoá kèm
 * lý do, `PENDING` vẫn chọn được nhưng hiện "Đang chuẩn bị" (BE tự chờ tới `indexWaitMaxMinutes` khi quét).
 *
 * ✅ Mỗi dòng là MỘT `Checkbox` với nhãn dạng node: cả dòng là vùng chạm, trình đọc màn hình nghe "hộp kiểm, <tên>, đã
 * chọn/đã tắt" — bản cũ lồng `Checkbox` trong một `Pressable` vai `checkbox` KHÔNG có `accessibilityState`, thành hai ô
 * trợ năng mà ô ngoài không báo chọn hay chưa.
 * ⚠️ Nhãn node không thừa hưởng màu chữ của `Checkbox` ⇒ tự đặt; tệp bị khoá dùng `fg-2` (không `fg-3`: lý do khoá là
 * thông tin người dùng CẦN đọc).
 */
export function ResourcePickerList({ data, onToggle, selected }: ResourcePickerListProps) {
  return (
    <Card className="px-md py-2xs" padded={false}>
      {data.map((item) => {
        const selectable = isSelectable(item.fingerprintStatus);
        const statusText = fingerprintStatusLabel(item.fingerprintStatus);
        const isCode = item.kind === 'CODE';
        const meta = metaOf(item, statusText);
        return (
          <Checkbox
            key={item.resourceId}
            accessibilityLabel={statusText ? `${item.name}, ${statusText}` : item.name}
            checked={selected.has(item.resourceId)}
            className="items-center py-xs"
            disabled={!selectable}
            label={
              <View className="flex-row items-center gap-sm">
                <IconTile
                  name={isCode ? 'document-2' : 'document'}
                  size="sm"
                  tone={selectable ? (isCode ? 'accent' : 'info') : 'neutral'}
                />
                <View className="flex-1 gap-3xs">
                  <Text
                    className={cn('text-body-md', selectable ? 'text-fg-1' : 'text-fg-2')}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  {meta ? <Text className="text-caption-sm text-fg-2">{meta}</Text> : null}
                </View>
              </View>
            }
            onChange={() => onToggle(item.resourceId)}
          />
        );
      })}
    </Card>
  );
}
