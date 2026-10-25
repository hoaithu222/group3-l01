/**
 * Cụm công cụ chú thích: chọn công cụ · màu · cỡ nét/chữ · hoàn tác · xoá.
 * Đổi màu/cỡ khi đang chọn một nét sẽ áp NGAY cho nét đó (xử lý trong useAnnotationEditor).
 *
 * Import primitive theo đường dẫn TRỰC TIẾP (không qua barrel `@/shared/ui`) — barrel export
 * cả `ImageLightbox`, mà lightbox lại import lớp chú thích ⇒ vòng lặp import.
 */
import { memo } from 'react';

import { SystemIcon } from '@/shared/ui/icons/Icons';
import { cn } from '@/shared/utils/style/cn';

import Button from '@/shared/ui/actions/Button';
import SegmentToggle from '@/shared/ui/actions/SegmentToggle';
import Tooltip from '@/shared/ui/overlays/Tooltip';
import { ANNOTATION_COLORS, SIZE_STEPS, type Tool } from './annotation.types';
import type { AnnotationEditor } from './useAnnotationEditor';

// Không có công cụ "Chọn": chọn / kéo / đổi cỡ làm qua thẻ và handle gắn trên từng object,
// dùng được ở cả hai tool nên không phải chuyển qua lại.
const TOOL_OPTIONS = [
  { key: 'ellipse', label: 'Khoanh', icon: <SystemIcon name="circle-outline" size={16} /> },
  { key: 'text', label: 'Chữ', icon: <SystemIcon name="type-outline" size={16} /> },
];

const SIZE_LABELS = ['Mảnh', 'Vừa', 'Dày'];

interface AnnotatorToolbarProps {
  editor: AnnotationEditor;
  disabled?: boolean;
}

export const AnnotatorToolbar = memo(({ editor, disabled }: AnnotatorToolbarProps) => (
  <div className={cn('flex items-center gap-2', disabled && 'pointer-events-none opacity-50')}>
    <SegmentToggle
      options={TOOL_OPTIONS}
      size="sm"
      value={editor.tool}
      variant="subtle"
      onValueChange={(next) => editor.setTool(next as Tool)}
    />

    {/* Màu — đỏ đứng đầu vì khoanh vi phạm là ca dùng chính. */}
    <div className="flex items-center gap-1">
      {ANNOTATION_COLORS.map((c) => (
        <button
          key={c}
          aria-label={`Màu ${c}`}
          aria-pressed={editor.color === c}
          className={cn(
            'size-5 rounded-full border transition-transform',
            editor.color === c
              ? 'scale-110 border-neutral-0'
              : 'border-neutral-0/30 hover:scale-105',
          )}
          style={{ backgroundColor: c }}
          type="button"
          onClick={() => editor.setColor(c)}
        />
      ))}
    </div>

    <SegmentToggle
      options={SIZE_STEPS.map((step, idx) => ({ key: String(step), label: SIZE_LABELS[idx] }))}
      size="sm"
      value={String(editor.sizeStep)}
      variant="subtle"
      onValueChange={(next) => editor.setSizeStep(Number(next))}
    />

    <Tooltip content="Hoàn tác (Ctrl+Z)">
      <Button
        aria-label="Hoàn tác"
        disabled={!editor.canUndo}
        size="sm"
        skin="neutral"
        variant="ghost"
        onClick={editor.undo}
      >
        <SystemIcon name="arrow-rotate-left-outline" size={16} />
      </Button>
    </Tooltip>
    <Tooltip content="Xoá nét đang chọn (Delete)">
      <Button
        aria-label="Xoá nét đang chọn"
        disabled={!editor.selected}
        size="sm"
        skin="neutral"
        variant="ghost"
        onClick={editor.deleteSelected}
      >
        <SystemIcon name="trash-can-outline" size={16} />
      </Button>
    </Tooltip>
    <Tooltip content="Xoá toàn bộ chú thích">
      <Button
        aria-label="Xoá toàn bộ chú thích"
        disabled={!editor.shapes.length}
        size="sm"
        skin="neutral"
        variant="ghost"
        onClick={editor.clearAll}
      >
        <SystemIcon name="circle-xmark-outline" size={16} />
      </Button>
    </Tooltip>
  </div>
));

AnnotatorToolbar.displayName = 'AnnotatorToolbar';
