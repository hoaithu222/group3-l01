import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { auditLogKeys } from '@/features/audit-log';
import { showToast } from '@/shared/utils/toast.utils';

import { formatSignedCoins } from '../utils/economy-format.utils';
import { economyKeys } from './economy.queries';
import { economyService } from './economy.service';

/** Mọi lần ghi đều có dòng nhật ký quản trị mới → làm mới cả nhật ký. */
const refreshAudit = (qc: QueryClient): void => {
  void qc.invalidateQueries({ queryKey: auditLogKeys.all });
};

/**
 * `POST /admin/economy/users/:userId/adjust` — làm mới ví + sổ cái của người đó và số liệu tổng quan (số lưu hành, điều chỉnh ròng).
 * `replayed` = cùng `Idempotency-Key` đã xử lý trước đó: số dư KHÔNG đổi thêm, nói rõ để admin không tưởng đã cộng hai lần.
 */
export const useAdjustCoins = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: economyService.adjust,
    onSuccess: (res, vars) => {
      showToast(
        'success',
        res.data.replayed
          ? `Yêu cầu này đã được xử lý trước đó (${formatSignedCoins(res.data.delta)} xu) — số dư không đổi thêm`
          : 'Đã điều chỉnh xu và ghi nhật ký',
      );
      void qc.invalidateQueries({ queryKey: economyKeys.userAll(vars.userId) });
      void qc.invalidateQueries({ queryKey: economyKeys.overviewAll() });
      refreshAudit(qc);
    },
  });
};

/**
 * Các lệnh ghi có CAS (`expectedVersion`): thành công hay lỗi đều làm mới danh sách — lỗi `RES_003` = bản ghi vừa bị sửa ở nơi khác,
 * cần `version` mới (interceptor đã toast "dữ liệu đã thay đổi, vui lòng tải lại").
 */
export const useCreateShopItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: economyService.createItem,
    onSuccess: () => showToast('success', 'Đã thêm vật phẩm và ghi nhật ký'),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: economyKeys.itemsAll() });
      refreshAudit(qc);
    },
  });
};

export const useUpdateShopItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: economyService.updateItem,
    onSuccess: () => showToast('success', 'Đã cập nhật vật phẩm và ghi nhật ký'),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: economyKeys.itemsAll() });
      refreshAudit(qc);
    },
  });
};

export const usePutCoinRule = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: economyService.putRule,
    onSuccess: () => showToast('success', 'Đã lưu quy tắc thưởng và ghi nhật ký'),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: economyKeys.rules() });
      refreshAudit(qc);
    },
  });
};

export const useCreateQuest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: economyService.createQuest,
    onSuccess: () => showToast('success', 'Đã tạo nhiệm vụ và ghi nhật ký'),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: economyKeys.quests() });
      refreshAudit(qc);
    },
  });
};

export const useUpdateQuest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: economyService.updateQuest,
    onSuccess: () => showToast('success', 'Đã cập nhật nhiệm vụ và ghi nhật ký'),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: economyKeys.quests() });
      refreshAudit(qc);
    },
  });
};

/** Thao tác listing (chợ tài liệu P1) đều làm mới hàng chờ duyệt/báo cáo + tổng quan (top listing/lưu hành đổi) + nhật ký. */
const refreshListings = (qc: QueryClient): void => {
  void qc.invalidateQueries({ queryKey: economyKeys.pendingListingsAll() });
  void qc.invalidateQueries({ queryKey: economyKeys.reportedListingsAll() });
  void qc.invalidateQueries({ queryKey: economyKeys.overviewAll() });
  refreshAudit(qc);
};

export const useApproveListing = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: economyService.approveListing,
    onSuccess: () => showToast('success', 'Đã duyệt tin niêm yết và ghi nhật ký'),
    onSettled: () => refreshListings(qc),
  });
};

export const useRejectListing = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: economyService.rejectListing,
    onSuccess: () => showToast('success', 'Đã từ chối tin niêm yết và ghi nhật ký'),
    onSettled: () => refreshListings(qc),
  });
};

/** Ẩn tin tự động hoàn xu cho người mua trong hạn — BE xử lý, giao diện chỉ cần thông báo đã gửi lệnh. */
export const useHideListing = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: economyService.hideListing,
    onSuccess: () => showToast('success', 'Đã ẩn tin niêm yết, hoàn xu cho người mua trong hạn và ghi nhật ký'),
    onSettled: () => refreshListings(qc),
  });
};

export const useRestoreListing = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: economyService.restoreListing,
    onSuccess: () => showToast('success', 'Đã khôi phục tin niêm yết và ghi nhật ký'),
    onSettled: () => refreshListings(qc),
  });
};

/** `PUT /admin/system-config/economy` — CAS `expectedVersion`; lỗi RES_003 (bản mới hơn) do nơi gọi tự xử (đóng form + tải lại), không toast chung ở đây. */
export const useUpdateEconomySettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: economyService.updateSettings,
    onSuccess: () => {
      showToast('success', 'Đã lưu cấu hình chợ và ghi nhật ký');
      void qc.invalidateQueries({ queryKey: economyKeys.settings() });
      refreshAudit(qc);
    },
  });
};
