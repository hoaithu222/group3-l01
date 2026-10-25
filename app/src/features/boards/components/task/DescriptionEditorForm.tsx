import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { useThemeColor } from '@/shared/theme';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { KeyboardBar } from '@/shared/ui/keyboard';
import { Dialog } from '@/shared/ui/modal';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Tabs } from '@/shared/ui/tab';

import { FALLBACK_TASK_LIMITS } from '../../constants/task-detail.constants';
import { useDescriptionSave } from '../../hooks/useDescriptionSave';
import { applyFormat, type FormatKind, type TextSelection } from '../../utils/markdown-edit';
import { MarkdownView } from '../MarkdownView';

const TOOLS: { accessibilityLabel: string; kind: FormatKind; label: string }[] = [
  { accessibilityLabel: 'In đậm', kind: 'bold', label: 'B' },
  { accessibilityLabel: 'In nghiêng', kind: 'italic', label: 'I' },
  { accessibilityLabel: 'Danh sách', kind: 'list', label: '•' },
  { accessibilityLabel: 'Đoạn code', kind: 'code', label: '</>' },
];

export interface DescriptionEditorFormProps {
  boardId: string;
  initial: string;
  offline: boolean;
  taskId: string;
}

/**
 * Trình sửa mô tả toàn màn (app.md §3 DescriptionEditor): ô nhiều dòng, thanh chèn nhanh **B** _I_ • </> nằm
 * TRÊN bàn phím (`KeyboardBar`), tab "Xem trước" dựng bằng chính `MarkdownView`. Viết bằng `TextInput` trần:
 * đây là ô soạn văn bản dài không khung, `Input` là ô form. State CỤC BỘ đồng bộ theo từng phím (an toàn IME).
 * Đóng khi có thay đổi chưa lưu → hỏi bỏ; lưu 409 → hộp thoại "Giữ bản của tôi / Dùng bản mới".
 */
export function DescriptionEditorForm({
  boardId,
  initial,
  offline,
  taskId,
}: DescriptionEditorFormProps) {
  const [text, setText] = useState(initial);
  const [selection, setSelection] = useState<TextSelection>({
    end: initial.length,
    start: initial.length,
  });
  const [forced, setForced] = useState<TextSelection>();
  const [preview, setPreview] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const save = useDescriptionSave(boardId, taskId);
  const placeholderColor = useThemeColor('fg-2');

  const dirty = text !== initial;
  const overLimit = text.length > FALLBACK_TASK_LIMITS.descriptionMax;
  const close = () => router.back();

  const saveAndClose = async () => {
    if (await save.submit(text)) close();
  };

  const format = (kind: FormatKind) => {
    const result = applyFormat(text, selection, kind);
    setText(result.text);
    setForced(result.selection);
  };

  return (
    <Screen
      constrained={false}
      contentClassName="flex-1"
      header={
        <AppBar
          actions={
            <Button
              disabled={!dirty || overLimit || offline}
              label="Lưu"
              loading={save.saving}
              size="sm"
              onPress={() => void saveAndClose()}
            />
          }
          title="Sửa mô tả"
          onBack={() => (dirty ? setConfirmDiscard(true) : close())}
        />
      }
      padded={false}
      scrollable={false}
    >
      <View className="flex-1 gap-sm px-md">
        <Tabs
          items={[
            { key: 'edit', label: 'Soạn' },
            { key: 'preview', label: 'Xem trước' },
          ]}
          value={preview ? 'preview' : 'edit'}
          onChange={(key) => setPreview(key === 'preview')}
        />
        {offline ? <Alert description="Cần kết nối mạng để lưu mô tả." tone="warning" /> : null}
        {save.error ? <Alert description={save.error} tone="error" /> : null}

        {preview ? (
          <View className="flex-1">
            <MarkdownView source={text.trim() === '' ? '_Chưa có nội dung._' : text} />
          </View>
        ) : (
          <TextInput
            accessibilityLabel="Nội dung mô tả"
            className="flex-1 rounded-xs bg-bg-1 p-sm text-body-lg text-fg-1"
            multiline
            placeholder="Viết mô tả bằng Markdown: **đậm**, _nghiêng_, - danh sách, `code`…"
            placeholderTextColor={placeholderColor}
            selection={forced}
            textAlignVertical="top"
            value={text}
            onChangeText={setText}
            onSelectionChange={(event) => {
              setSelection(event.nativeEvent.selection);
              setForced(undefined);
            }}
          />
        )}
        <Text className={overLimit ? 'text-caption-sm text-error' : 'text-caption-sm text-fg-2'}>
          {`${text.length}/${FALLBACK_TASK_LIMITS.descriptionMax}`}
        </Text>
      </View>

      {preview ? null : (
        <KeyboardBar
          leading={
            <View className="flex-1 flex-row gap-xs">
              {TOOLS.map((tool) => (
                <Button
                  key={tool.kind}
                  accessibilityLabel={tool.accessibilityLabel}
                  label={tool.label}
                  size="sm"
                  variant="secondary"
                  onPress={() => format(tool.kind)}
                />
              ))}
            </View>
          }
        />
      )}

      <Dialog
        description="Mô tả đã được người khác sửa trong lúc bạn soạn. Bạn muốn giữ bản của mình (ghi đè) hay dùng bản mới?"
        primaryAction={{
          label: 'Giữ bản của tôi',
          loading: save.saving,
          onPress: () => {
            save.dismissConflict();
            void saveAndClose();
          },
        }}
        secondaryAction={{
          label: 'Dùng bản mới',
          onPress: () => {
            setText(save.remoteDescription());
            save.dismissConflict();
          },
        }}
        title="Mô tả đã được người khác sửa"
        variant="warning"
        visible={save.conflict}
        onClose={save.dismissConflict}
      />
      <Dialog
        description="Các thay đổi chưa lưu sẽ bị mất."
        primaryAction={{ label: 'Bỏ thay đổi', onPress: close }}
        secondaryAction={{ label: 'Tiếp tục sửa', onPress: () => setConfirmDiscard(false) }}
        title="Bỏ thay đổi?"
        visible={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
      />
    </Screen>
  );
}
