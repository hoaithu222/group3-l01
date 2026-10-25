import type { Request, Response } from "express";
import { UnauthorizedError } from "../../../core/exceptions";
import type { AuthUser } from "../../../core/types/express";
import { catchAsync } from "../../../core/utils/catchAsync";
import { ResponseUtils } from "../../../core/utils/response";
import type { AddMemberDto, RegisterCompanyDto, UpdateCompanyDto } from "../dtos";
import type { CompanyMemberService } from "../services/company-member.service";
import type { CompanyService } from "../services/company.service";

export function requireUser(req: Request): AuthUser {
  if (!req.user) throw new UnauthorizedError("Bạn cần đăng nhập");
  return req.user;
}

/** Hồ sơ doanh nghiệp + nhân sự phía HR (be.md §4). Quyền/thành viên đã kiểm bởi `companyScope` trước khi vào đây. */
export function createCompanyController(companies: CompanyService, members: CompanyMemberService) {
  const register = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await companies.register(requireUser(req), req.body as RegisterCompanyDto), "Đã gửi hồ sơ doanh nghiệp, chờ duyệt", 201);
  });

  const mine = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await companies.getMine(requireUser(req)), "Doanh nghiệp của tôi");
  });

  const get = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await companies.get(requireUser(req), req.params.companyId), "Doanh nghiệp");
  });

  const update = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await companies.update(requireUser(req), req.params.companyId, req.body as UpdateCompanyDto), "Đã cập nhật doanh nghiệp");
  });

  const resubmit = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await companies.resubmit(requireUser(req), req.params.companyId), "Đã gửi duyệt lại");
  });

  const usage = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await companies.usage(req.params.companyId), "Hạn mức lời mời");
  });

  const listMembers = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await members.list(req.params.companyId), "Nhân sự doanh nghiệp");
  });

  const addMember = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await members.add(requireUser(req), req.params.companyId, req.body as AddMemberDto), "Đã thêm nhân sự", 201);
  });

  const removeMember = catchAsync(async (req: Request, res: Response) => {
    ResponseUtils.success(res, await members.remove(requireUser(req), req.params.companyId, req.params.userId), "Đã gỡ nhân sự");
  });

  return { register, mine, get, update, resubmit, usage, listMembers, addMember, removeMember };
}
