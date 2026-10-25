import { useMemo } from 'react';

import { useThemeColors } from '@/shared/theme';

import type { DraftStore } from '../canvas/draft-store';
import { useDraft } from '../canvas/draft-store';
import { createPaintKit, type PaintKit } from '../canvas/paint/paint-kit';
import { recordCursors, recordOverlay, recordScene } from '../canvas/paint/pictures';
import type { SkPicture, SkiaModule } from '../canvas/skia-module';
import type { RemotePeer } from '../collab/awareness-peers';
import type { WhiteboardElement } from '../engine';
import type { ElementsState } from './useWhiteboardElements';
import type { RenderView } from './useWhiteboardCamera';

export interface WhiteboardPictures {
  cursors: SkPicture | null;
  kit: PaintKit;
  overlay: SkPicture | null;
  scene: SkPicture | null;
}

export interface PicturesInput {
  canEdit: boolean;
  draftStore: DraftStore;
  peers: readonly RemotePeer[];
  selection: readonly string[];
  settledZoom: number;
  skia: SkiaModule;
  state: ElementsState;
  view: RenderView | null;
}

/**
 * Dựng ba `SkPicture` của canvas từ dữ liệu — CHỈ dựng lại khi dữ liệu thật sự đổi (khoá của `useMemo`), không phải mỗi lần render:
 *  · `scene` (nền + phần tử, culling theo `view.rect`) — đắt nhất; phụ thuộc phần tử, nền, tập id ẩn, vùng dựng, theme;
 *  · `overlay` (nháp + khung chọn + tay nắm) — nhẹ; đổi theo nháp/vùng chọn/zoom lắng;
 *  · `cursors` (người khác) — nhẹ; đổi theo awareness.
 * ⚠️ Tập id ẩn (`hiddenIds` của nháp) ĐỔI THAM CHIẾU ở mỗi lần rê dù nội dung y hệt, nên khoá theo CHUỖI id đã sắp: nếu không cảnh (đắt) bị dựng
 * lại ở MỖI lần rê ngón tay.
 */
export function useWhiteboardPictures(input: PicturesInput): WhiteboardPictures {
  const { canEdit, draftStore, peers, selection, settledZoom, skia, state, view } = input;
  const colors = useThemeColors();
  const kit = useMemo(() => createPaintKit(skia, colors), [skia, colors]);
  const draft = useDraft(draftStore);

  const hiddenKey = draft ? [...draft.hiddenIds].sort().join(',') : '';
  const hidden = useMemo(() => new Set(hiddenKey === '' ? [] : hiddenKey.split(',')), [hiddenKey]);
  const { background, byId, elements } = state;

  const scene = useMemo(
    () =>
      view ? recordScene(kit, { background, elements, hiddenIds: hidden, renderRect: view.rect, zoom: view.zoom }) : null,
    [kit, background, elements, hidden, view],
  );
  const selected = useMemo(
    () =>
      selection.flatMap((id): WhiteboardElement[] => {
        const el = byId.get(id);
        return el ? [el] : [];
      }),
    [selection, byId],
  );
  const overlay = useMemo(
    () => (view ? recordOverlay(kit, { draft, handles: canEdit, selected, zoom: settledZoom }) : null),
    [kit, draft, canEdit, selected, settledZoom, view],
  );
  const cursors = useMemo(
    () => (view && peers.length > 0 ? recordCursors(kit, peers, byId, settledZoom) : null),
    [kit, peers, byId, settledZoom, view],
  );

  return { cursors, kit, overlay, scene };
}
