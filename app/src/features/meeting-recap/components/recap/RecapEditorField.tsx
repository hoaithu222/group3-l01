import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { useThemeColor } from '@/shared/theme';
import { Tabs } from '@/shared/ui/tab';

import { RECAP_PLACEHOLDER } from '../../constants/meeting-recap.constants';
import type { MarkdownFormatting } from '../../hooks/useMarkdownFormatting';
import { RecapView } from './RecapView';

export interface RecapEditorFieldProps {
  /** Lỗi của ô nội dung (`MEET_023` — trống khi công bố/quá dài). */
  error?: string | null;
  formatting: Pick<MarkdownFormatting, 'forced' | 'onSelectionChange'>;
  max: number;
  /** Báo cha đang ở tab nào — thanh chèn nhanh chỉ hiện khi đang soạn. */
  onPreviewChange?: (preview: boolean) => void;
  value: string;
  onChange: (value: string) => void;
}

/**
 * Ô soạn biên bản + tab "Xem trước" (app.md §3 `RecapEditor`): `TextInput` nhiều dòng TRẦN (ô soạn văn bản dài không khung — `Input` là ô
 * form), state đồng bộ theo từng phím nên an toàn với bộ gõ Telex/VNI. Bộ đếm theo KÝ TỰ HIỂN THỊ (emoji ghép = 1, khớp BE `graphemeLength`
 * ở mức xấp xỉ bằng `Array.from`) — BE vẫn là nơi quyết (`MEET_023`).
 */
export function RecapEditorField({ error, formatting, max, onPreviewChange, value, onChange }: RecapEditorFieldProps) {
  const [preview, setPreview] = useState(false);
  const placeholderColor = useThemeColor('fg-3');
  const length = Array.from(value).length;
  const over = length > max;

  return (
    <View className="gap-xs">
      <Tabs
        items={[
          { key: 'edit', label: 'Soạn' },
          { key: 'preview', label: 'Xem trước' },
        ]}
        value={preview ? 'preview' : 'edit'}
        onChange={(key) => {
          setPreview(key === 'preview');
          onPreviewChange?.(key === 'preview');
        }}
      />
      {preview ? (
        <View className="min-h-48 rounded-xs bg-bg-1 p-sm">
          {value.trim() === '' ? <Text className="text-body-md italic text-fg-2">Chưa có nội dung.</Text> : <RecapView source={value} />}
        </View>
      ) : (
        <TextInput
          accessibilityLabel="Nội dung biên bản"
          className="min-h-48 rounded-xs border-hairline border-border-1 bg-bg-1 p-sm text-body-lg text-fg-1"
          multiline
          placeholder={RECAP_PLACEHOLDER}
          placeholderTextColor={placeholderColor}
          scrollEnabled={false}
          selection={formatting.forced}
          textAlignVertical="top"
          value={value}
          onChangeText={onChange}
          onSelectionChange={(event) => formatting.onSelectionChange(event.nativeEvent.selection)}
        />
      )}
      <View className="flex-row justify-between gap-sm">
        <Text className="flex-1 text-caption-lg text-error">{error ?? ''}</Text>
        <Text className={over ? 'text-caption-sm text-error' : 'text-caption-sm text-fg-2'}>{`${String(length)}/${String(max)}`}</Text>
      </View>
    </View>
  );
}
