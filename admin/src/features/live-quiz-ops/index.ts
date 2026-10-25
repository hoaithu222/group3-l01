/**
 * Public API của phân hệ `live-quiz-ops` (giám sát Live Quiz, p5-01) cho code NGOÀI phân hệ: tab "Thi đấu trực tiếp" của trang Gamification
 * (`features/gamification/pages/GamificationPage.tsx`) và cờ tính năng của nó. Không có module registry riêng (tránh menu phình).
 */
export { default as LiveQuizOpsTab } from './components/LiveQuizOpsTab';
export { LIVE_QUIZ_FEATURE_FLAG } from './constants/live-quiz-ops.constants';
