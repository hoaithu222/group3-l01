import { Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';

import { describeBreakdown, describeSummary, type DraftSummary } from '../../utils/editor-summary';

export interface EditorSummaryBarProps {
  /** Số mục còn "Cần sửa" (lỗi kiểm cục bộ hoặc server báo) — 0 thì không hiện huy hiệu. */
  needsFix: number;
  summary: DraftSummary;
  /** Mở tấm "Nhập từ CSV". */
  onImport: () => void;
}

/**
 * Thanh tóm tắt đầu danh sách mục: "12 mục · 3 dạng", dòng phụ đếm từng dạng ("5 thẻ ghi nhớ · 4 trắc nghiệm…"), huy hiệu "N cần
 * sửa" khi còn mục lỗi, và lối tắt "Nhập CSV". Nhìn một cái biết bộ đang có gì và còn việc gì — không phải cuộn cả danh sách.
 * "Cần sửa" là CHỮ trong huy hiệu (kèm icon ở từng hàng), không chỉ màu đỏ.
 */
export function EditorSummaryBar({ needsFix, onImport, summary }: EditorSummaryBarProps) {
  const breakdown = describeBreakdown(summary);
  return (
    <View className="flex-row items-center gap-xs border-b border-b-divider-1 bg-bg-1 px-md py-xs">
      <View className="flex-1 gap-3xs">
        <Text accessibilityLiveRegion="polite" className="text-label-md font-semibold text-fg-1">
          {describeSummary(summary)}
        </Text>
        {breakdown ? (
          <Text className="text-caption-sm text-fg-2" numberOfLines={2}>
            {breakdown}
          </Text>
        ) : null}
        {needsFix > 0 ? (
          <View className="flex-row">
            <Badge
              accessibilityLabel={`${needsFix} mục cần sửa trước khi lưu`}
              label={`${needsFix} mục cần sửa`}
              size="sm"
              variant="error"
            />
          </View>
        ) : null}
      </View>
      <Button
        accessibilityLabel="Nhập thẻ từ CSV"
        iconLeft="document"
        label="Nhập CSV"
        size="sm"
        variant="tertiary"
        onPress={onImport}
      />
    </View>
  );
}
