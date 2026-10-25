import * as Clipboard from 'expo-clipboard';
import { ScrollView, Text, View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useThemeColors, type ThemeColorKey } from '@/shared/theme';
import { Button } from '@/shared/ui/button';
import { showToast } from '@/shared/utils/toast.utils';

import type { Block } from '../../api/roadmap.types';
import { MONO_FONT } from '../../constants/roadmap.constants';
import { tokenizeRoadmapCode, type CodeTokenKind } from './code-tokens';

export interface CodeBlockProps {
  block: Extract<Block, { type: 'code' }>;
}

const COLOR_BY_KIND: Record<CodeTokenKind, ThemeColorKey> = {
  comment: 'fg-2',
  function: 'info',
  keyword: 'fg-brand',
  number: 'warning',
  plain: 'fg-1',
  punctuation: 'fg-2',
  string: 'success',
};

/** Khối code (be.md §5.1 `type: 'code'`) — tô màu `prism-react-renderer`, cuộn NGANG + nút sao chép (app.md §7.2). */
export function CodeBlock({ block }: CodeBlockProps) {
  const colors = useThemeColors();
  const lines = tokenizeRoadmapCode(block.code, block.lang);

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(block.code);
      showToast('success', 'Đã sao chép mã');
    } catch (error) {
      showToast('error', toErrorMessage(error));
    }
  };

  return (
    <View className="gap-2xs">
      <View className="flex-row items-center justify-between">
        <Text className="text-caption-lg text-fg-2">{block.lang ?? 'code'}</Text>
        <Button label="Sao chép" size="xs" variant="secondary" onPress={() => void copy()} />
      </View>
      <ScrollView
        className="rounded-2xs bg-bg-2"
        horizontal
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-sm py-xs">
          {lines.map((line, index) => (
            <Text key={index} className="text-caption-lg" selectable style={{ fontFamily: MONO_FONT }}>
              {line.length === 0
                ? ' '
                : line.map((token, tokenIndex) => (
                    <Text key={tokenIndex} style={{ color: colors[COLOR_BY_KIND[token.kind]] }}>
                      {token.text}
                    </Text>
                  ))}
            </Text>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
