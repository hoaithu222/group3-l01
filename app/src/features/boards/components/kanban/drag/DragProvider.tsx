import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import type { BoardColumn } from '../../../api/boards.types';
import { AUTO_SCROLL_ARM_DISTANCE, AUTO_SCROLL_EDGE, AUTO_SCROLL_MAX_STEP } from '../../../constants/kanban.constants';
import type { MoveTaskInput } from '../../../hooks/useMoveTask';
import { armedStep, edgeScrollStep } from './auto-scroll';
import { DragContext } from './drag-context';
import type { ColumnHandle, DragContextValue, DragSession, PagerHandle } from './drag.types';
import { findColumnAt, isSamePlace, resolveDropTarget, type ColumnBox, type Point } from './drop-target';

const TICK_MS = 32;

export interface DragProviderProps {
  children: ReactNode;
  columns: readonly BoardColumn[];
  /** Tắt hẳn kéo thả: chế độ `off`, mất mạng, không có quyền, bảng lưu trữ… */
  enabled: boolean;
  /** `true` = chỉ thả trong cột nguồn (điện thoại nếu spike không đạt, README §10). */
  withinColumnOnly: boolean;
  onMove: (input: MoveTaskInput) => void;
}

/**
 * Điều phối kéo thả kiểu Trello (`app.md` §2 `DragProvider`): giữ thẻ đang nâng,
 * đo cột lúc thả, tính chỗ đến bằng hàm thuần `resolveDropTarget`, tự cuộn ở mép.
 *
 * ⚠️ CHƯA ĐO trên thiết bị (README p3-02 §9 việc #0). Thiết kế cố ý GIỮ CHI PHÍ
 * MỖI KHUNG HÌNH NHỎ: vị trí ngón tay ghi thẳng vào shared value (luồng UI);
 * chỉ một lần nhảy về JS khi bắt đầu, khi thả, và ~20 lần/giây cho `moved`.
 *
 * ⛔ Vì sao đo cột bằng `measureInWindow` LÚC THẢ chứ không lưu sẵn: pager điện
 * thoại cuộn ngang (kể cả tự lật cột khi kéo) nên toạ độ x của cột đổi liên tục;
 * đo lại đúng lúc thả cho kết quả đúng mà không phải cộng trừ độ lệch.
 */
