import { AuditService } from "../audit-log/audit-log.service";
import { PrismaFingerprintRepository } from "./repositories/fingerprint.repository";
import { PrismaResourceReadRepository } from "./repositories/resource-read.repository";
import { PrismaResultRepository } from "./repositories/result.repository";
import { PrismaScanRepository } from "./repositories/scan.repository";
import { PrismaSectionRepository } from "./repositories/section.repository";
import { PrismaOutboxPort, PrismaTxRunner } from "./repositories/tx";
import { AdminPlagiarismService } from "./services/admin-plagiarism.service";
import { PublicPlagiarismAssetReader } from "./services/asset-reader";
import { FingerprintIndexService } from "./services/fingerprint-index.service";
import { PlagiarismConfigService } from "./services/plagiarism-config.service";
import { ReportService } from "./services/report.service";
import { ScanRunnerService } from "./services/scan-runner.service";
import { ScanService } from "./services/scan.service";
import { SocketScanEmitter } from "./services/scan-emitter";

/** Nối dây DI cho module `plagiarism` — dùng chung bởi routes + jobs (mẫu `coins.container.ts`, không có DI container thật). */
export function createPlagiarismContainer() {
  const resources = new PrismaResourceReadRepository();
  const fingerprints = new PrismaFingerprintRepository();
  const scans = new PrismaScanRepository();
  const results = new PrismaResultRepository();
  const sections = new PrismaSectionRepository();
  const tx = new PrismaTxRunner();
  const outbox = new PrismaOutboxPort();
  const assets = new PublicPlagiarismAssetReader();
  const config = new PlagiarismConfigService();
  const emitter = new SocketScanEmitter();
  const audit = new AuditService();

  const fingerprintIndex = new FingerprintIndexService({ fingerprints, resources, assets, config });
  const scanService = new ScanService({ scans, fingerprints, resources, config, tx, outbox, emitter });
  const scanRunner = new ScanRunnerService({ scans, fingerprints, resources, results, sections, tx, emitter });
  const reportService = new ReportService({ scans, results, sections, fingerprints, resources });
  const adminService = new AdminPlagiarismService({ fingerprints, audit });

  return { resources, fingerprints, scans, results, sections, tx, outbox, assets, config, emitter, fingerprintIndex, scanService, scanRunner, reportService, adminService };
}

export type PlagiarismContainer = ReturnType<typeof createPlagiarismContainer>;

let cached: PlagiarismContainer | null = null;

export function getPlagiarismContainer(): PlagiarismContainer {
  cached ??= createPlagiarismContainer();
  return cached;
}
