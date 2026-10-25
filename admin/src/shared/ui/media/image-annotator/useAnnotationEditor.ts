/**
 * Máy trạng thái của editor chú thích ảnh: danh sách shape, công cụ, tương tác chuột, undo.
 * KHÔNG đụng DOM — component canvas quy đổi toạ độ màn hình → toạ độ ảnh rồi gọi vào đây.
 */
import { useCallback, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_COLOR,
  DEFAULT_SIZE_STEP,
  baseFontSize,
  baseLineWidth,
  type Bounds,
  type Point,
  type Shape,
  type TextShape,
  type Tool,
} from './annotation.types';
import { shapeBounds } from './draw-shapes';
import { ellipseFromDrag, handleAt, hitTest, moveHandleAt } from './hit-test';

/** Kéo ngắn hơn ngần này (px ảnh) coi như bấm nhầm, không tạo ellipse. */
const MIN_RADIUS = 4;

/** Bán kính bấm trúng handle, tính bằng px MÀN HÌNH (chia `scale` để ra px ảnh). */
const HIT_TOLERANCE_PX = 9;

/**
 * `origin` = bản chụp shape lúc BẮT ĐẦU kéo. Mọi phép cập nhật đều tính từ nó chứ không từ
 * `selected` — `selected` đọc qua state nên có thể còn cũ ở event đầu tiên sau khi vừa chọn.
 */
/** Cỡ chữ nhỏ hơn ngần này (px ảnh) là không đọc nổi — chặn kéo thu về 0. */
const MIN_FONT_SIZE = 8;

type Drag =
  | { mode: 'draw'; start: Point }
  // `snapped` — đã chụp lịch sử chưa. Chụp ở lần DI CHUYỂN đầu tiên chứ không phải lúc bấm:
  // bấm vào thẻ rồi thả ra mà vẫn tạo mốc undo thì nút Hoàn tác bấm sẽ như không có tác dụng.
  | { mode: 'move'; start: Point; origin: Shape; snapped: boolean }
  | {
      mode: 'resize';
      /** Góc ĐỐI DIỆN handle đang kéo — đứng yên suốt thao tác. */
      anchor: Point;
      origin: Shape;
      /** Hộp bao lúc bắt đầu — chụp sẵn vì `pointerMove` không có `ctx` để đo lại chữ. */
      originBounds: Bounds;
      /** Neo nằm ở mép phải / mép dưới → góc trên-trái của chữ phải lùi lại khi phóng to. */
      anchorRight: boolean;
      anchorBottom: boolean;
      snapped: boolean;
    };

export interface UseAnnotationEditorOptions {
  /** Bề ngang ảnh gốc — quyết định độ dày nét / cỡ chữ mặc định. 0 khi ảnh chưa tải xong. */
  naturalWidth: number;
  /** Chiều cao ảnh gốc — để kẹp thẻ kéo của shape nằm sát đáy. */
  naturalHeight: number;
  initialShapes?: Shape[];
}

