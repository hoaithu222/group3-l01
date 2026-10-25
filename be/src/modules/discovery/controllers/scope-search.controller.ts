import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { CursorMeta } from "../../../core/utils/response";
import type { ScopeSearchQueryDto } from "../dtos";
import type { DiscoveryScopeType } from "../entities/discovery.interface";
import type { ScopeSearchService } from "../services/scope-search.service";

export function createScopeSearchController(service: ScopeSearchService) {
  /** `req.params.scopeType/scopeId` do route gốc hoặc alias `/channels|/conversations/:id/search` (`injectScope`). */
  const search = catchAsync(async (req: Request, res: Response) => {
    const result = await service.search(
      req.user!,
      req.params.scopeType as DiscoveryScopeType,
      req.params.scopeId,
      req.query as unknown as ScopeSearchQueryDto
    );
    // `partial` là trường mở rộng của meta cursor chuẩn (khai báo thường, không phải object literal → không dính excess-property check).
    const meta: CursorMeta & { partial: boolean } = result.meta;
    ResponseUtils.cursor(res, { data: result.data, meta });
  });

  return { search };
}
