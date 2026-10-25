import { useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

import type { FolderRef } from '../api';
import type { BreadcrumbSegment } from '../utils/breadcrumb';

export interface FolderBreadcrumbProps {
  /** Chạm một cấp TRÊN thư mục hiện tại để về đó. */
  onNavigate: (folderId: FolderRef) => void;
  segments: readonly BreadcrumbSegment[];
}

/**
 * Đường dẫn thư mục, cuộn ngang, tự cuộn tới cấp cuối khi sâu (app.md p3-01 §3).
 * Cấp cuối là thư mục ĐANG XEM nên không bấm được và đánh dấu `selected` cho
 * trình đọc màn hình (màu/đậm không phải dấu hiệu duy nhất).
 *
 * ✅ Ở GỐC chỉ có một cấp ("Tài liệu") — chính là tiêu đề của thanh tiêu đề ngay trên — nên KHÔNG vẽ gì: một dải 44dp
 * lặp lại đúng một chữ, trước dữ liệu, là dải điều khiển thừa. Dải này chỉ có ích khi đang ở trong thư mục con.
 */
export function FolderBreadcrumb({ onNavigate, segments }: FolderBreadcrumbProps) {
  const scrollRef = useRef<ScrollView>(null);
  const lastIndex = segments.length - 1;

  if (segments.length <= 1) return null;

  return (
    // `grow-0`: ScrollView NGANG mặc định `flexGrow: 1` — cạnh danh sách `flex-1` trong cùng cột thì bị kéo cao ~nửa màn.
    <ScrollView
      ref={scrollRef}
      className="grow-0"
      contentContainerClassName="items-center px-md"
      horizontal
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
    >
      {segments.map((segment, index) => {
        const isCurrent = index === lastIndex;
        return (
          <View key={segment.id} className="flex-row items-center">
            {index > 0 ? <Icon color="fg-2" name="arrow-right-small" size="sm" /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: isCurrent, selected: isCurrent }}
              className="min-h-11 justify-center px-xs active:opacity-70"
              disabled={isCurrent}
              hitSlop={4}
              onPress={() => onNavigate(segment.id)}
            >
              <Text
                className={isCurrent ? 'text-label-md text-fg-1' : 'text-body-md text-fg-brand'}
                numberOfLines={1}
              >
                {segment.label}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}