const newId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const useAnnotationEditor = ({
  naturalWidth,
  naturalHeight,
  initialShapes = [],
}: UseAnnotationEditorOptions) => {
  const [shapes, setShapes] = useState<Shape[]>(initialShapes);
  const [tool, setTool] = useState<Tool>('ellipse');
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [sizeStep, setSizeStep] = useState<number>(DEFAULT_SIZE_STEP);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** Ellipse đang kéo — vẽ preview, chưa nằm trong `shapes`. */
  const [draft, setDraft] = useState<Shape | null>(null);
  /** Ô soạn chữ đang mở (overlay `<textarea>` do canvas render). */
  const [editingId, setEditingId] = useState<string | null>(null);

  const dragRef = useRef<Drag | null>(null);
  const historyRef = useRef<Shape[][]>([]);
  const [historyDepth, setHistoryDepth] = useState(0);

  const lineWidth = baseLineWidth(naturalWidth) * sizeStep;
  const fontSize = baseFontSize(naturalWidth) * sizeStep;

  const selected = useMemo(
    () => shapes.find((s) => s.id === selectedId) ?? null,
    [shapes, selectedId],
  );
  const editing = useMemo(
    () => shapes.find((s): s is TextShape => s.id === editingId && s.kind === 'text') ?? null,
    [shapes, editingId],
  );

  /** Chụp trạng thái TRƯỚC khi đổi — gọi một lần mỗi thao tác, không gọi trong pointerMove. */
  const snapshot = useCallback(() => {
    historyRef.current = [...historyRef.current, shapes].slice(-30);
    setHistoryDepth(historyRef.current.length);
  }, [shapes]);

  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    setHistoryDepth(historyRef.current.length);
    if (!prev) return;
    setShapes(prev);
    setSelectedId(null);
    setEditingId(null);
  }, []);

  const patchShape = useCallback((id: string, next: Shape) => {
    setShapes((prev) => prev.map((s) => (s.id === id ? next : s)));
  }, []);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    snapshot();
    setShapes((prev) => prev.filter((s) => s.id !== selectedId));
    setSelectedId(null);
    setEditingId(null);
  }, [selectedId, snapshot]);

  const clearAll = useCallback(() => {
    if (!shapes.length) return;
    snapshot();
    setShapes([]);
    setSelectedId(null);
    setEditingId(null);
  }, [shapes.length, snapshot]);

  /** Đổi màu/cỡ áp NGAY cho shape đang chọn, ngoài ra làm mặc định cho shape kế tiếp. */
  const applyColor = useCallback(
    (next: string) => {
      setColor(next);
      if (!selected) return;
      snapshot();
      patchShape(selected.id, { ...selected, color: next });
    },
    [selected, snapshot, patchShape],
  );

  const applySizeStep = useCallback(
    (step: number) => {
      setSizeStep(step);
      if (!selected) return;
      snapshot();
      patchShape(
        selected.id,
        selected.kind === 'ellipse'
          ? { ...selected, lineWidth: baseLineWidth(naturalWidth) * step }
          : { ...selected, fontSize: baseFontSize(naturalWidth) * step },
      );
    },
    [selected, naturalWidth, snapshot, patchShape],
  );

  const startEditText = useCallback((shape: TextShape) => {
    setSelectedId(shape.id);
    setEditingId(shape.id);
  }, []);

  const changeEditingText = useCallback(
    (value: string) => {
      if (!editing) return;
      patchShape(editing.id, { ...editing, text: value });
    },
    [editing, patchShape],
  );

  /** Kết thúc soạn chữ — chuỗi rỗng thì bỏ luôn shape để không để lại điểm vô hình. */
  const commitEditing = useCallback(() => {
    if (!editing) return;
    if (!editing.text.trim()) {
      setShapes((prev) => prev.filter((s) => s.id !== editing.id));
      setSelectedId(null);
    }
    setEditingId(null);
  }, [editing]);

  /** Shape có thẻ kéo dưới con trỏ — dùng cho con trỏ hover, không đổi state. */
  const moveHandleHitId = useCallback(
    (ctx: CanvasRenderingContext2D, pt: Point, scale: number) =>
      moveHandleAt(ctx, shapes, pt, scale, naturalHeight)?.id ?? null,
    [shapes, naturalHeight],
  );

  /**
   * Thao tác trên object có sẵn LUÔN được ưu tiên hơn tool đang chọn — nhờ vậy không cần
   * chế độ "Chọn" riêng: đang vẽ khoanh vẫn kéo/đổi cỡ được object cũ mà không phải đổi tool.
   */
  const pointerDown = useCallback(
    (ctx: CanvasRenderingContext2D, pt: Point, scale: number) => {
      if (editing) commitEditing();
      const tol = HIT_TOLERANCE_PX / scale;

      // 1) Thẻ kéo — bấm là chọn, kéo là di chuyển. Đây là lối DUY NHẤT để di chuyển:
      // kéo trên thân object không xê dịch nó, tránh lỡ tay khi đang vẽ.
      const grabbed = moveHandleAt(ctx, shapes, pt, scale, naturalHeight);
      if (grabbed) {
        setSelectedId(grabbed.id);
        dragRef.current = { mode: 'move', start: pt, origin: grabbed, snapped: false };
        return;
      }

      // 2) Handle góc của object đang chọn → đổi kích thước (ellipse: bán kính · chữ: cỡ chữ).
      const handle = handleAt(ctx, selected, pt, tol);
      if (handle && selected) {
        const b = shapeBounds(ctx, selected);
        const anchorRight = handle === 'nw' || handle === 'sw';
        const anchorBottom = handle === 'nw' || handle === 'ne';
        dragRef.current = {
          mode: 'resize',
          anchor: {
            x: anchorRight ? b.x + b.width : b.x,
            y: anchorBottom ? b.y + b.height : b.y,
          },
          origin: selected,
          originBounds: b,
          anchorRight,
          anchorBottom,
          snapped: false,
        };
        return;
      }

      // 3) Chỗ trống → tool ra tay.
      if (tool === 'text') {
        // Bấm trúng chữ có sẵn → sửa nó, đừng đẻ chữ rỗng đè lên. (Bấm trúng ellipse thì vẫn
        // tạo chữ mới — đặt nhãn vào trong vòng khoanh là ca dùng thường gặp.)
        const existing = hitTest(ctx, shapes, pt, tol);
        if (existing?.kind === 'text') {
          startEditText(existing);
          return;
        }
        snapshot();
        const shape: TextShape = {
          id: newId(),
          kind: 'text',
          color,
          x: pt.x,
          y: pt.y,
          text: '',
          fontSize,
        };
        setShapes((prev) => [...prev, shape]);
        startEditText(shape);
        return;
      }

      dragRef.current = { mode: 'draw', start: pt };
      setSelectedId(null);
    },
    [
      tool,
      color,
      fontSize,
      editing,
      commitEditing,
      selected,
      shapes,
      naturalHeight,
      snapshot,
      startEditText,
    ],
  );

  /** Chữ dưới con trỏ — bấm đúp để sửa nội dung, không cần chọn trước. */
  const textAt = useCallback(
    (ctx: CanvasRenderingContext2D, pt: Point, scale: number) => {
      const hit = hitTest(ctx, shapes, pt, HIT_TOLERANCE_PX / scale);
      return hit?.kind === 'text' ? hit : null;
    },
    [shapes],
  );

  const pointerMove = useCallback(
    (pt: Point) => {
      const drag = dragRef.current;
      if (!drag) return;

      if (drag.mode === 'draw') {
        setDraft({
          id: 'draft',
          kind: 'ellipse',
          color,
          lineWidth,
          ...ellipseFromDrag(drag.start, pt),
        });
        return;
      }

      // Lần di chuyển đầu tiên mới ghi mốc undo — `shapes` trong closure lúc này vẫn là
      // trạng thái TRƯỚC khi kéo, đúng cái cần khôi phục.
      if (!drag.snapped) {
        snapshot();
        drag.snapped = true;
      }

      if (drag.mode === 'resize') {
        const { origin, anchor, originBounds } = drag;
        if (origin.kind === 'ellipse') {
          patchShape(origin.id, { ...origin, ...ellipseFromDrag(anchor, pt) });
          return;
        }
        // Chữ: bề rộng do glyph quyết định nên không kéo tự do được — lấy tỉ lệ theo CHIỀU CAO
        // rồi scale cỡ chữ, bề rộng tự co theo. Góc neo phải đứng yên nên góc trên-trái phải bù.
        if (originBounds.height <= 0) return;
        const ratio = Math.abs(pt.y - anchor.y) / originBounds.height;
        const fontSize = Math.max(origin.fontSize * ratio, MIN_FONT_SIZE);
        const scaled = fontSize / origin.fontSize;
        patchShape(origin.id, {
          ...origin,
          fontSize,
          x: drag.anchorRight ? anchor.x - originBounds.width * scaled : anchor.x,
          y: drag.anchorBottom ? anchor.y - originBounds.height * scaled : anchor.y,
        });
        return;
      }

      const dx = pt.x - drag.start.x;
      const dy = pt.y - drag.start.y;
      const origin = drag.origin;
      patchShape(
        origin.id,
        origin.kind === 'ellipse'
          ? { ...origin, cx: origin.cx + dx, cy: origin.cy + dy }
          : { ...origin, x: origin.x + dx, y: origin.y + dy },
      );
    },
    [color, lineWidth, patchShape, snapshot],
  );

  /** Bỏ hình đang kéo dở giữa chừng (Esc). Xoá cả `dragRef` để pointerMove không dựng lại nó. */
  const cancelDraft = useCallback(() => {
    dragRef.current = null;
    setDraft(null);
  }, []);

  const pointerUp = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.mode !== 'draw') return;

    const shape = draft;
    setDraft(null);
    if (!shape || shape.kind !== 'ellipse') return;
    if (shape.rx < MIN_RADIUS || shape.ry < MIN_RADIUS) return; // bấm nhầm, không phải kéo

    snapshot();
    const committed = { ...shape, id: newId() };
    setShapes((prev) => [...prev, committed]);
    setSelectedId(committed.id);
  }, [draft, snapshot]);

  return {
    shapes,
    draft,
    tool,
    setTool,
    color,
    setColor: applyColor,
    sizeStep,
    setSizeStep: applySizeStep,
    selected,
    selectedId,
    setSelectedId,
    editing,
    startEditText,
    changeEditingText,
    commitEditing,
    undo,
    canUndo: historyDepth > 0,
    deleteSelected,
    clearAll,
    pointerDown,
    pointerMove,
    pointerUp,
    cancelDraft,
    moveHandleHitId,
    textAt,
  };
};

export type AnnotationEditor = ReturnType<typeof useAnnotationEditor>;
