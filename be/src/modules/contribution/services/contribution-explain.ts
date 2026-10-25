import type { ContributionConfigValue, ContributionWeights } from "../../../core/constants/contribution";
import type { MemberContribution } from "../entities/contribution.interface";

/**
 * Câu tiếng Việt do SERVER dựng (app hiển thị nguyên văn — README p4-06 §10 "luôn hiện công thức áp số của chính người đó"): định nghĩa từng
 * thành phần và dòng giải thích có số thật. HÀM THUẦN.
 */

/** Số theo kiểu Việt Nam (dấu phẩy thập phân). `digits` cố định số chữ số; bỏ trống = tối đa 2 chữ số, bỏ số 0 thừa. */
export function formatVi(n: number, digits?: number): string {
  const text = digits === undefined ? String(Math.round(n * 100) / 100) : n.toFixed(digits);
  return text.replace(".", ",");
}

export interface FormulaDefinitions {
  points: string;
  onTime: string;
  peer: string;
}

export function definitionsOf(config: ContributionConfigValue): FormulaDefinitions {
  const grace = config.onTimeGraceHours > 0 ? ` cộng ${config.onTimeGraceHours} giờ cho phép trễ` : "";
  return {
    points:
      "Điểm thẻ = tổng điểm story points của các thẻ đã hoàn thành (thẻ nhiều người làm chia đều; " +
      `thẻ chưa gán điểm tính ${formatVi(config.unestimatedPoints)} điểm), so với người có nhiều điểm thẻ nhất nhóm.`,
    onTime:
      `Đúng hạn = số thẻ có hạn hoàn thành không muộn hơn cuối ngày hạn${grace}, trên tổng số thẻ có hạn. ` +
      "Thẻ không có hạn không được tính vào thành phần này.",
    peer: "Điểm chấm = điểm trung bình (thang 10) của các lượt chấm chéo đã nộp cho thẻ bạn làm, chia 10.",
  };
}

const LABELS: Record<keyof ContributionWeights, string> = { points: "điểm thẻ", onTime: "đúng hạn", peer: "điểm chấm" };
const ORDER = ["points", "onTime", "peer"] as const;

/**
 * "60 × 8/8 + 20 × 3/4 + 20 × 8,0/10 = 91,0". Thành phần chưa có dữ liệu bị bỏ và trọng số chia lại:
 * "(60 × 4/8 + 20 × 7,0/10) ÷ 80 × 100 = 55,0 · 20 % đúng hạn chia lại".
 */
export function explanationOf(member: MemberContribution, weights: ContributionWeights, maxStoryPoints: number): string {
  const terms: string[] = [];
  let usedWeight = 0;
  const redistributed: string[] = [];
  for (const key of ORDER) {
    if (member.components[key] === null) {
      if (weights[key] > 0) redistributed.push(`${weights[key]} % ${LABELS[key]}`);
      continue;
    }
    usedWeight += weights[key];
    if (key === "points") terms.push(`${weights.points} × ${formatVi(member.storyPointsDone)}/${formatVi(maxStoryPoints)}`);
    if (key === "onTime") terms.push(`${weights.onTime} × ${member.tasksOnTime}/${member.tasksWithDue}`);
    if (key === "peer") terms.push(`${weights.peer} × ${formatVi(member.peerScoreAvg ?? 0, 1)}/10`);
  }
  if (terms.length === 0 || usedWeight <= 0) return "Chưa có dữ liệu để tính điểm = 0,0";
  const score = formatVi(member.score, 1);
  if (usedWeight === 100) return `${terms.join(" + ")} = ${score}`;
  const note = redistributed.length > 0 ? ` · ${redistributed.join(", ")} chia lại` : "";
  return `(${terms.join(" + ")}) ÷ ${usedWeight} × 100 = ${score}${note}`;
}
