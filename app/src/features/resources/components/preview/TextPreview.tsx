import { FlatList, Text, View } from 'react-native';

import { Skeleton } from '@/shared/ui/skeleton';

import { useResourceLimits } from '../../hooks/useResourceLimits';
import { useResourceText } from '../../hooks/useResourceText';
import type { PreviewProps } from './preview.types';
import { UnsupportedPreview } from './UnsupportedPreview';

/**
 * Xem văn bản thuần (TXT/CSV/…): chia theo DÒNG để danh sách ảo hoá — một khối
 * `<Text>` 500 KB duy nhất vừa chậm vừa không cuộn mượt. Xuống dòng tự động (khác
 * `CodePreview` cuộn ngang) vì văn xuôi đọc theo chiều rộng màn. Chọn/sao chép
 * qua `selectable`. Quá `codePreviewMaxBytes` ⇒ "Tệp quá lớn" + Tải về.
 */
export function TextPreview({ onDownload, onOpenExternal, resource }: PreviewProps) {
  const limits = useResourceLimits();
  const oversize = resource.size > limits.codePreviewMaxBytes;
  const text = useResourceText(resource, limits.codePreviewMaxBytes, !oversize);

  if (oversize) {
    return (
      <UnsupportedPreview actions={[{ label: 'Tải về', onPress: onDownload }]} reason="too-large" />
    );
  }
  if (text.isError) {
    return (
      <UnsupportedPreview
        actions={[
          { label: 'Thử lại', onPress: () => void text.refetch() },
          { label: 'Mở bằng ứng dụng khác', onPress: onOpenExternal, variant: 'secondary' },
        ]}
        reason="error"
      />
    );
  }
  if (text.data === undefined) return <Skeleton className="h-full w-full" />;

  return (
    <View className="flex-1">
      <FlatList
        contentContainerClassName="px-md py-sm"
        data={text.data.split('\n')}
        initialNumToRender={40}
        keyExtractor={(_, index) => String(index)}
        renderItem={({ item }) => (
          <Text className="text-body-md text-fg-1" selectable>
            {item === '' ? ' ' : item}
          </Text>
        )}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        windowSize={7}
      />
    </View>
  );
}
