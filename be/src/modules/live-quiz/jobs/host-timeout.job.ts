import { registerJob } from "../../../infrastructure/queue";
import { QUIZ_JOB, QUIZ_QUEUE } from "../entities/live-quiz.commands";
import { quizCommandProcessor } from "./quiz-command.processor";

/**
 * `quiz.host-timeout` (queue `reports`, hẹn khi socket CUỐI của host rời room, p5-01 be.md §5/§7) — jobId `quiz.host-timeout_quiz_<id>_<lastSeenMs>`.
 * Idempotent: service kiểm `hostLastSeenMs` còn đúng mốc + phiên còn mở + host thật sự vắng mặt.
 */
registerJob(QUIZ_QUEUE, QUIZ_JOB.hostTimeout, quizCommandProcessor("host-timeout"));
