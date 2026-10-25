/**
 * Kiểu dữ liệu tab "Kiểm tra trùng lặp" — khớp `AdminPlagiarismService` phía BE (`be/src/modules/plagiarism`, p7-05
 * be.md §5.5). Admin KHÔNG BAO GIỜ thấy tên tệp/nội dung/điểm theo tệp của một nhóm.
 */

export type PlagiarismRange = '7d' | '30d' | '90d';

export interface PlagiarismOverview {
  scans: { total: number; completed: number; failed: number; cancelled: number };
  p95DurationSec: number | null;
  fingerprints: { byStatus: Record<string, number> };
  levelDistribution: Record<string, number>;
  topWorkspaces: Array<{ workspaceId: string; name: string; scans: number }>;
}

export interface PlagiarismConfig {
  thresholds: { medium: number; high: number };
  minSectionTokens: number;
  commonDocFrequencyPercent: number;
  scansPerWorkspacePerDay: number;
  codeLanguages: string[];
  boilerplatePhrases: string[];
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface UpdatePlagiarismConfigPayload {
  thresholds: { medium: number; high: number };
  minSectionTokens: number;
  commonDocFrequencyPercent: number;
  scansPerWorkspacePerDay: number;
  codeLanguages: string[];
  boilerplatePhrases: string[];
  expectedVersion: number;
  reason: string;
}

export interface ReindexPayload {
  workspaceId?: string;
  reason: string;
}

export interface ReindexResult {
  queued: number;
}
