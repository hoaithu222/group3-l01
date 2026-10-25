import { useState } from 'react';
import { Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { Dialog } from '@/shared/ui/modal';
import { cn } from '@/shared/utils/style/cn';

import { splitContent } from '../utils/mention-content';
import { tokenizeMarkdown, type BlockNode, type InlineNode } from '../utils/markdown';

export interface MarkdownViewProps {
  className?: string;
  /** Có thì marker `@{u:<id>}` vẽ thành chip `@Tên` (bình luận); mô tả thẻ không truyền. */
  mentionLabel?: (userId: string) => string;
  source: string;
}

interface RunProps {
  mentionLabel?: (userId: string) => string;
  node: InlineNode;
  onLink: (url: string) => void;
}

/** Chữ thường + chip nhắc tên; chip đứng riêng để tô đậm, màu thương hiệu (không chỉ màu — có `@`). */
function PlainText({
  text,
  mentionLabel,
}: {
  mentionLabel?: (userId: string) => string;
  text: string;
}) {
  if (!mentionLabel) return <>{text}</>;
  return (
    <>
      {splitContent(text).map((segment, index) =>
        segment.kind === 'text' ? (
          segment.text
        ) : (
          <Text
            key={index}
            className="font-semibold text-fg-brand"
          >{`@${mentionLabel(segment.userId)}`}</Text>
        ),
      )}
    </>
  );
}

function InlineRun({ mentionLabel, node, onLink }: RunProps) {
  switch (node.type) {
    case 'bold':
      return (
        <Text className="font-semibold">
          <PlainText mentionLabel={mentionLabel} text={node.text} />
        </Text>
      );
    case 'italic':
      return (
        <Text className="italic">
          <PlainText mentionLabel={mentionLabel} text={node.text} />
        </Text>
      );
    case 'strike':
      return <Text className="line-through">{node.text}</Text>;
    case 'code':
      return <Text className="rounded-3xs bg-bg-2 font-mono">{node.text}</Text>;
    case 'link':
      return (
        <Text
          accessibilityRole="link"
          className="text-link underline"
          onPress={() => onLink(node.url)}
        >
          {node.text}
        </Text>
      );
    default:
      return <PlainText mentionLabel={mentionLabel} text={node.text} />;
  }
}

const HEADING_CLASS = { 1: 'text-header-sm', 2: 'text-body-lg', 3: 'text-body-md' } as const;

function Inline({ nodes, ...rest }: Omit<RunProps, 'node'> & { nodes: InlineNode[] }) {
  return (
    <>
      {nodes.map((node, index) => (
        <InlineRun key={index} node={node} {...rest} />
      ))}
    </>
  );
}

function Block({ block, ...rest }: Omit<RunProps, 'node'> & { block: BlockNode }) {
  switch (block.type) {
    case 'heading':
      return (
        <Text className={cn(HEADING_CLASS[block.level], 'font-semibold text-fg-1')}>
          <Inline nodes={block.children} {...rest} />
        </Text>
      );
    case 'quote':
      return (
        <View className="border-l-2 border-border-strong pl-sm">
          <Text className="text-body-md italic text-fg-2">
            <Inline nodes={block.children} {...rest} />
          </Text>
        </View>
      );
    case 'code':
      return (
        <View className="rounded-xs bg-bg-2 p-sm">
          <Text className="font-mono text-body-md text-fg-1">{block.text}</Text>
        </View>
      );
    case 'list':
      return (
        <View className="gap-3xs">
          {block.items.map((item, index) => (
            <View key={index} className="flex-row gap-xs">
              <Text className="text-body-md text-fg-2">
                {block.ordered ? `${index + 1}.` : '•'}
              </Text>
              <Text className="flex-1 text-body-md text-fg-1">
                <Inline nodes={item} {...rest} />
              </Text>
            </View>
          ))}
        </View>
      );
    default:
      return (
        <Text className="text-body-md text-fg-1">
          <Inline nodes={block.children} {...rest} />
        </Text>
      );
  }
}

/**
 * Hiển thị Markdown an toàn (mô tả thẻ, bình luận) — xem `utils/markdown.ts` cho phạm vi hỗ trợ và
 * lý do viết cục bộ. Không bao giờ diễn giải HTML; liên kết http(s) chỉ mở SAU khi người dùng xác nhận
 * (không tự rời app), cùng luật liên kết của bong bóng chat.
 */
export function MarkdownView({ className, mentionLabel, source }: MarkdownViewProps) {
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  return (
    <View className={cn('gap-xs', className)}>
      {tokenizeMarkdown(source).map((block, index) => (
        <Block key={index} block={block} mentionLabel={mentionLabel} onLink={setPendingUrl} />
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
