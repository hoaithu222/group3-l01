import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { showToast } from '@/shared/utils/toast.utils';

import { coinsService } from '../api/coins.service';
import type { InventoryEntry, ShopListing } from '../api/coins.types';
import { useCoinsEnabled } from '../hooks/useCoinsEnabled';
import { coinErrorMessage } from '../utils/coin-errors';
import { setEquipped, setShopEquipped } from '../utils/coins-cache';
import { coinsKeys } from './coins.keys';

/** Kho đồ của tôi (kèm thông tin vật phẩm). Một lượt tải — nhóm theo loại ở máy. */
export function useInventory() {
  const enabled = useCoinsEnabled();
  return useQuery({
    enabled,
    queryFn: () => coinsService.inventory(),
    queryKey: coinsKeys.inventory(),
    retry: false,
    staleTime: 30_000,
  });
}

interface EquipVariables {
  entry: InventoryEntry;
  /** `true` = trang bị, `false` = tháo. */
  equip: boolean;
}

/**
 * Trang bị / tháo — LẠC QUAN (app.md §4): đổi `equipped` trong kho đồ và cửa hàng ngay (trang bị vật phẩm mới thì tháo cái cùng loại, đúng luật server),
 * lỗi ⇒ trả về bản cũ + toast (không thì màn nói "Đang dùng" trong khi server từ chối). Xong luôn làm mới kho đồ/cửa hàng để lấy sự thật từ server.
 * ⚠️ Hồ sơ công khai chưa trả vật phẩm đang trang bị (BE chưa nối `equipped-items.reader` vào endpoint hồ sơ) nên chưa có `profileKeys` nào cần làm mới.
 */
export function useToggleEquip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ entry, equip }: EquipVariables) =>
      equip ? coinsService.equip(entry.id) : coinsService.unequip(entry.id),
    // ⚠️ `onMutate` PHẢI đứng trước `onError`: TypeScript suy kiểu `context` từ giá trị trả về của `onMutate` theo thứ tự khoá.
    onMutate: async ({ entry, equip }) => {
      await queryClient.cancelQueries({ queryKey: coinsKeys.inventory() });
      await queryClient.cancelQueries({ queryKey: coinsKeys.shop() });
      const inventory = queryClient.getQueryData<InventoryEntry[]>(coinsKeys.inventory());
      const shop = queryClient.getQueryData<ShopListing[]>(coinsKeys.shop());
      queryClient.setQueryData<InventoryEntry[]>(coinsKeys.inventory(), (old) =>
        setEquipped(old, entry, equip),
      );
      queryClient.setQueryData<ShopListing[]>(coinsKeys.shop(), (old) =>
        setShopEquipped(old, entry, equip),
      );
      return { inventory, shop };
    },
    onError: (error, _vars, context) => {
      queryClient.setQueryData(coinsKeys.inventory(), context?.inventory);
      queryClient.setQueryData(coinsKeys.shop(), context?.shop);
      showToast('error', coinErrorMessage(error));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: coinsKeys.inventory() });
      void queryClient.invalidateQueries({ queryKey: coinsKeys.shop() });
    },
  });
}
