import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { useBreakpoint } from '@/shared/theme';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { showToast } from '@/shared/utils/toast.utils';

import type { StudyItemType } from '../api/study.types';
import { ConflictDialog } from '../components/editor/ConflictDialog';
import { CsvImportSheet } from '../components/editor/CsvImportSheet';
import { EditorExitDialog } from '../components/editor/EditorExitDialog';
import { EditorFormPane } from '../components/editor/EditorFormPane';
import { EditorGate } from '../components/editor/EditorGate';
import { EditorListPane } from '../components/editor/EditorListPane';
import { ItemTypePicker } from '../components/editor/ItemTypePicker';
import { UnsavedBar } from '../components/editor/UnsavedBar';
import { useEditorMediaSync } from '../hooks/useEditorMediaSync';
import { useSetEditor } from '../hooks/useSetEditor';
import { useSetEditorStore } from '../store/set-editor.store';
import { hapticSaved, hapticTap } from '../utils/editor-haptics';
import { itemScopePrefix, setSlotAsset } from '../utils/media-slots';
import { dismissUploadsWithPrefix } from '../utils/upload-slots';

/**
 * Trình soạn mục (app.md p4-01 §3 `SetEditor`). Điện thoại: danh sách → chạm mở form TOÀN MÀN (nút "Xong" về danh sách); tablet: hai
 * cột (danh sách trái, form phải — chưa chọn mục thì cột phải mời chọn). Thay đổi gom vào NHÁP (bộ nhớ) rồi lưu MỘT lần (`PUT items`,
 * một transaction): lỗi `STUDY_001` gắn theo mục (huy hiệu "Cần sửa", nhảy tới mục đầu tiên lỗi), `409` mở hộp thoại xung đột, rời màn khi
 * còn thay đổi → "Bỏ thay đổi?". Ảnh/âm thanh của mục và lựa chọn tải qua hàng đợi upload scope `STUDY` (`useEditorMediaSync` ghi asset
 * READY vào nháp; còn tệp đang tải/lỗi thì khoá Lưu). "Nhập từ CSV" thêm hàng loạt thẻ ghi nhớ vào nháp.
 *
 * "Thêm mục" nằm ở thanh dưới (`UnsavedBar`, màn danh sách): trong tầm ngón cái, luôn thấy. Thêm/lưu có rung nhẹ (`editor-haptics`);
 * lưu xong có toast. Màn chỉ ĐIỀU PHỐI — từng trạng thái/khối hiển thị nằm ở `components/editor/*`.
 */
