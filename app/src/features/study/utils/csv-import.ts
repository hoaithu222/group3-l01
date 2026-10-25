import { normalizeSearch } from '@/shared/utils/format/string.utils';

/**
 * Nhập thẻ ghi nhớ từ văn bản CSV/TSV dán vào (p4-01 P1): mỗi dòng "thuật ngữ · định nghĩa". Bảng tính (Excel/Sheets/Quizlet)
 * khi sao chép ra là TSV; tệp `.csv` xuất ra là dấu phẩy hoặc chấm phẩy (Excel bản Việt). Kết quả là NHÁP — người dùng xem
 * trước rồi mới thêm vào bộ, và vẫn phải bấm Lưu (một `PUT items` `{ upsert[] }`).
 */
export type CsvDelimiter = ',' | ';' | '\t';

export interface CsvCard {
  definition: string;
  /** Số dòng (từ 1) trong văn bản dán — để báo lỗi đúng chỗ. */
  line: number;
  term: string;
}
export interface CsvRowError {
  line: number;
  message: string;
}
export interface CsvParseResult {
  cards: CsvCard[];
  delimiter: CsvDelimiter;
  errors: CsvRowError[];
  /** Dòng đầu là tiêu đề cột ("Thuật ngữ, Định nghĩa") và đã được bỏ qua. */
  hasHeader: boolean;
  /** Thẻ hợp lệ bị bỏ vì bộ không còn chỗ (`itemsPerSetMax`). */
  overflow: number;
}
export interface CsvParseOptions {
  /** Số mục còn thêm được vào bộ. */
  capacity: number;
  /** Trần độ dài mỗi mặt thẻ (`promptMax`). */
  maxLength: number;
}

const HEADER_TERM = new Set(['term', 'front', 'question', 'word', 'thuat ngu', 'mat truoc', 'cau hoi', 'tu vung', 'tu']);
const HEADER_DEF = new Set(['definition', 'back', 'answer', 'meaning', 'dinh nghia', 'mat sau', 'dap an', 'y nghia', 'nghia']);

function detectDelimiter(text: string): CsvDelimiter {
  const sample = text.split('\n').filter((line) => line.trim() !== '').slice(0, 10);
  if (sample.some((line) => line.includes('\t'))) return '\t';
  const count = (mark: string) => sample.reduce((sum, line) => sum + line.split(mark).length - 1, 0);
  return count(';') > count(',') ? ';' : ',';
}

interface RawRow {
  cells: string[];
  line: number;
}

/** RFC 4180 rút gọn: ô trong `"…"` được chứa dấu ngăn/xuống dòng, `""` là một dấu `"`. Trả thêm dòng mở ngoặc chưa đóng. */
function tokenize(text: string, delimiter: CsvDelimiter): { rows: RawRow[]; unterminated?: number } {
  const rows: RawRow[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let quoteLine = 0;
  let cellStart = true;
  let line = 1;
  let rowLine = 1;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charAt(i);
    if (quoted) {
      if (ch === '"' && text.charAt(i + 1) === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else {
        if (ch === '\n') line += 1;
        cell += ch;
      }
    } else if (ch === '"' && cellStart) {
      quoted = true;
      quoteLine = line;
      cellStart = false;
    } else if (ch === delimiter) {
      cells.push(cell);
      cell = '';
      cellStart = true;
    } else if (ch === '\n') {
      cells.push(cell);
      rows.push({ cells, line: rowLine });
      cells = [];
      cell = '';
      cellStart = true;
      line += 1;
      rowLine = line;
    } else {
      cell += ch;
      cellStart = false;
    }
  }
  cells.push(cell);
  rows.push({ cells, line: rowLine });
  return { rows, unterminated: quoted ? quoteLine : undefined };
}

export function parseFlashcardText(text: string, options: CsvParseOptions): CsvParseResult {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const delimiter = detectDelimiter(clean);
  const { rows, unterminated } = tokenize(clean, delimiter);
  const errors: CsvRowError[] = [];
  if (unterminated !== undefined) {
    errors.push({ line: unterminated, message: 'Dấu ngoặc kép mở ở đây chưa được đóng.' });
  }

  const filled = rows.filter((row) => row.cells.some((cell) => cell.trim() !== ''));
  const first = filled[0]?.cells;
  const hasHeader =
    first !== undefined &&
    first.length >= 2 &&
    HEADER_TERM.has(normalizeSearch(first[0] ?? '')) &&
    HEADER_DEF.has(normalizeSearch(first[1] ?? ''));

  const valid: CsvCard[] = [];
  filled.slice(hasHeader ? 1 : 0).forEach((row) => {
    const term = (row.cells[0] ?? '').trim();
    // Cột thừa nối lại vào định nghĩa: bỏ đi là mất chữ mà người dùng không hay biết (định nghĩa có dấu phẩy chưa bọc ngoặc).
    const definition = row.cells.slice(1).join(delimiter === '\t' ? ' ' : `${delimiter} `).trim();
    if (!term) errors.push({ line: row.line, message: 'Thiếu thuật ngữ.' });
    else if (!definition) errors.push({ line: row.line, message: `"${term}" chưa có định nghĩa.` });
    else if (term.length > options.maxLength || definition.length > options.maxLength) {
      errors.push({ line: row.line, message: `Quá dài (mỗi mặt tối đa ${options.maxLength} ký tự).` });
    } else valid.push({ definition, line: row.line, term });
  });

  const capacity = Math.max(0, options.capacity);
  return {
    cards: valid.slice(0, capacity),
    delimiter,
    errors: errors.sort((a, b) => a.line - b.line),
    hasHeader,
    overflow: Math.max(0, valid.length - capacity),
  };
}
