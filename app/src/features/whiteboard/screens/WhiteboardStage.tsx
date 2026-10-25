import { router } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';

import { useBreakpoint } from '@/shared/theme';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { WhiteboardDetail } from '../api/whiteboard.types';
import { createDraftStore } from '../canvas/draft-store';
import { WhiteboardCanvas } from '../canvas/WhiteboardCanvas';
import type { SkiaModule } from '../canvas/skia-module';
import { CanvasHeaderActions } from '../components/CanvasHeaderActions';
import { FloatingToolbox } from '../components/FloatingToolbox';
import { SelectionBar } from '../components/SelectionBar';
import { SessionStatusRow } from '../components/SessionStatusRow';
import { StageSheets } from '../components/StageSheets';
import type { WhiteboardRuntime } from '../collab/whiteboard-runtime';
import { elementBounds, fitCamera, setBackground, unionRects } from '../engine';
import { useBoardMenu } from '../hooks/useBoardMenu';
import { useWhiteboardActions } from '../hooks/useWhiteboardActions';
import { useWhiteboardCamera } from '../hooks/useWhiteboardCamera';
import { useWhiteboardElements } from '../hooks/useWhiteboardElements';
import { useWhiteboardGestures } from '../hooks/useWhiteboardGestures';
import { useWhiteboardPictures } from '../hooks/useWhiteboardPictures';
import { useWhiteboardUiLifecycle } from '../hooks/useWhiteboardUiLifecycle';
import { useWhiteboardSessionStore } from '../store/whiteboard-session.store';
import { useWhiteboardUiStore } from '../store/whiteboard-ui.store';

export interface WhiteboardStageProps {
  board: WhiteboardDetail;
  canEdit: boolean;
  runtime: WhiteboardRuntime;
  skia: SkiaModule;
  wsId: string;
}

/** Còn ≤ 5% chỗ thì cảnh báo "sắp đầy" (WB-02: chặn cứng ở trần, cảnh báo sớm ở đây). */
const NEAR_LIMIT_RATIO = 0.95;

/**
 * Màn vẽ khi ĐÃ có Skia và phiên collab: nối dữ liệu (`useWhiteboardElements`) → ba picture (`useWhiteboardPictures`) → canvas, cử chỉ → engine
 * (`useWhiteboardActions`/`useWhiteboardGestures`) và các tấm. Viewer/bảng lưu trữ (`canEdit = false`): KHÔNG có thanh công cụ và `interaction = null` —
 * chỉ pan/zoom + xem con trỏ người khác (README §6). Thanh công cụ: hàng dưới đáy (điện thoại) / cột trái (≥ 600dp).
 * ⚠️ Chưa thử trên máy thật: cử chỉ, hiệu năng canvas (WB-04 ≥ 50 fps với 2000 phần tử), Apple Pencil — xem `app.md` §9.
 */
export function WhiteboardStage({ board, canEdit, runtime, skia, wsId }: WhiteboardStageProps) {
  const userId = useAuthStore((state) => state.user?.id);
  const { isTablet } = useBreakpoint();
  useWhiteboardUiLifecycle(userId);

  const draftStore = useMemo(() => createDraftStore(), []);
  const state = useWhiteboardElements(runtime.doc);
  const camera = useWhiteboardCamera(board.id, userId);
  const snapshot = useWhiteboardSessionStore((s) => s.snapshot);
  const peers = useWhiteboardSessionStore((s) => s.peers);
  const tokenProblem = useWhiteboardSessionStore((s) => s.failure?.code === 'TOKEN_FAILED');
  const selection = useWhiteboardUiStore((s) => s.selection);
  const tool = useWhiteboardUiStore((s) => s.tool);
  const limitReached = useWhiteboardUiStore((s) => s.limitReached);
  const textEdit = useWhiteboardUiStore((s) => s.textEdit);

  const pictures = useWhiteboardPictures({
    canEdit,
    draftStore,
    peers,
    selection,
    settledZoom: camera.settledZoom,
    skia,
    state,
    view: camera.view,
  });
  const actions = useWhiteboardActions({
    camera,
    canEdit,
    draftStore,
    measure: pictures.kit.measure,
    runtime,
    state,
  });
  const gesture = useWhiteboardGestures(camera, actions.makeInteraction);
  const menu = useBoardMenu(wsId, board.id);

  const count = state.elements.length;
  const nearLimit = count >= runtime.elementsMax * NEAR_LIMIT_RATIO;
  const fit = () => {
    camera.set(fitCamera(unionRects(state.elements.map(elementBounds)), camera.size()));
    camera.settle();
  };
  // Lần đồng bộ ĐẦU có nội dung: vừa khít bảng vào khung nhìn — trừ khi người dùng đã có góc nhìn riêng đã lưu.
  const fitted = useRef(false);
  useEffect(() => {
    if (fitted.current || !snapshot.everSynced || count === 0) return;
    fitted.current = true;
    if (camera.hasSavedViewport()) return;
    camera.set(fitCamera(unionRects(state.elements.map(elementBounds)), camera.size()));
    camera.settle();
  }, [camera, count, snapshot.everSynced, state.elements]);

  const editingText =
    textEdit?.mode === 'edit' ? (state.byId.get(textEdit.id)?.text ?? '') : '';
  const readOnly = !canEdit;
  const toolbox = canEdit ? (
    <FloatingToolbox
      canRedo={actions.canRedo}
      canUndo={actions.canUndo}
      creationDisabled={limitReached}
      tool={tool}
      vertical={isTablet}
      onRedo={actions.redo}
      onStyle={menu.style.open}
      onTool={(next) => useWhiteboardUiStore.getState().setTool(next)}
      onUndo={actions.undo}
    />
  ) : null;

  return (
    <Screen
      header={
        <AppBar
          actions={
            <CanvasHeaderActions
              background={state.background}
              board={board}
              canEdit={canEdit}
              onArchive={menu.archive.dialog.open}
              onBackground={(kind) => setBackground(runtime.doc, kind, runtime.writeContext())}
              onFit={fit}
              onHistory={menu.history}
              onRename={menu.rename.open}
              onRestore={menu.restore}
              onSaveVersion={menu.version.open}
              onShare={menu.share}
            />
          }
          title={board.name}
          onBack={router.back}
        />
      }
      padded={false}
      scrollable={false}
    >
      <SessionStatusRow
        archived={board.status === 'ARCHIVED'}
        full={limitReached}
        nearLimit={nearLimit}
        readOnly={readOnly}
        snapshot={snapshot}
        tokenProblem={tokenProblem}
      />
      <View className="flex-1 flex-col tablet:flex-row">
        {isTablet ? toolbox : null}
        <View className="flex-1">
          <WhiteboardCanvas
            camera={camera}
            elementCount={count}
            gesture={gesture}
            pictures={pictures}
            skia={skia}
          />
          {canEdit && selection.length > 0 ? (
            <SelectionBar
              onDelete={actions.remove}
              onDuplicate={actions.duplicate}
              onReorder={actions.reorder}
            />
          ) : null}
        </View>
        {isTablet ? null : toolbox}
      </View>
      <StageSheets actions={actions} board={board} editingText={editingText} menu={menu} />
    </Screen>
  );
}
