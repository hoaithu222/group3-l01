export type ScanMode = 'WITHIN_SELECTION' | 'WORKSPACE';
export type ScanStatus = 'QUEUED' | 'INDEXING' | 'SCANNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
export type FingerprintStatus = 'PENDING' | 'READY' | 'NO_TEXT' | 'UNSUPPORTED' | 'TOO_LARGE' | 'FAILED';
export type PlagiarismLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface EligibleResource {
  resourceId: string;
  name: string;
  extension: string | null;
  size: number;
  kind: 'TEXT' | 'CODE' | null;
  fingerprintStatus: FingerprintStatus | 'UNSUPPORTED';
  truncated: boolean;
}

export interface ScanMyActions {
  cancel: boolean;
  delete: boolean;
  export: boolean;
}

export interface ScanSummary {
  id: string;
  workspaceId: string;
  requestedBy: string;
  mode: ScanMode;
  targetResourceIds: string[];
  excludeResourceIds: string[];
  excludeFolderIds: string[];
  note: string | null;
  status: ScanStatus;
  progress: number;
  failureCode: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  expiresAt: string;
  createdAt: string;
  myActions?: ScanMyActions;
  serverNow?: string;
}

export interface MatchedSource {
  resourceId: string;
  nameSnapshot: string;
  similarity: number;
}

export interface ScanResult {
  id: string;
  scanId: string;
  targetResourceId: string;
  targetName: string;
  kind: 'TEXT' | 'CODE' | null;
  status: 'OK' | 'SKIPPED';
  skipReason: string | null;
  score: number;
  level: PlagiarismLevel | null;
  matchedSources: MatchedSource[];
  sectionCount: number;
}

export interface PairScore {
  a: string;
  b: string;
  aInB: number;
  bInA: number;
}

export interface ScanReport {
  scan: ScanSummary;
  disclaimer: string;
  results: ScanResult[];
  pairs?: PairScore[];
}

export interface SpanRange {
  startToken: number;
  endToken: number;
  startChar: number;
  endChar: number;
  lineStart: number;
  lineEnd: number;
}

export interface PlagiarismSection {
  id: string;
  order: number;
  sourceResourceId: string;
  sourceName: string;
  target: SpanRange;
  source: SpanRange;
  similarity: number;
  matchedHashes: number;
}

export type Excerpt =
  | {
      resourceId: string;
      name: string;
      kind: string | null;
      language: string | null;
      lineStart: number;
      lineEnd: number;
      text: string;
      highlights: { from: number; to: number }[];
      stale: boolean;
    }
  | { unavailable: true; reason: 'DELETED' | 'NO_ACCESS' };

export interface SectionContext {
  left: Excerpt;
  right: Excerpt;
}

export interface CreateScanPayload {
  targetResourceIds: string[];
  mode: ScanMode;
  excludeResourceIds: string[];
  excludeFolderIds: string[];
  note?: string;
}

export interface PlagiarismScanUpdatedPayload {
  v: 1;
  scanId: string;
  workspaceId: string;
  status: ScanStatus;
  progress: number;
  failureCode?: string;
  serverNow: string;
}
