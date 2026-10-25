import { Input } from '@/shared/ui/input';

export interface QuizFillInputProps {
  /** Kết quả sau khi chấm; `null` = chưa chấm. Có giá trị ⇒ ô khoá và hiện "Đúng"/"Sai" ngay dưới ô. */
  correct: boolean | null;
  /** `key` của ô = khoá câu, để sang câu khác là ô MỚI (không mang chữ cũ). */
  itemId: string;
  onChange: (text: string) => void;
  /** Phím "Xong" của bàn phím — chấm luôn, khỏi phải với tay xuống nút "Kiểm tra". */
  onSubmit: () => void;
}

/**
 * Ô nhập của câu điền chỗ trống. ⚠️ KHÔNG điều khiển (`defaultValue` + `onChangeText`, không `value`): ghi đè chữ giữa lúc bộ gõ Telex đang ghép dấu làm
 * MẤT DẤU hoặc nhảy con trỏ (Android) — người học gõ "Hà Nội" ra "Ha Noi" rồi bị chấm sai vì lỗi của app. Ô mở khoá lại nhờ đổi `key` ở câu kế.
 * `autoCapitalize="none"` + `autoCorrect={false}`: bàn phím không tự viết hoa/sửa từ trước khi chấm — đáp án "khớp chính xác" sẽ chấm sai oan.
 */
export function QuizFillInput({ correct, itemId, onChange, onSubmit }: QuizFillInputProps) {
  const checked = correct !== null;

  return (
    <Input
      key={itemId}
      autoCapitalize="none"
      autoCorrect={false}
      disabled={checked}
      label="Câu trả lời"
      message={checked ? (correct ? 'Đúng' : 'Sai') : undefined}
      messageTone={correct ? 'success' : 'error'}
      placeholder="Nhập câu trả lời của bạn"
      returnKeyType="done"
      onChangeText={onChange}
      onSubmitEditing={onSubmit}
    />
  );
}
