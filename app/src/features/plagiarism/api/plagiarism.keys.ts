import type { ScanStatus } from './plagiarism.types';

/** Khoá React Query Quét trùng lặp (app.md p7-05 §4) — mọi tham số ảnh hưởng kết quả nằm trong khoá. */
export const plagiarismKeys = {
  all: ['plagiarism'] as const,
  eligible: (wsId: string, q: string | undefined, folderId: string | undefined) => ['plagiarism', 'eligible', wsId, q ?? '', folderId ?? ''] as const,
  scans: (wsId: string, status: ScanStatus | undefined) => ['plagiarism', 'scans', wsId, status ?? 'ALL'] as const,
  scan: (scanId: string) => ['plagiarism', 'scan', scanId] as const,
  report: (scanId: string) => ['plagiarism', 'report', scanId] as const,
  sections: (scanId: string, resourceId: string, sourceResourceId: string | undefined) =>
    ['plagiarism', 'sections', scanId, resourceId, sourceResourceId ?? 'ALL'] as const,
  context: (scanId: string, sectionId: string) => ['plagiarism', 'context', scanId, sectionId] as const,
};
