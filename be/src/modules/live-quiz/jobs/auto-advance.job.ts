import { registerJob } from "../../../infrastructure/queue";
import { QUIZ_JOB, QUIZ_QUEUE } from "../entities/live-quiz.commands";
import { quizCommandProcessor } from "./quiz-command.processor";

/**
 * `quiz.auto-advance` (queue `reports`, hẹn sau reveal khi `autoAdvance`, p5-01 be.md §5) — jobId `quiz.auto-advance_quiz_<id>_<index>`.
 * Idempotent: host đã `next`/phiên đóng → `currentIndex`/`phase`/`version` lệch → bỏ qua.
 */
registerJob(QUIZ_QUEUE, QUIZ_JOB.autoAdvance, quizCommandProcessor("advance"));
