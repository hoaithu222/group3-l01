import { registerJob } from "../../../infrastructure/queue";
import { QUIZ_JOB, QUIZ_QUEUE } from "../entities/live-quiz.commands";
import { quizCommandProcessor } from "./quiz-command.processor";

/**
 * `quiz.question-deadline` (queue `reports`, delayed job qua `QuizCommandBus.schedule` lúc start/next, p5-01 be.md §5/§7) — hết giờ câu → đóng
 * câu + reveal + leaderboard. jobId `quiz.question-deadline_quiz_<id>_<index>` (`toSafeJobId`). Idempotent: CAS `close` trong Redis.
 */
registerJob(QUIZ_QUEUE, QUIZ_JOB.deadline, quizCommandProcessor("close"));
