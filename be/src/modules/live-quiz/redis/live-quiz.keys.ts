/**
 * Khoá Redis của live quiz (p5-01 be.md §2). `{id}` là HASH TAG — mọi khoá của một phiên cùng slot nếu sau này chạy Redis Cluster
 * (Lua nhiều KEYS). `REDIS_KEY_PREFIX` do store thêm vào, KHÔNG ghép ở đây.
 */
export const quizKeys = {
  pin: (pin: string): string => `quiz:pin:${pin}`,
  meta: (id: string): string => `quiz:{${id}}:meta`,
  players: (id: string): string => `quiz:{${id}}:players`,
  scores: (id: string): string => `quiz:{${id}}:scores`,
  answers: (id: string, index: number): string => `quiz:{${id}}:answers:${index}`,
  stats: (id: string, index: number): string => `quiz:{${id}}:stats:${index}`,
  /** index → `<đáp án đúng>:<số lựa chọn>` — KHÔNG BAO GIỜ gửi client trước `quiz:reveal`. */
  correct: (id: string): string => `quiz:{${id}}:correct`,
  /** index → JSON `StoredQuestion` (chứa `explanation`, `itemId` — payload gửi client dựng lại từng trường an toàn). */
  questions: (id: string): string => `quiz:{${id}}:questions`,
  kicked: (id: string): string => `quiz:{${id}}:kicked`,
} as const;
