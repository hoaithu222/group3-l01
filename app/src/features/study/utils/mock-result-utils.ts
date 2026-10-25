import type {
  MockAttemptDto,
  MockResultQuestionDto,
  MockTagScore,
} from '../api/mock-attempts.types';

/** Số thẻ tối thiểu để vẽ radar — ít hơn thì đa giác suy biến (điểm/đoạn thẳng), dùng danh sách thanh. */
export const RADAR_MIN_TAGS = 3;

/** Nhãn thẻ chủ đề: hai khoá đặc biệt của BE (`byTag`) được đọc thành tiếng Việt. */
export function tagLabel(tag: string): string {
  if (tag === '__untagged') return 'Chưa gắn thẻ';
  if (tag === '__other') return 'Khác';
  return tag;
}

/** Tỉ lệ đúng 0..100 (làm tròn); `total = 0` ⇒ 0 (không chia cho 0). */
export function tagPercent(score: Pick<MockTagScore, 'correct' | 'total'>): number {
  return score.total === 0 ? 0 : Math.round((score.correct / score.total) * 100);
}

/** Câu đọc cho trình đọc màn hình — radar không phải nguồn thông tin duy nhất, nhưng nhãn của nó phải đủ số liệu. */
export function describeTagScores(scores: readonly MockTagScore[]): string {
  return scores
    .map((s) => `${tagLabel(s.tag)} ${s.correct}/${s.total}, ${tagPercent(s)} phần trăm`)
    .join('; ');
}

/** "45 giây" · "12 phút 5 giây" · "1 giờ 2 phút" — thời gian làm bài / thời gian rời app. */
export function formatDurationVi(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours} giờ ${minutes} phút`;
  if (minutes > 0) return seconds > 0 ? `${minutes} phút ${seconds} giây` : `${minutes} phút`;
  return `${seconds} giây`;
}

/** Thời gian làm thật: nộp − bắt đầu; chưa có mốc nộp ⇒ `null`. */
export function attemptDurationMs(
  attempt: Pick<MockAttemptDto, 'startedAt' | 'submittedAt'>,
): number | null {
  if (!attempt.submittedAt) return null;
  const diff = Date.parse(attempt.submittedAt) - Date.parse(attempt.startedAt);
  return Number.isFinite(diff) && diff >= 0 ? diff : null;
}

/**
 * Toạ độ đỉnh radar: `values` là tỉ lệ 0..1 theo từng trục, trục đầu hướng LÊN rồi chạy theo chiều kim đồng hồ.
 * Hàm thuần để test được hình học mà không cần vẽ.
 */
export function radarVertices(
  values: readonly number[],
  cx: number,
  cy: number,
  radius: number,
): { x: number; y: number }[] {
  const n = values.length;
  return values.map((value, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = radius * Math.min(1, Math.max(0, value));
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
}

export function toPoints(vertices: readonly { x: number; y: number }[]): string {
  return vertices.map((v) => `${v.x.toFixed(1)},${v.y.toFixed(1)}`).join(' ');
}

/** Đáp án dạng chữ: câu lựa chọn → nối `text` các lựa chọn đã chọn; câu điền → chữ đã gõ. Trống ⇒ "—". */
export function describeAnswer(
  q: Pick<MockResultQuestionDto, 'options' | 'type'>,
  optionIds: readonly string[],
  text: string | null,
): string {
  if (q.type === 'FILL_BLANK' || q.options.length === 0) return text?.trim() || '—';
  const picked = q.options.filter((o) => optionIds.includes(o.id)).map((o) => o.text);
  return picked.length > 0 ? picked.join(', ') : '—';
}

/** Đáp án ĐÚNG dạng chữ (câu điền: các đáp án chấp nhận, nối bằng " / "). */
export function correctAnswerText(q: MockResultQuestionDto): string {
  if (q.type === 'FILL_BLANK' || q.options.length === 0)
    return q.acceptedAnswers.join(' / ') || '—';
  return describeAnswer(q, q.correctOptionIds, null);
}
