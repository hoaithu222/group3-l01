import { Fragment } from 'react';

import { Divider, Heading, Text } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { cn } from '@/shared/utils/style/cn';

import type { Block, Span } from '../types/roadmap.types';

/**
 * Render `Block[]` (be.md §5.1, `blocksFormat = 1`) tối giản, CHỈ ĐỌC — dùng cho xem trước khi soạn
 * (`MarkdownEditor`, `POST /admin/roadmap/preview`). Đây là bản xem trước CHO ADMIN, đơn giản hơn bộ
 * dựng khối thật của app (không cuộn ngang mượt, không tô màu cú pháp, ảnh chỉ hiện placeholder vì
 * preview không phân giải được URL asset từ `mediaId`) — admin.md §3 cho phép mức này.
 */

const ALIGN_CLASS: Record<'left' | 'center' | 'right', string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

function alignClass(align: 'left' | 'center' | 'right' | null | undefined): string | undefined {
  return align ? ALIGN_CLASS[align] : undefined;
}

function renderSpan(span: Span, key: number): React.ReactNode {
  switch (span.t) {
    case 'bold':
      return (
        <strong key={key} className="font-semibold text-fg-1">
          {span.v}
        </strong>
      );
    case 'italic':
      return (
        <em key={key} className="italic">
          {span.v}
        </em>
      );
    case 'strike':
      return (
        <s key={key} className="text-fg-4 line-through">
          {span.v}
        </s>
      );
    case 'code':
      return (
        <code key={key} className="rounded bg-bg-3 px-1 py-0.5 font-mono text-caption-12 text-fg-1">
          {span.v}
        </code>
      );
    case 'link':
      return (
        <a
          key={key}
          className="text-link underline underline-offset-2 hover:opacity-80"
          href={span.href}
          rel="noreferrer"
          target="_blank"
        >
          {span.v}
        </a>
      );
    default:
      return <Fragment key={key}>{span.v}</Fragment>;
  }
}

function Spans({ spans }: { spans: Span[] }) {
  return <>{spans.map((s, i) => renderSpan(s, i))}</>;
}

function BlockList({ blocks }: { blocks: Block[] }) {
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, i) => (
        // Block[] không có id ổn định (dựng lại mỗi lần preview); thứ tự không đổi trong một lần render.
        <BlockNode key={i} block={block} />
      ))}
    </div>
  );
}

function BlockNode({ block }: { block: Block }) {
  switch (block.type) {
    case 'heading': {
      const size = block.level === 2 ? 'large' : block.level === 3 ? 'medium' : 'small';
      return (
        <Heading id={block.anchor} size={size}>
          <Spans spans={block.spans} />
        </Heading>
      );
    }
    case 'paragraph':
      return (
        <Text as="p" className="text-body-14 leading-relaxed text-fg-2">
          <Spans spans={block.spans} />
        </Text>
      );
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag
          className={cn(
            'flex flex-col gap-1.5 pl-5 text-body-14 text-fg-2',
            block.ordered ? 'list-decimal' : 'list-disc',
          )}
          start={block.ordered ? block.start : undefined}
        >
          {block.items.map((item, i) => (
            <li key={i}>
              <BlockList blocks={item} />
            </li>
          ))}
        </Tag>
      );
    }
    case 'checklist':
      // Checkbox CÒN LẠI TRONG THÂN bài (bài tập) — be.md §5.1: "chỉ hiển thị", không tương tác được ở đây
      // (khác `RoadmapLessonProgress.checkedItemIds`, tick được ở app cho `checklist[]` cấp buổi).
      return (
        <ul className="flex flex-col gap-1.5">
          {block.items.map((item) => (
            <li key={item.id} className="flex items-start gap-2 text-body-14 text-fg-2">
              <SystemIcon className="mt-0.5 shrink-0 text-fg-4" name="square-outline" size={14} />
              <span>
                <Spans spans={item.spans} />
              </span>
            </li>
          ))}
        </ul>
      );
    case 'code':
      return (
        <pre className="overflow-x-auto rounded-md border border-border-2 bg-bg-3 p-3 text-caption-12 text-fg-1">
          <code>{block.code}</code>
        </pre>
      );
    case 'table':
      return (
        <div className="overflow-x-auto rounded-md border border-border-2">
          <table className="w-full border-collapse text-body-14 text-fg-2">
            <thead>
              <tr>
                {block.header.map((cell, i) => (
                  <th
                    key={i}
                    className={cn(
                      'border-b border-border-2 bg-bg-3 px-2 py-1.5 text-left text-body-14-medium text-fg-1',
                      alignClass(block.align[i]),
                    )}
                  >
                    <Spans spans={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className={cn(
                        'border-b border-divider-white-10 px-2 py-1.5 align-top',
                        alignClass(block.align[ci]),
                      )}
                    >
                      <Spans spans={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'quote':
      return (
        <blockquote className="flex flex-col gap-2 border-l-2 border-border-2 pl-3 text-body-14 text-fg-3">
          <BlockList blocks={block.blocks} />
        </blockquote>
      );
    case 'details':
      return (
        <details className="rounded-md border border-border-2 bg-bg-2 p-3">
          <summary className="cursor-pointer text-body-14-medium text-fg-1">
            <Spans spans={block.summary} />
          </summary>
          <div className="mt-2 flex flex-col gap-2 pl-1">
            <BlockList blocks={block.blocks} />
          </div>
        </details>
      );
    case 'image':
      // Preview KHÔNG phân giải được `mediaId` → URL thật (endpoint xem trước chỉ nhận `bodyMd`, không
      // có `lessonId`/media) — hiện placeholder + cảnh báo khi chưa tìm thấy, thay vì cố tải ảnh.
      return (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-border-2 bg-bg-2 px-3 py-2 text-caption-12 text-fg-4">
          <SystemIcon name="image-outline" size={16} />
          <span>
            {block.alt || 'Hình ảnh'}
            {block.mediaId ? '' : ' — chưa khớp ảnh nào (kiểm tra tab Hình ảnh)'}
          </span>
        </div>
      );
    case 'divider':
      return <Divider />;
    default:
      return null;
  }
}

export interface BlockPreviewProps {
  blocks: Block[];
  className?: string;
}

export default function BlockPreview({ blocks, className }: BlockPreviewProps) {
  if (blocks.length === 0) {
    return (
      <Text as="p" className="text-body-14 text-fg-4">
        Chưa có nội dung — gõ markdown bên trái để xem trước.
      </Text>
    );
  }
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <BlockList blocks={blocks} />
    </div>
  );
}