export function SetEditorScreen() {
  const { setId } = useLocalSearchParams<{ setId: string }>();
  const editor = useSetEditor(setId);
  const { isTablet } = useBreakpoint();
  const offline = useConnectionState() === 'offline';
  const [selectedKey, setSelectedKey] = useState<string | undefined>();
  const [picking, setPicking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const media = useEditorMediaSync(setId, (itemKey, slot, assetId) =>
    editor.patch(itemKey, (item) => setSlotAsset(item, slot, assetId)),
  );

  const draft = editor.draft;
  const selected = selectedKey && draft?.items[selectedKey] ? draft.items[selectedKey] : undefined;
  const editable = editor.set?.myPermissions.edit === true && editor.set.status === 'ACTIVE';
  const full = editor.itemCount >= editor.limits.itemsPerSetMax;

  function leave(): void {
    // Bỏ nháp = bỏ luôn tệp còn tải (nếu không, chúng tải xong rồi ghi vào một bộ mà nháp đã mất).
    dismissUploadsWithPrefix(itemScopePrefix(setId));
    useSetEditorStore.getState().drop(setId);
    router.back();
  }
  const back = () =>
    selected && !isTablet
      ? setSelectedKey(undefined)
      : editor.changeCount > 0
        ? setConfirmExit(true)
        : leave();

  function saved(): void {
    hapticSaved();
    showToast('success', 'Đã lưu bộ học.');
  }
  async function save(): Promise<void> {
    const outcome = await editor.save();
    if (outcome.ok) saved();
    else if (outcome.firstBadKey) setSelectedKey(outcome.firstBadKey);
  }
  async function keepAndRetry(): Promise<void> {
    if ((await editor.keepAndRetry()).ok) saved();
  }

  const add = (type: StudyItemType, afterKey?: string | null) => {
    if (full) return;
    hapticTap();
    setSelectedKey(editor.add(type, afterKey));
  };

  return (
    <Screen
      constrained={false}
      header={
        <AppBar title={selected && !isTablet ? 'Sửa mục' : 'Nội dung bộ học'} onBack={back} />
      }
      padded={false}
      scrollable={false}
    >
      <EditorGate
        editable={editable}
        hasSet={Boolean(editor.set)}
        isLoading={editor.isLoading}
        loadError={editor.loadError}
        onRetry={editor.reload}
      >
        <View className="flex-1">
          <View className="flex-1 flex-row">
            {isTablet || !selected ? (
              <View className={isTablet ? 'flex-1 border-r border-r-divider-1' : 'flex-1'}>
                {draft ? (
                  <EditorListPane
                    draft={draft}
                    problems={editor.problems}
                    selectedKey={selectedKey}
                    serverErrors={editor.serverErrors}
                    onAdd={() => setPicking(true)}
                    onImport={() => setImporting(true)}
                    onMove={editor.move}
                    onQuickAdd={add}
                    onSelect={setSelectedKey}
                  />
                ) : null}
              </View>
            ) : null}
            {isTablet || selected ? (
              <View className={isTablet ? 'flex-[1.3]' : 'flex-1'}>
                <EditorFormPane
                  canAddNext={!full}
                  item={selected}
                  limits={editor.limits}
                  problems={selected ? (editor.problems[selected.clientItemKey] ?? []) : []}
                  serverErrors={selected ? editor.serverErrors[selected.clientItemKey] : undefined}
                  setId={setId}
                  onAddNext={() => selected && add(selected.type, selected.clientItemKey)}
                  onChange={(update) => selected && editor.patch(selected.clientItemKey, update)}
                  onDone={() => setSelectedKey(undefined)}
                  onRemove={() => {
                    if (!selected) return;
                    editor.remove(selected.clientItemKey);
                    setSelectedKey(undefined);
                  }}
                />
              </View>
            ) : null}
          </View>
          <UnsavedBar
            addDisabled={full}
            banner={editor.banner}
            changeCount={editor.changeCount}
            mediaFailed={media.failed}
            mediaPending={media.pending}
            offline={offline}
            saving={editor.saving}
            onAdd={isTablet || !selected ? () => setPicking(true) : undefined}
            onSave={() => void save()}
          />
        </View>
      </EditorGate>

      <ItemTypePicker
        visible={picking}
        onClose={() => setPicking(false)}
        onPick={(type) => add(type)}
      />
      <CsvImportSheet
        capacity={Math.max(0, editor.limits.itemsPerSetMax - editor.itemCount)}
        limits={editor.limits}
        visible={importing}
        onClose={() => setImporting(false)}
        onImport={(cards) => {
          const count = editor.importFlashcards(cards);
          hapticTap();
          showToast('success', `Đã thêm ${count} thẻ. Bấm Lưu để lưu vào bộ.`);
        }}
      />
      <ConflictDialog
        busy={editor.saving}
        visible={editor.conflict}
        onClose={editor.dismissConflict}
        onKeep={() => void keepAndRetry()}
        onReload={() => void editor.discardAndReload()}
      />
      <EditorExitDialog
        visible={confirmExit}
        onClose={() => setConfirmExit(false)}
        onDiscard={() => {
          setConfirmExit(false);
          leave();
        }}
      />
    </Screen>
  );
}
