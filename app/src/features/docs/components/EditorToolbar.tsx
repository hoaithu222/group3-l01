import { ScrollView, View } from 'react-native';

import { Chip, type ChipRole } from '@/shared/ui/chip';

import type { CommandBody, SelectionStatePayload } from '../webview/doc-editor-bridge.types';

export interface EditorToolbarProps {
  /** Đang tải ảnh lên — chip "Ảnh" khoá để không chọn chồng. */
  imageBusy?: boolean;
  selection: SelectionStatePayload | null;
  onCommand: (command: CommandBody) => void;
  onImage: () => void;
  onLink: () => void;
}

interface Tool {
  command?: CommandBody;
  disabled?: boolean;
  key: string;
  label: string;
  onPress?: () => void;
  role: ChipRole;
  selected: boolean;
}

/**
 * Thanh công cụ NATIVE điều khiển editor qua bridge (app.md §2/§7): đậm · nghiêng · gạch ngang · tiêu đề 1–3 · danh sách · đánh số ·
 * việc cần làm · trích dẫn · khối mã · bảng · liên kết · ảnh · hoàn tác/làm lại. Nằm DƯỚI vùng soạn và luôn trên bàn phím (do
 * `DocumentEditorScreen` đặt trong vùng né bàn phím) — ⛔ không tự bọc `KeyboardStickyView`, sẽ bị nâng hai lần.
 *
 * ── Trợ năng ──────────────────────────────────────────────────────────────────────────────────────────────────────
 * Nút có CHỮ (bộ icon của repo không có bold/italic…) và đọc trạng thái bằng `accessibilityState` (`checkbox` = đang bật) —
 * ⛔ không chỉ tô màu. Tiêu đề: bấm lại đúng cấp đang bật thì editor tự chuyển về đoạn văn (lệnh `heading` là toggle).
 *
 * ⚠️ `ScrollView` ngang PHẢI có `grow-0` (không thì nó nở chiếm hết chiều cao còn lại của màn) và `keyboardShouldPersistTaps="always"`
 * (mặc định, chạm đầu tiên chỉ đóng bàn phím và KHÔNG tới được nút — người dùng mất tiêu điểm khỏi trang mỗi lần bấm định dạng).
 * Trang giữ vùng chọn trong state ProseMirror nên định dạng vẫn áp đúng dù WebView vừa mất tiêu điểm.
 */
export function EditorToolbar({
  imageBusy = false,
  onCommand,
  onImage,
  onLink,
  selection,
}: EditorToolbarProps) {
  const s = selection;
  const toggle = (
    key: string,
    label: string,
    command: CommandBody,
    on: boolean | undefined,
  ): Tool => ({
    command,
    key,
    label,
    role: 'checkbox',
    selected: Boolean(on),
  });
  const heading = (level: 1 | 2 | 3): Tool =>
    toggle(
      `h${level}`,
      `Tiêu đề ${level}`,
      { attrs: { level }, name: 'heading' },
      s?.heading === level,
    );

  const tools: Tool[] = [
    {
      command: { name: 'undo' },
      disabled: !s?.canUndo,
      key: 'undo',
      label: 'Hoàn tác',
      role: 'button',
      selected: false,
    },
    {
      command: { name: 'redo' },
      disabled: !s?.canRedo,
      key: 'redo',
      label: 'Làm lại',
      role: 'button',
      selected: false,
    },
    toggle('bold', 'Đậm', { name: 'bold' }, s?.bold),
    toggle('italic', 'Nghiêng', { name: 'italic' }, s?.italic),
    toggle('strike', 'Gạch ngang', { name: 'strike' }, s?.strike),
    heading(1),
    heading(2),
    heading(3),
    toggle('bullet', 'Danh sách', { name: 'bulletList' }, s?.bulletList),
    toggle('ordered', 'Đánh số', { name: 'orderedList' }, s?.orderedList),
    toggle('task', 'Việc cần làm', { name: 'taskList' }, s?.taskList),
    toggle('quote', 'Trích dẫn', { name: 'blockquote' }, s?.blockquote),
    toggle('code', 'Khối mã', { name: 'codeBlock' }, s?.codeBlock),
    // Bảng: chèn 3×3 (có hàng tiêu đề). Đang ở trong bảng thì chèn bảng lồng vào là vô nghĩa → khoá.
    {
      command: { attrs: { cols: 3, rows: 3 }, name: 'insertTable' },
      disabled: s?.table === true,
      key: 'table',
      label: 'Bảng',
      role: 'button',
      selected: false,
    },
    {
      key: 'link',
      label: 'Liên kết',
      onPress: onLink,
      role: 'checkbox',
      selected: s?.link != null,
    },
    {
      disabled: imageBusy,
      key: 'image',
      label: imageBusy ? 'Đang tải ảnh…' : 'Ảnh',
      onPress: onImage,
      role: 'button',
      selected: false,
    },
  ];

  return (
    <View className="border-t border-divider-1 bg-bg-1">
      <ScrollView
        className="grow-0"
        contentContainerClassName="gap-xs px-md py-xs"
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        {tools.map((tool) => {
          const { command } = tool;
          return (
            <Chip
              key={tool.key}
              disabled={tool.disabled}
              label={tool.label}
              role={tool.role}
              selected={tool.selected}
              size="sm"
              onPress={tool.onPress ?? (command ? () => onCommand(command) : undefined)}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}
