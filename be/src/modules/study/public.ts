/**
 * Barrel CÔNG KHAI của module `study` — NGOẠI LỆ CÓ CHỦ ĐÍCH của luật "modules KHÔNG import chéo module" (cùng cơ chế
 * `@modules/assets/public`, `@modules/messages/public`): p5-01 (live quiz, module riêng), p7-02 (coins, quyền nội dung) và
 * mọi module cần chấm điểm/đọc bộ học import TỪ ĐÂY, không import file trong `services/`/`repositories/`.
 *
 * p4-02 (mock test + SR) nằm CÙNG module `study` nên dùng thẳng `answer-grader`, `study-set-access`, repository.
 *
 * - `gradeAnswer` — hàm chấm THUẦN, dùng chung p4-01/p4-02/p5-01 (đúng/sai nhất quán ở mọi nơi).
 * - `createStudyContentReader()` — đọc bộ/mục ĐÃ kiểm `canView` (không cho module ngoài tự đọc `StudySet`/`StudyItem`).
 * - `GRADABLE_ITEM_TYPES`, `ITEM_TYPE_BIT`, `GRADABLE_MASK`, `STUDY_OPTION_ID_REGEX` — hằng dùng lại khi lọc câu chấm được /
 *   kiểm id lựa chọn (TRUE_FALSE dùng `o_true`/`o_false` nên regex cho phép 4–6 ký tự).
 */
import { getStudyContainer } from "./study.container";
import type { StudyContentReader } from "./services/study-content.reader";

export { gradeAnswer, normalizeAnswer } from "./services/answer-grader";
export type { GradableItem, AnswerInput, GradeResult } from "./services/answer-grader";
export {
  GRADABLE_ITEM_TYPES,
  GRADABLE_MASK,
  ITEM_TYPE_BIT,
  STUDY_OPTION_ID_REGEX,
  TRUE_OPTION_ID,
  FALSE_OPTION_ID,
  isGradableType,
  typesMask,
} from "./entities/study-item.interface";
export type { StudyItem, StudyOption, StudyItemTypeValue, FillMatchModeValue } from "./entities/study-item.interface";
export type { StudySet, StudySetStatusValue, StudyVisibilityValue } from "./entities/study-set.interface";
export type { StudyContentReader } from "./services/study-content.reader";

/** Wiring mặc định (Prisma) — module gọi tự dùng trong `{module}.routes.ts`/job, giống `createAssetAccessService()`. */
export function createStudyContentReader(): StudyContentReader {
  return getStudyContainer().content;
}
