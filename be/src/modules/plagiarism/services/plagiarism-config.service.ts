import { runtimeConfig } from "../../../core/config/runtime-config";
import { LIMITS } from "../../../core/constants/limits";
import { createSystemConfigService, type SystemConfigActor } from "../../system-config/public";
import type { CodeLanguage } from "../lib/types";

const CONFIG_KEY = "plagiarism";
const ALL_CODE_LANGUAGES: readonly CodeLanguage[] = ["c-like", "python", "sql", "markup"];

export interface PlagiarismRuntimeConfig {
  thresholds: { medium: number; high: number };
  minSectionTokens: number;
  commonDocFrequencyPercent: number;
  scansPerWorkspacePerDay: number;
  codeLanguages: CodeLanguage[];
  boilerplatePhrases: string[];
}

export interface PlagiarismConfigDto extends PlagiarismRuntimeConfig {
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface UpdatePlagiarismConfigInput {
  expectedVersion: number;
  reason: string;
  thresholds: { medium: number; high: number };
  minSectionTokens: number;
  commonDocFrequencyPercent: number;
  scansPerWorkspacePerDay: number;
  codeLanguages: CodeLanguage[];
  boilerplatePhrases: string[];
}

function isCodeLanguage(v: unknown): v is CodeLanguage {
  return v === "c-like" || v === "python" || v === "sql" || v === "markup";
}

function toRuntimeConfig(effective: Record<string, unknown>): PlagiarismRuntimeConfig {
  const thresholds = effective["thresholds"] as { medium?: number; high?: number } | undefined;
  const codeLanguagesRaw = Array.isArray(effective["codeLanguages"]) ? (effective["codeLanguages"] as unknown[]).filter(isCodeLanguage) : [];
  const boilerplatePhrases = Array.isArray(effective["boilerplatePhrases"]) ? (effective["boilerplatePhrases"] as unknown[]).filter((p): p is string => typeof p === "string") : [];
  return {
    thresholds: {
      medium: typeof thresholds?.medium === "number" ? thresholds.medium : LIMITS.plagiarism.thresholds.medium,
      high: typeof thresholds?.high === "number" ? thresholds.high : LIMITS.plagiarism.thresholds.high,
    },
    minSectionTokens: typeof effective["minSectionTokens"] === "number" ? (effective["minSectionTokens"] as number) : LIMITS.plagiarism.minSectionTokens,
    commonDocFrequencyPercent:
      typeof effective["commonDocFrequencyPercent"] === "number" ? (effective["commonDocFrequencyPercent"] as number) : LIMITS.plagiarism.commonDocFrequencyPercent,
    scansPerWorkspacePerDay:
      typeof effective["scansPerWorkspacePerDay"] === "number" ? (effective["scansPerWorkspacePerDay"] as number) : LIMITS.plagiarism.scansPerWorkspacePerDay,
    codeLanguages: codeLanguagesRaw.length > 0 ? codeLanguagesRaw : [...ALL_CODE_LANGUAGES],
    boilerplatePhrases,
  };
}

/**
 * Đọc/ghi `SystemConfig` khoá `plagiarism` (be.md §5.5, §9) — cùng mẫu `burnout/services/burnout.ports.ts`
 * (`SystemConfigRulesAdminPort`): ghi qua `SystemConfigService` (kiểm hình dạng theo `SYSTEM_CONFIG_REGISTRY`, CAS
 * `version`, xoá cache đa instance, audit `system-config.update`); đọc nhanh cho đường nóng (`scan.service`) qua
 * `runtimeConfig.getEffective` (cache Redis). Mọi số không vượt trần `LIMITS.plagiarism` (registry đã áp floor/ceil).
 */
export class PlagiarismConfigService {
  private readonly service = createSystemConfigService();

  async current(): Promise<PlagiarismRuntimeConfig> {
    return toRuntimeConfig(await runtimeConfig.getEffective(CONFIG_KEY));
  }

  /**
   * Ảnh chụp lưu vào `PlagiarismScan.configSnapshot` lúc tạo lượt quét (be.md §5.2 bước 3: "configSnapshot = config.snapshot()")
   * — gộp phần admin chỉnh được (ngưỡng, minSectionTokens, boilerplate…) với tham số thuật toán CỐ ĐỊNH của `LIMITS.plagiarism`
   * (k/window, mergeGapTokens, minPairPercent…) để lượt quét không đổi kết quả khi admin sửa cấu hình SAU lúc quét.
   */
  async snapshot(): Promise<Record<string, unknown>> {
    const cfg = await this.current();
    return {
      ...cfg,
      text: LIMITS.plagiarism.text,
      code: LIMITS.plagiarism.code,
      mergeGapTokens: LIMITS.plagiarism.mergeGapTokens,
      minPairPercent: LIMITS.plagiarism.minPairPercent,
      candidateSourcesMax: LIMITS.plagiarism.candidateSourcesMax,
      sectionsPerTargetMax: LIMITS.plagiarism.sectionsPerTargetMax,
      commonDocMinCount: LIMITS.plagiarism.commonDocMinCount,
    };
  }

  async getForAdmin(): Promise<PlagiarismConfigDto> {
    const dto = await this.service.getOne(CONFIG_KEY);
    return { ...toRuntimeConfig(dto.effective), version: dto.version, updatedAt: dto.updatedAt ? dto.updatedAt.toISOString() : null, updatedBy: dto.updatedBy };
  }

  async update(input: UpdatePlagiarismConfigInput, actor: SystemConfigActor): Promise<PlagiarismConfigDto> {
    const value = {
      thresholds: input.thresholds,
      minSectionTokens: input.minSectionTokens,
      commonDocFrequencyPercent: input.commonDocFrequencyPercent,
      scansPerWorkspacePerDay: input.scansPerWorkspacePerDay,
      codeLanguages: input.codeLanguages,
      boilerplatePhrases: input.boilerplatePhrases,
    };
    const dto = await this.service.update(CONFIG_KEY, { value, expectedVersion: input.expectedVersion, reason: input.reason }, actor);
    return { ...toRuntimeConfig(dto.effective), version: dto.version, updatedAt: dto.updatedAt ? dto.updatedAt.toISOString() : null, updatedBy: dto.updatedBy };
  }
}
