import { useZodForm } from '@/shared/form/useZodForm';
import { BottomSheet, SheetActions } from '@/shared/ui/bottom-sheet';
import { FormInput } from '@/shared/ui/input';

import { linkSchema, type LinkValues } from '../schemas/docs.schemas';
import { normalizeLinkHref } from '../utils/link';

export interface LinkSheetProps {
  /** Liên kết đang có tại con trỏ (`selectionState.link`) — có thì hiện "Gỡ liên kết" và điền sẵn. */
  currentHref: string | null;
  visible: boolean;
  onApply: (href: string) => void;
  onClose: () => void;
  onRemove: () => void;
}

/**
 * Chèn/sửa/gỡ liên kết (toolbar "Liên kết"). Chuẩn hoá và kiểm an toàn NGAY tại đây (`normalizeLinkHref`) — `javascript:`/`data:` bị chặn
 * với thông báo rõ ràng; trang soạn thảo kiểm lại lần nữa. `values` theo `currentHref` để tấm mở lại luôn điền đúng liên kết hiện tại.
 */
export function LinkSheet({ currentHref, onApply, onClose, onRemove, visible }: LinkSheetProps) {
  const form = useZodForm<LinkValues, LinkValues>(linkSchema, {
    defaultValues: { href: currentHref ?? '' },
    values: { href: currentHref ?? '' },
  });

  const submit = form.handleSubmit((data) => {
    const href = normalizeLinkHref(data.href);
    if (!href) return;
    onApply(href);
    onClose();
  });

  return (
    <BottomSheet
      footer={
        // ✅ `SheetActions` [Gỡ liên kết | Áp dụng] chia đôi một hàng thay cho hai nút xếp chồng; chưa có liên kết thì chỉ còn "Áp dụng".
        <SheetActions
          primary={{ label: 'Áp dụng', onPress: submit }}
          secondary={
            currentHref
              ? {
                  label: 'Gỡ liên kết',
                  onPress: () => {
                    onRemove();
                    onClose();
                  },
                }
              : undefined
          }
        />
      }
      scrollable
      title="Liên kết"
      visible={visible}
      onClose={onClose}
    >
      <FormInput<LinkValues>
        autoCapitalize="none"
        autoCorrect={false}
        control={form.control}
        keyboardType="url"
        label="Địa chỉ liên kết"
        name="href"
        placeholder="example.com hoặc https://…"
        returnKeyType="done"
      />
    </BottomSheet>
  );
}
