import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

import type { StudyLimits } from '../../constants/study.constants';
import { parseFlashcardText, type CsvCard } from '../../utils/csv-import';
import { CSV_EXAMPLE_TEXT } from '../../utils/csv-import-summary';
import { CsvGuide } from './CsvGuide';
import { CsvPreview } from './CsvPreview';

export interface CsvImportSheetProps {
  /** Số mục còn thêm được vào bộ (`itemsPerSetMax` − số mục hiện có). */
  capacity: number;
  limits: StudyLimits;
  visible: boolean;
  onClose: () => void;
  /** Nhận các thẻ hợp lệ đã cắt theo sức chứa — màn thêm vào NHÁP (chưa lưu). */
  onImport: (cards: readonly CsvCard[]) => void;
}

/**
 * Nhập thẻ ghi nhớ hàng loạt từ văn bản dán (p4-01 P1 "Nhập CSV/TSV"): hướng dẫn định dạng kèm ví dụ (khi ô còn trống) → dán → XEM
 * TRƯỚC (số thẻ hợp lệ, bảng vài thẻ đầu, dòng lỗi kèm số dòng, thẻ vượt sức chứa) → "Thêm N thẻ". Chỉ thêm vào NHÁP; lưu vẫn là một
 * `PUT items { upsert[] }` ở `UnsavedBar` nên người dùng còn sửa/xoá được từng thẻ trước khi lưu. Bộ tách dòng/ô ở
 * `utils/csv-import.ts` (thuần, có test).
 */
export function CsvImportSheet({
  capacity,
  limits,
  onClose,
  onImport,
  visible,
}: CsvImportSheetProps) {
  const [text, setText] = useState('');
  const result = useMemo(
    () =>
      text.trim() ? parseFlashcardText(text, { capacity, maxLength: limits.promptMax }) : null,
    [capacity, limits.promptMax, text],
  );
  const count = result?.cards.length ?? 0;

  function submit(): void {
    if (!result || count === 0) return;
    onImport(result.cards);
    setText('');
    onClose();
  }

  return (
    <BottomSheet
      description="Dán thuật ngữ và định nghĩa từ bảng tính hoặc tệp CSV/TSV."
      footer={
        <Button
          disabled={count === 0}
          fullWidth
          label={count > 0 ? `Thêm ${count} thẻ` : 'Thêm thẻ'}
          onPress={submit}
        />
      }
      scrollable
      title="Nhập từ CSV"
      visible={visible}
      onClose={onClose}
    >
      {/* ⛔ Không `pb-md`: ngay dưới là vùng `footer` (nút "Thêm N thẻ") đã có khe riêng — cộng thêm là dải trắng thừa trên nút. */}
      <View className="gap-md">
        {result ? null : <CsvGuide onUseExample={() => setText(CSV_EXAMPLE_TEXT)} />}
        <Input
          label="Nội dung"
          multiline
          placeholder={'apple\tquả táo\nbook\tquyển sách'}
          value={text}
          onChangeText={setText}
        />
        {result ? <CsvPreview capacity={capacity} result={result} /> : null}
      </View>
    </BottomSheet>
  );
}
