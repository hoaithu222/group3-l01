/**
 * Lớp chú thích bên trong `ImageLightbox` — thay chỗ thẻ `<img>` khi bật chế độ vẽ.
 *
 * Dùng LẠI toàn bộ khung xem của lightbox: `layout` (đã tính fit + zoom) và `rotation` do
 * lightbox truyền xuống, nên thu phóng / xoay / cuộn hoạt động y như lúc chỉ xem. Canvas được
 * cấp phát đúng cỡ hiển thị nên phóng to là nét lại từ bitmap gốc, không vỡ hạt.
 *
 * Chỉ mount khi đang vẽ, và caller nên `key` theo ảnh — state nét vẽ phải tươi cho mỗi ảnh.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/shared/utils/style/cn';
import { showToast } from '@/shared/utils/toast.utils';

import Button from '@/shared/ui/actions/Button';
import Spinner from '@/shared/ui/feedback/Spinner';
import { AnnotatorToolbar } from './AnnotatorToolbar';
import { FONT_FAMILY, LINE_HEIGHT_RATIO, type Point, type Shape } from './annotation.types';
import { drawShapes } from './draw-shapes';
import { decodeImage, flattenAnnotations } from './flatten-image';
import { useAnnotationEditor } from './useAnnotationEditor';

export interface AnnotationResult {
  file: File;
  shapes: Shape[];
}

interface AnnotationLayerProps {
  source: Blob;
  fileName: string;
  initialShapes: Shape[];
  /** Cỡ hiển thị hiện tại do lightbox tính (fit × zoom). null = chưa biết kích thước ảnh. */
  layout: { width: number; height: number } | null;
  rotation: number;
  saving: boolean;
  /** Báo kích thước thật của ảnh để lightbox tính được `layout`. */
  onNatural: (natural: { w: number; h: number }) => void;
  onCancel: () => void;
  onSave: (result: AnnotationResult) => void;
}

