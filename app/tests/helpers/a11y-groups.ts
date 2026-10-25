/**
 * Phần tử `accessible` mà bên trong còn có NÚT — nút đó không tới được bằng trình đọc màn hình.
 *
 * ── Vì sao có helper này ─────────────────────────────────────────────────────
 * Một `View accessible` gộp CẢ cây con thành MỘT ô: iOS ẩn hẳn con của nó, Android coi con là một phần của nhãn.
 * Nút "Huỷ" / "Bỏ lưu" nằm bên trong hàng `accessible` là một nút mà người dùng TalkBack/VoiceOver không bao giờ
 * mở được — không lỗi nào báo, `tsc`/ESLint/`getByRole` đều xanh (RNTL không mô phỏng việc gộp này). Cách chữa đúng
 * là gom nhãn vào ĐÚNG khối chữ, để nút thành ô rời (mẫu `ListItem`, `Alert`).
 *
 * ⚠️ Chỉ tính `accessible` KHAI TƯỜNG MINH trên phần tử KHÔNG phải nút: `Pressable` luôn `accessible` và tự nó là nút
 * (thẻ bấm được chứa nút khác là chuyện khác, xem `Card`).
 */
type JsonNode = {
  children?: (JsonNode | string)[] | null;
  props?: Record<string, unknown>;
  type?: string;
} | null;

function hasButtonInside(node: JsonNode | string): boolean {
  if (!node || typeof node !== 'object') return false;
  for (const child of node.children ?? []) {
    if (typeof child === 'object' && child) {
      if (child.props?.accessibilityRole === 'button') return true;
      if (hasButtonInside(child)) return true;
    }
  }
  return false;
}

/** Nhãn (hoặc `(không nhãn)`) của mọi phần tử `accessible` không phải nút mà có nút nằm bên trong. */
export function accessibleGroupsHidingButtons(tree: unknown, found: string[] = []): string[] {
  if (!tree || typeof tree !== 'object') return found;
  if (Array.isArray(tree)) {
    for (const item of tree) accessibleGroupsHidingButtons(item, found);
    return found;
  }
  const node = tree as JsonNode;
  if (node?.props?.accessible === true && node.props.accessibilityRole !== 'button') {
    if (hasButtonInside(node)) found.push(String(node.props.accessibilityLabel ?? '(không nhãn)'));
  }
  for (const child of node?.children ?? []) accessibleGroupsHidingButtons(child, found);
  return found;
}
