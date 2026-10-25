/** Đường dẫn endpoint `/admin/plagiarism/*` — khớp `admin-plagiarism.routes.ts` phía BE (p7-05 be.md §4). */
export const plagiarismApi = {
  overview: '/admin/plagiarism/overview',
  config: '/admin/plagiarism/config',
  reindex: '/admin/plagiarism/reindex',
} as const;
