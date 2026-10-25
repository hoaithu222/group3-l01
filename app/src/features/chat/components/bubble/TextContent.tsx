import { useState } from 'react';
import { Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { Dialog } from '@/shared/ui/modal';
import { cn } from '@/shared/utils/style/cn';

import type { MessageMention } from '../../api/chat.types';
import { MentionChipText } from '../../mentions/MentionChipText';
import { tokenizeMarkdownLite, type BlockNode, type InlineNode } from '../../utils/markdown-lite';

export interface TextContentProps {
  className?: string;
  content: string;
  /** `MessageView.mentions` — cho chip nhắc tên lấy nhãn ảnh chụp khi chưa tra được tên hiện tại (p1-06). */
  mentions?: MessageMention[];
  /** Đậm hơn khi là bong bóng của CHÍNH MÌNH (nền tối, cần chữ tương phản khác). */
  tone?: 'default' | 'onAction';
}

type Tone = 'default' | 'onAction';
const NO_MENTIONS: MessageMention[] = [];

/** `code` KHÔNG dựng chip: trong khối code `@{u:…}` là chữ người viết, không phải lời nhắc (BE vẫn parse — nhưng hiện nguyên văn là an toàn hơn). */
function InlineRun({ node, tone, mentions }: { node: InlineNode; tone: Tone; mentions: MessageMention[] }) {
  const base = tone === 'onAction' ? 'text-action-fg' : 'text-fg-1';
  switch (node.type) {
    case 'bold':
      return (
        <Text className={cn(base, 'font-semibold')}>
          <MentionChipText mentions={mentions} text={node.text} tone={tone} />
        </Text>
      );
    case 'italic':
      return (
        <Text className={cn(base, 'italic')}>
          <MentionChipText mentions={mentions} text={node.text} tone={tone} />
        </Text>
      );
    case 'strike':
      return (
        <Text className={cn(base, 'line-through')}>
          <MentionChipText mentions={mentions} text={node.text} tone={tone} />
        </Text>
      );
    case 'code':
      return <Text className={cn(base, 'font-mono')}>{node.text}</Text>;
    case 'link':
      return <LinkText node={node} />;
    case 'text':
    default:
      return (
        <Text className={base}>
          <MentionChipText mentions={mentions} text={node.text} tone={tone} />
        </Text>
      );
  }
}

/** Link http(s)/www mở qua `WebBrowser` SAU xác nhận — không tự mở (app.md §7). */
function LinkText({ node }: { node: Extract<InlineNode, { type: 'link' }> }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Text accessibilityRole="link" className="text-link underline" onPress={() => setConfirming(true)}>
        {node.text}
      </Text>
      <Dialog
        description={node.url}
        primaryAction={{ label: 'Mở liên kết', onPress: () => void WebBrowser.openBrowserAsync(node.url) }}
        secondaryAction={{ label: 'Huỷ', onPress: () => setConfirming(false) }}
        title="Mở liên kết ngoài ứng dụng?"
        visible={confirming}
        onClose={() => setConfirming(false)}
      />
    </>
  );
}

function Block({ block, tone, mentions }: { block: BlockNode; tone: Tone; mentions: MessageMention[] }) {
  if (block.type === 'codeblock') {
    return (
      <View className="my-3xs rounded-2xs bg-bg-2 px-xs py-2xs">
        <Text className="font-mono text-caption-sm text-fg-1">{block.text}</Text>
      </View>
    );
  }
  if (block.type === 'list') {
    return (
      <View className="my-3xs gap-3xs">
        {block.items.map((item, index) => (
           
          <View key={index} className="flex-row gap-2xs">
            <Text className={tone === 'onAction' ? 'text-action-fg' : 'text-fg-1'}>
              {block.ordered ? `${index + 1}.` : '•'}
            </Text>
            <Text className="flex-1">
              {item.map((node, i) => (
                 
                <InlineRun key={i} mentions={mentions} node={node} tone={tone} />
              ))}
            </Text>
          </View>
        ))}
      </View>
    );
  }
  return (
    <Text>
      {block.children.map((node, i) => (
         
        <InlineRun key={i} mentions={mentions} node={node} tone={tone} />
      ))}
    </Text>
  );
}

/**
 * Renderer markdown-lite — whitelist đậm/nghiêng/gạch/code/khối code/danh
 * sách/link, KHÔNG BAO GIỜ diễn giải HTML (mọi nhánh render qua `<Text>` của
 * React Native, không có `dangerouslySetInnerHTML`/WebView nào trong cây này).
 */
export function TextContent({ className, content, mentions = NO_MENTIONS, tone = 'default' }: TextContentProps) {
  const blocks = tokenizeMarkdownLite(content);
  return (
    <View className={className}>
      {blocks.map((block, i) => (
         
        <Block key={i} block={block} mentions={mentions} tone={tone} />
      ))}
    </View>
  );
}
