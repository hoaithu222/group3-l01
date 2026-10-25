import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';

import { CSV_EXAMPLE_TEXT } from '../../utils/csv-import-summary';

export interface CsvGuideProps {
  /** Điền ví dụ vào ô nhập — vừa để đọc hiểu định dạng, vừa để thử xem trước một lần mà không cần có sẵn dữ liệu. */
  onUseExample: () => void;
}

/**
 * Hướng dẫn định dạng NGẮN của tấm nhập CSV, kèm ví dụ thật. Chỉ hiện khi ô nhập còn trống — có chữ rồi thì chỗ đó dành cho bản xem
 * trước (`CsvPreview`); người dùng đã biết cần dán gì nên không phải đọc lại hướng dẫn.
 */
export function CsvGuide({ onUseExample }: CsvGuideProps) {
  return (
    <View className="gap-sm rounded-md bg-bg-2 p-sm">
      <Text className="text-label-md font-semibold text-fg-1">Mỗi dòng một thẻ</Text>
      <Text className="text-body-md text-fg-1">
        Cột 1 là thuật ngữ, cột 2 là định nghĩa. Ngăn cột bằng Tab (khi sao chép từ Excel hoặc
        Google Sheets), dấu phẩy hoặc dấu chấm phẩy.
      </Text>
      <View className="gap-3xs rounded-sm border-hairline border-border-1 bg-bg-1 p-sm">
        <Text className="text-caption-sm text-fg-2">Ví dụ</Text>
        {CSV_EXAMPLE_TEXT.split('\n').map((line) => (
          <Text key={line} className="text-body-md text-fg-1">
            {line}
          </Text>
        ))}
      </View>
      <Text className="text-caption-sm text-fg-2">
        Dòng đầu là tiêu đề sẽ tự được bỏ qua. Thuật ngữ hoặc định nghĩa có dấu phẩy thì đặt trong
        dấu ngoặc kép.
      </Text>
      <View className="flex-row">
        <Button label="Dùng ví dụ này" size="sm" variant="secondary" onPress={onUseExample} />
      </View>
    </View>
  );
}
