import type { Request, Response } from "express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import { ValidationError, UnauthorizedError } from "../../../core/exceptions";
import type { AssetService } from "../services/asset.service";
import { LocalStorage } from "../../../infrastructure/storage";
import type { AssetDownloadQuery } from "../dtos/asset-url.dto";
import type { AssetUrlQuery } from "../dtos/asset-url.dto";
import type { CompleteAssetDto } from "../dtos/complete-asset.dto";

export function createAssetController(assetService: AssetService) {
  const create = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const { asset, upload } = await assetService.create(req.user.id, req.body);
    ResponseUtils.success(res, { asset, upload }, "Đã đăng ký tệp, sẵn sàng nhận nội dung", 201);
  });

  const uploadContent = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    if (!req.file) throw new ValidationError("Thiếu tệp tải lên (field 'file')");
    const asset = await assetService.uploadContent(req.params.id, req.user.id, req.file);
    ResponseUtils.success(res, asset, "Đã tải nội dung, đang xử lý");
  });

  const complete = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const asset = await assetService.complete(req.params.id, req.user.id, req.body as CompleteAssetDto);
    ResponseUtils.success(res, asset, "Đã ghi nhận tệp, đang xử lý");
  });

  const reissueUploadUrl = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const upload = await assetService.reissueUploadUrl(req.params.id, req.user.id);
    ResponseUtils.success(res, upload, "Chỉ dẫn tải lên mới");
  });

  const abort = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    await assetService.abort(req.params.id, req.user.id);
    ResponseUtils.success(res, { status: "DELETED" }, "Đã huỷ tải lên");
  });

  const getById = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const asset = await assetService.getById(req.params.id, req.user);
    ResponseUtils.success(res, asset, "Thông tin tệp");
  });

  const getUrl = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    const query = req.query as unknown as AssetUrlQuery;
    const result = await assetService.getUrl(req.params.id, req.user, query);
    ResponseUtils.success(res, result, "Đường dẫn tải tệp");
  });

  const remove = catchAsync(async (req: Request, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
    await assetService.delete(req.params.id, req.user.id);
    ResponseUtils.success(res, { deleted: true }, "Đã xoá tệp");
  });

  /** Gateway tải cục bộ (chỉ mount khi STORAGE_TYPE=local) — kiểm HMAC thay vì auth Bearer. */
  const download = catchAsync(async (req: Request, res: Response) => {
    const { variant, exp, sig } = req.query as unknown as AssetDownloadQuery;
    const asset = await assetService.verifyLocalDownload(req.params.id, variant, exp, sig);
    const localStorage = new LocalStorage();
    const buffer = await localStorage.readFile(asset.storageKey);
    res.setHeader("Content-Type", asset.mime);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(asset.originalName)}"`
    );
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.send(buffer);
  });

  return {
    create,
    uploadContent,
    complete,
    reissueUploadUrl,
    abort,
    getById,
    getUrl,
    remove,
    download,
  };
}
