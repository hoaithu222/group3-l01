/** Khoá cache `live-quiz` (app.md p5-01 §2). */
export const liveQuizKeys = {
  all: ['live-quiz'] as const,
  history: () => ['live-quiz', 'history'] as const,
  results: (id: string) => ['live-quiz', 'results', id] as const,
  session: (id: string) => ['live-quiz', 'session', id] as const,
};
