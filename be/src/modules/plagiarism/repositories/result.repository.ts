import type { FingerprintKind, PlagiarismLevel, PlagiarismResultStatus } from "@prisma/client";
import { prisma } from "../../../infrastructure/database";

export interface MatchedSourceRow {
  resourceId: string;
  nameSnapshot: string;
  similarity: number;
}

export interface ResultRow {
  id: string;
  scanId: string;
  targetResourceId: string;
  targetName: string;
  kind: FingerprintKind | null;
  status: PlagiarismResultStatus;
  skipReason: string | null;
  score: number;
  level: PlagiarismLevel | null;
  matchedSources: MatchedSourceRow[];
  sectionCount: number;
  createdAt: Date;
}

export interface UpsertResultInput {
  scanId: string;
  targetResourceId: string;
  targetName: string;
  kind: FingerprintKind | null;
  status: PlagiarismResultStatus;
  skipReason: string | null;
  score: number;
  level: PlagiarismLevel | null;
  matchedSources: MatchedSourceRow[];
  sectionCount: number;
}

export interface IResultRepository {
  upsert(input: UpsertResultInput): Promise<ResultRow>;
  listByScan(scanId: string): Promise<ResultRow[]>;
  findByTarget(scanId: string, targetResourceId: string): Promise<ResultRow | null>;
  deleteByScan(scanId: string): Promise<void>;
}

export class PrismaResultRepository implements IResultRepository {
  upsert(input: UpsertResultInput): Promise<ResultRow> {
    const shared = {
      targetName: input.targetName,
      kind: input.kind,
      status: input.status,
      skipReason: input.skipReason,
      score: input.score,
      level: input.level,
      matchedSources: input.matchedSources,
      sectionCount: input.sectionCount,
    };
    return prisma.plagiarismResult.upsert({
      where: { scanId_targetResourceId: { scanId: input.scanId, targetResourceId: input.targetResourceId } },
      create: { scanId: input.scanId, targetResourceId: input.targetResourceId, ...shared },
      update: shared,
    });
  }

  listByScan(scanId: string): Promise<ResultRow[]> {
    return prisma.plagiarismResult.findMany({ where: { scanId }, orderBy: [{ score: "desc" }, { targetName: "asc" }] });
  }

  findByTarget(scanId: string, targetResourceId: string): Promise<ResultRow | null> {
    return prisma.plagiarismResult.findUnique({ where: { scanId_targetResourceId: { scanId, targetResourceId } } });
  }

  async deleteByScan(scanId: string): Promise<void> {
    await prisma.plagiarismResult.deleteMany({ where: { scanId } });
  }
}
