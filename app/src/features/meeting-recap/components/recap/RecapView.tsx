import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { Dialog } from '@/shared/ui/modal';
import { cn } from '@/shared/utils/style/cn';

import { recapHeadingIcon } from '../../utils/recap-heading-icon';
import { tokenizeRecap, type RecapBlock, type RecapInline } from '../../utils/recap-markdown';

export interface RecapViewProps {
  className?: string;
  source: string;
}

function Inline({ nodes, onLink }: { nodes: RecapInline[]; onLink: (url: string) => void }) {
  return (
    <>
      {nodes.map((node, index) => {
        if (node.type === 'bold') return <Text key={index} className="font-semibold">{node.text}</Text>;
        if (node.type === 'italic') return <Text key={index} className="italic">{node.text}</Text>;
        if (node.type === 'link') {
          return (
            <Text key={index} accessibilityRole="link" className="text-link underline" onPress={() => onLink(node.url)}>
              {node.text}
            </Text>
          );
        }
        return node.text;
      })}
    </>
  );
}

function Block({ block, onLink }: { block: RecapBlock; onLink: (url: string) => void }) {
  if (block.type === 'heading') {
    // Icon theo nghĩa tiêu đề (Mục tiêu · Quyết định · Việc cần làm…, `recapHeadingIcon`) — mốc để quét biên bản dài; trang trí thuần,
    // không nhãn nên trình đọc màn hình chỉ đọc chữ tiêu đề. `pt-xs`: tách khối mới khỏi đoạn phía trên rõ hơn khe 8 chung.
    return (
      <View className="flex-row items-center gap-xs pt-xs">
        <Icon color="fg-brand" name={recapHeadingIcon(block.children)} size="sm" variant="twotone" />
        <Text accessibilityRole="header" className="flex-1 text-body-lg font-semibold text-fg-1">
          <Inline nodes={block.children} onLink={onLink} />
        </Text>
      </View>
    );
  }
  if (block.type === 'todo') {
    // Ô việc cần làm CHỈ HIỂN THỊ (app.md §7): không bấm được — tránh sửa biên bản vô tình. Trạng thái nói bằng chữ cho trình đọc màn hình.
    return (
      <View accessibilityLabel={block.done ? 'Việc đã xong' : 'Việc cần làm'} accessible className="flex-row gap-xs">
        {block.done ? (
          <Icon color="success" name="checkmark-square" size="sm" />
        ) : (
          <View className="mt-3xs h-4 w-4 rounded-3xs border-medium border-border-strong" />
        )}
        <Text className={cn('flex-1 text-body-md text-fg-1', block.done && 'text-fg-2 line-through')}>
          <Inline nodes={block.children} onLink={onLink} />
        </Text>
      </View>
    );
  }
  if (block.type === 'item') {
    return (
      <View className="flex-row gap-xs">
        <Text className="text-body-md text-fg-2">{block.marker}</Text>
        <Text className="flex-1 text-body-md text-fg-1">
          <Inline nodes={block.children} onLink={onLink} />
        </Text>
      </View>
    );
  }
  return (
    <Text className="text-body-md text-fg-1" selectable>
      <Inline nodes={block.children} onLink={onLink} />
    </Text>
  );
}

/**
 * Hiển thị biên bản markdown-lite an toàn (app.md §3 `RecapView`): đậm, nghiêng, tiêu đề nhỏ, danh sách, việc cần làm (chỉ hiển thị),
 * liên kết `https://`. Không bao giờ diễn giải HTML (mọi chữ qua `<Text>`); liên kết chỉ mở SAU khi người dùng xác nhận — biên bản đăng vào
 * nhóm chat, không để một chạm là rời app tới trang lạ.
 */
export function RecapView({ className, source }: RecapViewProps) {
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  return (
    <View className={cn('gap-xs', className)}>
      {tokenizeRecap(source).map((block, index) => (
        <Block key={index} block={block} onLink={setPendingUrl} />
      ))}
      <Dialog
        description={pendingUrl ?? ''}
        primaryAction={{
          label: 'Mở liên kết',
          onPress: () => {
            if (pendingUrl) void WebBrowser.openBrowserAsync(pendingUrl);
            setPendingUrl(null);
          },
        }}
        secondaryAction={{ label: 'Huỷ', onPress: () => setPendingUrl(null) }}
        title="Mở liên kết ngoài ứng dụng?"
        visible={pendingUrl !== null}
        onClose={() => setPendingUrl(null)}
      />
    </View>
  );
}