export const AnnotationLayer = ({
  source,
  fileName,
  initialShapes,
  layout,
  rotation,
  saving,
  onNatural,
  onCancel,
  onSave,
}: AnnotationLayerProps) => {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [flattening, setFlattening] = useState(false);
  const [hoveringMove, setHoveringMove] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    let created: ImageBitmap | null = null;
    decodeImage(source)
      .then((bmp) => {
        if (!alive) {
          bmp.close?.();
          return;
        }
        created = bmp;
        setBitmap(bmp);
        onNatural({ w: bmp.width, h: bmp.height });
      })
      .catch(() => {
        if (alive) showToast('error', 'Không đọc được ảnh để chú thích');
      });
    return () => {
      alive = false;
      created?.close?.();
    };
  }, [source, onNatural]);

  const editor = useAnnotationEditor({
    naturalWidth: bitmap?.width ?? 0,
    naturalHeight: bitmap?.height ?? 0,
    initialShapes,
  });
  const { shapes, draft, selectedId, editing, tool, deleteSelected, undo, cancelDraft } = editor;
  const editingId = editing?.id;

  /** px hiển thị trên 1 px ảnh gốc. */
  const k = bitmap && layout ? layout.width / bitmap.width : 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap || !layout || !k) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(layout.width * dpr);
    canvas.height = Math.round(layout.height * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
    ctx.clearRect(0, 0, bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, 0, 0);
    drawShapes(ctx, shapes, {
      draft,
      selectedId,
      scale: k,
      // Thẻ kéo hiện ở MỌI tool — đó là cách duy nhất để chọn/di chuyển khi không có công cụ Chọn.
      showMoveHandles: true,
      imageHeight: bitmap.height,
    });
  }, [bitmap, layout, k, shapes, draft, selectedId]);

  /**
   * Màn hình → toạ độ ảnh. Không dùng `getBoundingClientRect().left` được vì khi ảnh xoay,
   * rect là hộp bao trục toạ độ chứ không phải mép ảnh. Lấy TÂM (bất biến qua phép xoay
   * quanh tâm) rồi quay ngược `-rotation`.
   */
  const toImagePoint = useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const canvas = canvasRef.current;
      if (!canvas || !layout || !k) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      const rad = (-rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      return {
        x: (dx * cos - dy * sin + layout.width / 2) / k,
        y: (dx * sin + dy * cos + layout.height / 2) / k,
      };
    },
    [layout, k, rotation],
  );

  const withCtx = useCallback((fn: (ctx: CanvasRenderingContext2D) => void) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) fn(ctx);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!k) return;
      e.stopPropagation(); // đừng để click lọt xuống nền lightbox
      // ⚠️ KHÔNG `preventDefault()` ở đây: huỷ pointerdown sẽ chặn luôn cặp sự kiện chuột
      // tương thích, mất cả `dblclick` (lối sửa nội dung chữ). Cuộc đua focus của ô soạn chữ
      // đã xử lý bằng focus theo frame + `readyRef` bên dưới.
      e.currentTarget.setPointerCapture(e.pointerId);
      draggingRef.current = true;
      withCtx((ctx) => editor.pointerDown(ctx, toImagePoint(e), k));
    },
    [k, toImagePoint, withCtx, editor],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!k) return;
      if (draggingRef.current) {
        editor.pointerMove(toImagePoint(e));
        return;
      }
      // Không kéo → chỉ dò xem con trỏ có đang ở trên thẻ kéo để đổi con trỏ chuột.
      const pt = toImagePoint(e);
      withCtx((ctx) => setHoveringMove(editor.moveHandleHitId(ctx, pt, k) !== null));
    },
    [k, toImagePoint, withCtx, editor],
  );

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
    editor.pointerUp();
  }, [editor]);

  /**
   * Esc bóc từng lớp, KHÔNG đóng thẳng khung xem (lightbox chặn Esc khi đang vẽ):
   *   1. đang gõ chữ / đang kéo hình → đóng ô soạn, bỏ hình dở
   *   2. không còn gì dở dang        → thoát chế độ vẽ, y như bấm nút Hủy
   *   3. (đã ra khỏi chế độ vẽ)      → lần bấm sau mới đóng khung xem
   *
   * Bậc 1 của ô soạn chữ do chính `onKeyDown` của textarea lo, không tới được đây.
   * CỐ Ý không có bậc "bỏ chọn": vẽ xong object nào là nó tự được chọn, thêm bậc đó thì
   * lần nào cũng phải bấm dư một cái mới thoát được.
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (editing) return; // đang gõ chữ — phím thuộc về textarea
      if (e.key === 'Escape') {
        e.preventDefault();
        if (draft) cancelDraft();
        else onCancel();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editing, draft, cancelDraft, deleteSelected, undo, onCancel]);

  /**
   * Focus ô soạn chữ ở frame SAU khi nó mount, không dùng `autoFocus`.
   * `autoFocus` chạy ngay trong lượt commit — tức là TRƯỚC khi trình duyệt kịp xử lý xong cú
   * bấm chuột — nên rất dễ bị cướp focus. `readyRef` chặn `onBlur` trong khoảng đó, nếu không
   * ô chữ vừa hiện đã tự đóng và shape rỗng bị xoá.
   */
  const readyRef = useRef(false);
  useEffect(() => {
    readyRef.current = false;
    if (!editingId) return;
    const id = requestAnimationFrame(() => {
      const el = textRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length); // sửa tiếp là gõ nối, không đè
      }
      readyRef.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [editingId]);

  const handleTextBlur = useCallback(() => {
    if (readyRef.current) editor.commitEditing();
  }, [editor]);

  const handleSave = useCallback(async () => {
    editor.commitEditing(); // chữ đang gõ dở vẫn phải được nung vào ảnh
    setFlattening(true);
    try {
      const file = await flattenAnnotations({ source, shapes: editor.shapes, fileName });
      onSave({ file, shapes: editor.shapes });
    } catch (e) {
      showToast('error', 'Không lưu được ảnh đã chú thích', { description: (e as Error).message });
    } finally {
      setFlattening(false);
    }
  }, [source, fileName, editor, onSave]);

  /** Bấm đúp lên chữ để sửa nội dung — không cần chọn trước, và ở tool nào cũng được. */
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!k) return;
      e.preventDefault();
      e.stopPropagation();
      const pt = toImagePoint(e);
      withCtx((ctx) => {
        const target = editor.textAt(ctx, pt, k);
        if (target) editor.startEditText(target);
      });
    },
    [k, toImagePoint, withCtx, editor],
  );

  const busy = saving || flattening;
  // Thẻ kéo được ưu tiên hơn tool, nên con trỏ cũng phải báo đúng thứ sắp xảy ra.
  const cursor = hoveringMove
    ? 'cursor-move'
    : tool === 'text'
      ? 'cursor-text'
      : 'cursor-crosshair';

  const boxStyle = useMemo(
    () =>
      layout
        ? {
            width: layout.width,
            height: layout.height,
            transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          }
        : undefined,
    [layout, rotation],
  );

  return (
    <>
      {layout && bitmap ? (
        // Hộp xoay cùng cỡ hiển thị — canvas và ô soạn chữ nằm chung hệ toạ độ nên
        // chữ luôn dính đúng chỗ kể cả khi ảnh đang xoay.
        <div className="absolute left-1/2 top-1/2" style={boxStyle}>
          <canvas
            ref={canvasRef}
            className={cn('block size-full touch-none select-none', cursor)}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={handleDoubleClick}
            onPointerCancel={handlePointerUp}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />

          {editing && (
            <textarea
              ref={textRef}
              className="absolute z-10 resize-none overflow-hidden border border-primary-5 bg-neutral-10/80 p-0 outline-none"
              placeholder="Nhập chữ…"
              rows={Math.max(editing.text.split('\n').length, 1)}
              style={{
                left: editing.x * k,
                top: editing.y * k,
                fontSize: editing.fontSize * k,
                lineHeight: LINE_HEIGHT_RATIO,
                fontFamily: FONT_FAMILY,
                fontWeight: 600,
                color: editing.color,
                minWidth: 120,
              }}
              value={editing.text}
              onBlur={handleTextBlur}
              onChange={(e) => editor.changeEditingText(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation(); // Delete/Backspace là để sửa chữ, không phải xoá nét
                if (e.key === 'Escape') editor.commitEditing();
              }}
              onPointerDown={(e) => e.stopPropagation()}
            />
          )}
        </div>
      ) : (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Spinner />
        </div>
      )}

      {/*
        `fixed` — thanh công cụ phải đứng yên khi vùng xem cuộn (zoom vượt khung).
        Đặt trên thanh zoom của lightbox (bottom-6, cao ~44px).
      */}
      <div
        className="fixed bottom-[4.75rem] left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 border border-border-2 bg-bg-popup px-2 py-1 shadow-[0_4px_16px_var(--color-popup-shadow)] backdrop-blur-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <AnnotatorToolbar disabled={!bitmap || busy} editor={editor} />
        <span className="h-6 w-px bg-border-2" />
        <Button disabled={busy} size="sm" skin="neutral" variant="ghost" onClick={onCancel}>
          Hủy
        </Button>
        <Button disabled={!bitmap} loading={busy} size="sm" variant="primary" onClick={handleSave}>
          Lưu
        </Button>
      </div>
    </>
  );
};
