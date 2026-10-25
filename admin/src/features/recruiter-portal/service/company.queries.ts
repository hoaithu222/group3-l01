import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { auditLogKeys } from '@/features/audit-log';
import { showToast } from '@/shared/utils/toast.utils';

import { PORTAL_ERROR } from '../constants/portal.constants';
import { errorCodeOf } from '../utils/portal-errors';
import { refreshAuthUser } from '../utils/refresh-auth-user';
import { companyService } from './company.service';
import { portalKeys } from './portal.keys';

/**
 * Doanh nghiệp của tôi (`GET /me/company`) — nguồn DUY NHẤT của `companyId` cho cả cổng. `retry: false`: 404 (chưa thuộc doanh nghiệp / tính năng chưa bật) không tự khỏi
 * khi gọi lại. Làm mới khi có `company:updated` (duyệt/tạm ngưng/đổi gói) — xem `useOfferSocket`.
 */
export const useMyCompany = (enabled = true) =>
  useQuery({
    queryKey: portalKeys.me(),
    queryFn: companyService.myCompany,
    select: (res) => res.data,
    enabled,
    retry: false,
  });

/** Hạn mức lời mời tháng (`GET /companies/:id/usage`) — cho modal gửi lời mời và tab Công ty. */
export const useCompanyUsage = (companyId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: portalKeys.usage(companyId ?? ''),
    queryFn: () => companyService.usage(companyId as string),
    select: (res) => res.data,
    enabled: enabled && !!companyId,
  });

export const useCompanyMembers = (companyId: string | undefined, enabled = true) =>
  useQuery({
    queryKey: portalKeys.members(companyId ?? ''),
    queryFn: () => companyService.members(companyId as string),
    select: (res) => res.data,
    enabled: enabled && !!companyId,
  });

/**
 * Đăng ký doanh nghiệp (`POST /companies`). Thành công → LÀM MỚI `/auth/me` NGAY: BE cấp `recruiter:view` theo dữ liệu (thành viên doanh nghiệp) nên
 * `resolveAudience` chỉ chuyển sang layout recruiter khi store có quyền mới — chờ cache quyền 60 s hoặc lần refresh kế thì người vừa đăng ký kẹt ở màn "không có quyền".
 */
export const useRegisterCompany = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: companyService.register,
    onSuccess: async (res) => {
      qc.setQueryData(portalKeys.me(), res);
      await refreshAuthUser();
    },
  });
};

/** `PATCH /companies/:id` (OWNER). `RES_003` = hồ sơ vừa đổi ở nơi khác → làm mới để có `version` mới (form giữ nguyên nội dung đang nhập). */
export const useUpdateCompany = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: companyService.update,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: portalKeys.all });
      void qc.invalidateQueries({ queryKey: auditLogKeys.all });
      showToast('success', 'Đã lưu hồ sơ doanh nghiệp');
    },
    onError: (err) => {
      if (errorCodeOf(err) === PORTAL_ERROR.versionConflict) {
        void qc.invalidateQueries({ queryKey: portalKeys.me() });
      }
    },
  });
};

/** `POST /companies/:id/resubmit` (OWNER, REJECTED → PENDING). */
export const useResubmitCompany = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: companyService.resubmit,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: portalKeys.all });
      showToast('success', 'Đã gửi duyệt lại — chúng tôi sẽ xác minh trong 1–2 ngày làm việc');
    },
    onError: () => void qc.invalidateQueries({ queryKey: portalKeys.me() }),
  });
};

/** `POST /companies/:id/members` (OWNER, công ty APPROVED). `RECR_011` (đã thuộc doanh nghiệp khác) do interceptor toast; modal giữ mở để đổi email. */
export const useAddMember = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: companyService.addMember,
    onSuccess: (_res, { companyId }) => {
      void qc.invalidateQueries({ queryKey: portalKeys.members(companyId) });
      showToast('success', 'Đã thêm thành viên');
    },
  });
};

/** `DELETE /companies/:id/members/:userId` (OWNER). `RECR_012` = không gỡ được OWNER cuối cùng (interceptor toast). */
export const useRemoveMember = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: companyService.removeMember,
    onSuccess: (_res, { companyId }) => {
      void qc.invalidateQueries({ queryKey: portalKeys.members(companyId) });
      showToast('success', 'Đã gỡ thành viên');
    },
  });
};
