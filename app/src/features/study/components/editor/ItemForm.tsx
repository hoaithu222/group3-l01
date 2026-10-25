import { useRef, useState } from 'react';
import { View, type TextInput } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Input } from '@/shared/ui/input';

import type { StudyLimits } from '../../constants/study.constants';
import type { DraftItem } from '../../utils/editor-draft';
import { hapticTap } from '../../utils/editor-haptics';
import { changeItemType } from '../../utils/editor-ops';
import type { ItemProblem } from '../../utils/item-validation';
import { describeBulkError, type ItemErrors } from '../../utils/map-bulk-errors';
import { ChoiceFields } from './ChoiceFields';
import { fieldMessage } from './field-message';
import { FillBlankFields } from './FillBlankFields';
import { FlashcardFields } from './FlashcardFields';
import { ItemFormActions } from './ItemFormActions';
import { ItemMediaFields } from './ItemMediaFields';
import { ItemPreview } from './ItemPreview';
import { ItemTypeHeader } from './ItemTypeHeader';
import { ItemTypePicker } from './ItemTypePicker';
import { TrueFalseFields } from './TrueFalseFields';

export interface ItemFormProps {
  /** Bộ còn chỗ cho mục mới (`itemCount < itemsPerSetMax`) — quyết định nút "Thêm tiếp". */
  canAddNext: boolean;
  item: DraftItem;
  limits: StudyLimits;
  /** Lỗi kiểm cục bộ của mục. */
  problems: readonly ItemProblem[];
  /** Bộ đang soạn — khoá ô ảnh/âm thanh trong hàng đợi upload theo bộ + mục. */
  setId: string;
  /** Lỗi do SERVER trả cho mục (`STUDY_001`) — hiện thành khung "Cần sửa" cho tới khi sửa mục. */
  serverErrors?: ItemErrors;
  onChange: (update: Partial<DraftItem> | ((item: DraftItem) => DraftItem)) => void;
  onDone: () => void;
  /** "Thêm tiếp": thêm mục mới cùng dạng ngay sau mục này và mở nó. */
  onDoneAndNext: () => void;
  onRemove: () => void;
}

/**
 * Form một mục học (app.md p4-01 §2): đầu form là DẠNG đang dùng (+ "Đổi dạng"), rồi bản XEM TRƯỚC như người học thấy, rồi câu
 * hỏi/thuật ngữ, phần riêng theo dạng, ảnh/âm thanh, giải thích, và hàng nút (Xong · Thêm tiếp · Xoá mục). Điện thoại: chiếm cả màn;
 * tablet: cột phải cạnh danh sách. Đáp án đúng có dấu tích + chữ "Đúng", không chỉ màu.
 *
 * Nhập nhanh: mục MỚI (chưa có id, chưa gõ gì) tự đặt con trỏ vào ô đầu; thẻ ghi nhớ — Enter ở "Thuật ngữ" nhảy sang "Định nghĩa";
 * trắc nghiệm/điền chỗ trống — Enter thêm dòng kế (xem từng `*Fields`); "Thêm tiếp" mở luôn mục kế. Mục ĐÃ CÓ chữ thì KHÔNG tự bật bàn phím
 * (mở một mục cũ để xem không được bật bàn phím lên che màn).
 */
export function ItemForm({
  canAddNext,
  item,
  limits,
  onChange,
  onDone,
  onDoneAndNext,
  onRemove,
  problems,
  serverErrors,
  setId,
}: ItemFormProps) {
  const [changingType, setChangingType] = useState(false);
  // Quyết định MỘT lần lúc mở form: gõ vài chữ rồi xoá sạch không được làm ô nhập giật lại tiêu điểm.
  const [autoFocus] = useState(() => !item.id && !item.prompt.trim());
  const answerRef = useRef<TextInput>(null);
  const flashcard = item.type === 'FLASHCARD';

  return (
    <View className="gap-md py-xs">
      <ItemTypeHeader type={item.type} onChangeType={() => setChangingType(true)} />

      {serverErrors && serverErrors.fields.length > 0 ? (
        <Alert
          description={serverErrors.fields
            .map((entry) => `• ${describeBulkError(entry)}`)
            .join('\n')}
          title="Cần sửa mục này"
          tone="error"
        />
      ) : null}

      <ItemPreview item={item} />

      <Input
        autoFocus={autoFocus}
        hint={`${item.prompt.length}/${limits.promptMax}`}
        label={flashcard ? 'Thuật ngữ (mặt trước)' : 'Câu hỏi'}
        maxLength={limits.promptMax}
        message={fieldMessage(problems, 'prompt')}
        messageTone="error"
        multiline
        placeholder={flashcard ? 'Ví dụ: environment' : 'Ví dụ: Thủ đô của Việt Nam là gì?'}
        required
        returnKeyType={flashcard ? 'next' : undefined}
        submitBehavior={flashcard ? 'submit' : undefined}
        value={item.prompt}
        onChangeText={(prompt) => onChange({ prompt })}
        onSubmitEditing={flashcard ? () => answerRef.current?.focus() : undefined}
      />

      {flashcard ? (
        <FlashcardFields
          answerRef={answerRef}
          item={item}
          limits={limits}
          problems={problems}
          onChange={onChange}
        />
      ) : null}
      {item.type === 'MULTIPLE_CHOICE' || item.type === 'MULTI_SELECT' ? (
        <ChoiceFields
          item={item}
          limits={limits}
          problems={problems}
          setId={setId}
          onChange={onChange}
        />
      ) : null}
      {item.type === 'TRUE_FALSE' ? <TrueFalseFields item={item} onChange={onChange} /> : null}
      {item.type === 'FILL_BLANK' ? (
        <FillBlankFields item={item} limits={limits} problems={problems} onChange={onChange} />
      ) : null}

      {flashcard ? null : (
        <Input
          hint={`${item.explanation.length}/${limits.explanationMax}`}
          label="Giải thích (không bắt buộc)"
          maxLength={limits.explanationMax}
          message={fieldMessage(problems, 'explanation')}
          messageTone="error"
          multiline
          placeholder="Vì sao đáp án này đúng?"
          value={item.explanation}
          onChangeText={(explanation) => onChange({ explanation })}
        />
      )}

      <ItemMediaFields item={item} setId={setId} onChange={onChange} />

      <ItemFormActions
        canAddNext={canAddNext}
        item={item}
        onDone={onDone}
        onDoneAndNext={onDoneAndNext}
        onRemove={onRemove}
      />

      <ItemTypePicker
        selected={item.type}
        title="Đổi dạng mục"
        visible={changingType}
        onClose={() => setChangingType(false)}
        onPick={(type) => {
          hapticTap();
          onChange((current) => changeItemType(current, type));
        }}
      />
    </View>
  );
}
