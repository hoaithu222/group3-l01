import type { CsvDelimiter, CsvParseResult } from './csv-import';

/**
 * Ví dụ bấm "Dùng ví dụ" ở tấm nhập CSV: có dòng tiêu đề (tự bỏ), hai thẻ thường và một thuật ngữ có dấu phẩy được bọc ngoặc kép
 * — đủ ba điều người dùng hay vấp mà không cần đọc hướng dẫn.
 */
export const CSV_EXAMPLE_TEXT =
  'Thuật ngữ,Định nghĩa\napple,quả táo\nbook,quyển sách\n"hello, world",xin chào';

const DELIMITER_LABELS: Record<CsvDelimiter, string> = {
  ',': 'dấu phẩy',
  ';': 'dấu chấm phẩy',
  '\t': 'Tab',
};

export function describeDelimiter(delimiter: CsvDelimiter): string {
  return DELIMITER_LABELS[delimiter];
}

export interface CsvOutcome {
  /** Dòng bị bỏ vì lỗi (thiếu thuật ngữ/định nghĩa, quá dài, ngoặc kép chưa đóng). */
  skipped: number;
  /** Thẻ hợp lệ SẼ được thêm (đã cắt theo sức chứa). */
  valid: number;
  /** Thẻ hợp lệ nhưng vượt sức chứa của bộ — không được thêm. */
  overflow: number;
}

export function csvOutcome(result: CsvParseResult): CsvOutcome {
  return {
    overflow: result.overflow,
    skipped: result.errors.length,
    valid: result.cards.length,
  };
}