export function DragProvider({ children, columns, enabled, withinColumnOnly, onMove }: DragProviderProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [session, setSession] = useState<DragSession | null>(null);
  const [hoverColumnId, setHoverColumnId] = useState<string | null>(null);
  const rootRef = useRef<View>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const pointerRef = useRef<Point>({ x: 0, y: 0 });
  /** Điểm nhấc thẻ — mép chỉ tự cuộn khi ngón tay đã dịch về phía nó (`armedStep`). */
  const liftRef = useRef<Point>({ x: 0, y: 0 });
  const columnsRef = useRef(new Map<string, ColumnHandle>());
  const pagerRef = useRef<PagerHandle | null>(null);
  const boxesRef = useRef<{ boxes: ColumnBox[]; pagerX: number }>({ boxes: [], pagerX: 0 });

  const shared = {
    grabX: useSharedValue(0),
    grabY: useSharedValue(0),
    originX: useSharedValue(0),
    originY: useSharedValue(0),
    visible: useSharedValue(0),
    x: useSharedValue(0),
    y: useSharedValue(0),
  };

  const measureAll = async (): Promise<ColumnBox[]> => {
    const boxes = await Promise.all([...columnsRef.current.values()].map((handle) => handle.measure()));
    return boxes.filter((box): box is ColumnBox => box !== null);
  };

  const finish = () => {
    sessionRef.current = null;
    shared.visible.set(0);
    setSession(null);
    setHoverColumnId(null);
    pagerRef.current?.settle();
  };

  const begin = async (task: DragSession['task'], fromColumnId: string, point: Point) => {
    if (!enabled || sessionRef.current) return;
    // Giữ chỗ NGAY để một cú chạm thứ hai không nâng thêm thẻ trong lúc đo.
    sessionRef.current = { fromColumnId, height: 0, task, width: 0 };
    pointerRef.current = point;
    liftRef.current = point;
    shared.x.set(point.x);
    shared.y.set(point.y);

    // Hộp thẻ = hộp cột + vị trí thẻ trong list − độ cuộn. Chỉ đo cột NGUỒN trước để lớp phủ
    // hiện sớm (mục tiêu nhấc thẻ < 100 ms); các cột còn lại đo sau, phục vụ tự cuộn.
    const own = await columnsRef.current.get(fromColumnId)?.measure();
    const card = own?.cards.find((item) => item.id === task.id);
    if (!own || !card || sessionRef.current?.task.id !== task.id) {
      finish();
      return;
    }
    const rect = {
      height: card.height,
      width: own.width,
      x: own.left,
      y: own.top + card.top - own.scrollY,
    };
    shared.grabX.set(point.x - rect.x);
    shared.grabY.set(point.y - rect.y);
    const next: DragSession = { fromColumnId, height: rect.height, task, width: rect.width };
    sessionRef.current = next;
    setSession(next);
    // Gốc của provider trong cửa sổ (AppBar/bộ lọc đẩy nó xuống) — đo xong mới hiện lớp phủ.
    rootRef.current?.measureInWindow((ox, oy) => {
      shared.originX.set(ox);
      shared.originY.set(oy);
      shared.visible.set(1);
    });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const boxes = await measureAll();
    boxesRef.current = { boxes, pagerX: pagerRef.current?.getOffsetX() ?? 0 };
  };

  const end: DragContextValue['end'] = async (point) => {
    const current = sessionRef.current;
    if (!current) return;
    try {
      const boxes = await measureAll();
      const scoped = withinColumnOnly ? boxes.filter((box) => box.columnId === current.fromColumnId) : boxes;
      const target = resolveDropTarget(point, scoped, current.task.id);
      const column = target ? columns.find((item) => item.id === target.columnId) : undefined;
      if (!target || !column) return;
      const fromIds = boxes.find((box) => box.columnId === current.fromColumnId)?.cards.map((card) => card.id) ?? [];
      if (isSamePlace(current.fromColumnId, fromIds, current.task.id, target)) return;
      onMove({
        afterTaskId: target.afterTaskId,
        beforeTaskId: target.beforeTaskId,
        columnId: target.columnId,
        columnKind: column.kind,
        task: current.task,
      });
      void Haptics.selectionAsync();
    } finally {
      finish();
    }
  };

  // Tự cuộn khi thẻ sát mép: ngang (lật cột) nhìn theo bề rộng cửa sổ, dọc theo cột dưới ngón tay. Mép chỉ cuộn khi ngón tay đã
  // dịch VỀ PHÍA nó từ điểm nhấc (`armedStep`); chế độ chỉ-trong-cột thì không lật cột và chỉ xét cột nguồn — cùng luật với `end`.
  useEffect(() => {
    if (!session) return undefined;
    const step = (pointer: number, min: number, max: number, travelled: number) =>
      armedStep(edgeScrollStep(pointer, min, max, AUTO_SCROLL_EDGE, AUTO_SCROLL_MAX_STEP), travelled, AUTO_SCROLL_ARM_DISTANCE);
    const timer = setInterval(() => {
      const { x, y } = pointerRef.current;
      const lift = liftRef.current;
      const pager = pagerRef.current;
      const dx = withinColumnOnly ? 0 : step(x, 0, windowWidth, x - lift.x);
      if (dx !== 0) pager?.scrollBy(dx);
      const shift = (pager?.getOffsetX() ?? 0) - boxesRef.current.pagerX;
      const boxes = boxesRef.current.boxes.filter((box) => !withinColumnOnly || box.columnId === session.fromColumnId);
      const under = findColumnAt(x, boxes.map((box) => ({ ...box, left: box.left - shift })));
      // Cùng giá trị thì React bỏ qua — chỉ vẽ lại lớp phủ khi ngón tay SANG cột khác (gợi ý vùng thả, p4-05).
      setHoverColumnId(under?.columnId ?? null);
      if (!under) return;
      const dy = step(y, under.top, under.top + under.height, y - lift.y);
      if (dy !== 0) columnsRef.current.get(under.columnId)?.scrollBy(dy);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [session, windowWidth, withinColumnOnly]);

  // Chỉ đụng tới ref ⇒ giữ tham chiếu ổn định để cột/pager không đăng ký lại mỗi lần provider vẽ lại.
  const registerColumn = useCallback<DragContextValue['registerColumn']>((columnId, handle) => {
    columnsRef.current.set(columnId, handle);
    return () => {
      if (columnsRef.current.get(columnId) === handle) columnsRef.current.delete(columnId);
    };
  }, []);
  const registerPager = useCallback<DragContextValue['registerPager']>((handle) => {
    pagerRef.current = handle;
  }, []);

  const value: DragContextValue = {
    begin: (task, fromColumnId, point) => void begin(task, fromColumnId, point),
    cancel: finish,
    enabled,
    end: (point) => void end(point),
    hoverColumnId,
    moved: (point) => {
      pointerRef.current = point;
    },
    registerColumn,
    registerPager,
    session,
    shared,
  };

  return (
    <DragContext value={value}>
      <View ref={rootRef} className="flex-1">
        {children}
      </View>
    </DragContext>
  );
}
