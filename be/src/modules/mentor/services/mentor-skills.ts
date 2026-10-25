import { normalizeSearch } from "../../../core/utils/normalize";
import { LIMITS } from "../../../core/constants/limits";

export interface NormalizedSkills {
  /** Khoá lọc (không dấu, chữ thường) — cùng thứ tự với `labels`. */
  skills: string[];
  /** Nhãn gốc để hiển thị. */
  labels: string[];
}

/** Chuẩn hoá danh sách kỹ năng: bỏ trùng theo khoá không dấu (giữ nhãn xuất hiện ĐẦU), bỏ rỗng, cắt tối đa `skillsMax`. */
export function normalizeSkills(input: string[]): NormalizedSkills {
  const seen = new Set<string>();
  const out: NormalizedSkills = { skills: [], labels: [] };
  for (const raw of input) {
    const label = raw.trim().replace(/\s+/g, " ");
    const key = normalizeSearch(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.skills.push(key);
    out.labels.push(label);
    if (out.skills.length >= LIMITS.mentor.skillsMax) break;
  }
  return out;
}

/** `?skills=react,Node JS` → `["react", "node js"]` (không dấu, bỏ trùng, tối đa `skillsMax`). */
export function parseSkillsCsv(csv: string | undefined): string[] | undefined {
  if (!csv) return undefined;
  const { skills } = normalizeSkills(csv.split(","));
  return skills.length > 0 ? skills : undefined;
}
