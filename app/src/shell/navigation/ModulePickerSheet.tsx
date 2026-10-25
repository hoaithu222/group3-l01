import { useMemo } from 'react';

import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { EmptyState } from '@/shared/ui/empty-state';
import { hapticTap, hapticWarning } from '@/shared/utils/haptics';

import { ModulePickerGroup, type ModulePinState } from './ModulePickerGroup';
import { useModulePickerStore } from './module-picker.store';
import { MAX_PINNED_MODULES, MIN_MODULES_FOR_HERO } from './module-pins.store';
import { openModule } from './open-module';
import { toggleModulePin } from './toggle-module-pin';
import type { ModuleConfig } from './types';
import { useAccessibleModules } from './use-accessible-modules';
import { useModulePrefs } from './use-module-prefs';

const MAX = String(MAX_PINNED_MODULES);

/**
 * Dòng mô tả dưới tiêu đề — nơi DUY NHẤT nói luật ghim (nút ghim của phân hệ chưa ghim bị khoá khi đủ ô, xem `PinToggle`).
 * ⚠️ Hai câu có ĐỘ DÀI xấp xỉ nhau là cố ý: câu đổi lúc ghim ô cuối, lệch số dòng là đầu tấm cao/thấp đi một dòng và cả danh
 * sách nhảy theo đúng lúc người dùng đang nhìn vào nút vừa bấm.
 */
function pinDescription(canPin: boolean, pinnedCount: number): string {
  if (!canPin) return 'Tất cả phân hệ của Super App';
  if (pinnedCount >= MAX_PINNED_MODULES) {
    return `Đã ghim đủ ${MAX}/${MAX} · bỏ ghim một phân hệ để ghim phân hệ khác`;
  }
  return `Ghim tối đa ${MAX} phân hệ lên đầu Trang chủ · đã ghim ${String(pinnedCount)}/${MAX}`;
}

/**
 * Danh sách phân hệ — tấm trượt từ đáy liệt kê TẤT CẢ phân hệ người dùng được vào, chia HAI nhóm: "Phân hệ chính" (có tab ở
 * thanh dưới, `placement: 'bar'`) và "Phân hệ khác" (`menu`), kèm mô tả và nút GHIM lên đầu Trang chủ. Mở bằng: giữ nút Trang
 * chủ trên thanh tab, hoặc nút "Tất cả (N)" ở Trang chủ.
 *
 * ── Nguồn dữ liệu ───────────────────────────────────────────────────────────
 * `useAccessibleModules()` — đã lọc quyền và cờ phân hệ như thanh tab, nên phân hệ đang tắt ở backend
 * không lọt vào đây (⛔ đừng tự lọc lại ở chỗ này — xem `use-accessible-modules.ts`). Tấm liệt kê CẢ phân hệ chính lẫn phụ:
 * Trang chủ hiện cả hai và ghim áp cho tất cả — thiếu nhóm nào là "Tất cả (N)" mở ra một danh sách ngắn hơn N.
 * Nhóm chia theo `placement` (không theo ghim) để ghim/bỏ ghim KHÔNG đổi chỗ hàng nào.
 *
 * ── Ghim ────────────────────────────────────────────────────────────────────
 * Nút ghim là lối RÕ RÀNG cho cử chỉ nhấn giữ (ẩn) ở Trang chủ. Đủ `MAX_PINNED_MODULES` ô thì nút ghim của phân hệ còn lại bị
 * KHOÁ và mô tả tấm nói vì sao — không đợi người dùng bấm rồi mới báo (dòng báo chen vào đầu tấm làm cả danh sách nhảy xuống).
 * ⚠️ Vẫn xử lý `full` (rung "bị chặn") phòng ghim đổi ở nơi khác giữa lúc vẽ và lúc chạm. Ít phân hệ đến mức Trang chủ không
 * tách tầng hero (`MIN_MODULES_FOR_HERO`) thì ẩn nút ghim — ghim khi đó không có chỗ hiện.
 *
 * ── Điều hướng ──────────────────────────────────────────────────────────────
 * Đóng tấm rồi mới `openModule` (= ghi lượt mở + `router.push`): `BottomSheet` là `<Modal>` native, đẩy route trong
 * lúc nó còn mở thì màn mới dựng phía dưới cửa sổ modal và người dùng thấy tấm đứng yên rồi mới nhảy.
 *
 * Mount MỘT lần ở `app/(app)/_layout.tsx` (sibling của `Tabs`, cùng chỗ với `ModerationHost`) — nên cũng là nơi nạp
 * sở thích ghim của người dùng khi Trang chủ chưa từng mở (`useModulePrefs`).
 */
export function ModulePickerSheet() {
  const visible = useModulePickerStore((state) => state.visible);
  const close = useModulePickerStore((state) => state.close);
  const modules = useAccessibleModules();
  const { pinned, ready } = useModulePrefs();

  const availableIds = useMemo(() => modules.map((module) => module.id), [modules]);
  const groups = useMemo(
    () =>
      [
        { title: 'Phân hệ chính', items: modules.filter((module) => module.placement === 'bar') },
        { title: 'Phân hệ khác', items: modules.filter((module) => module.placement === 'menu') },
      ].filter((group) => group.items.length > 0),
    [modules],
  );
  const canPin = ready && modules.length >= MIN_MODULES_FOR_HERO;
  // Ghim của phân hệ vừa mất quyền/tắt cờ KHÔNG tính vào trần — cùng luật với `toggle` của store (ghim vô hình không chiếm ô).
  const pinnedCount = Math.min(
    pinned.filter((id) => availableIds.includes(id)).length,
    MAX_PINNED_MODULES,
  );

  const togglePin = (moduleId: string) => {
    const result = toggleModulePin(moduleId, availableIds);
    // Ghim/bỏ ghim ⇒ nhịp "chạm" (cùng nhịp nhấn giữ ở Trang chủ, bảng nhịp ở `haptics.ts`); `full` = chạm nút ghim đang KHOÁ
    // (nút vẫn nhận chạm để cú chạm không lọt xuống hàng — xem `PinToggle`) ⇒ nhịp "bị chặn". `not-ready` thì không có gì xảy ra.
    if (result === 'full') hapticWarning();
    else if (result !== 'not-ready') hapticTap();
  };

  const pin: ModulePinState | null = canPin
    ? { full: pinnedCount >= MAX_PINNED_MODULES, pinned, onToggle: togglePin }
    : null;

  const open = (module: ModuleConfig) => {
    close();
    openModule(module);
  };

  return (
    <BottomSheet
      description={pinDescription(canPin, pinnedCount)}
      padded={false}
      scrollable
      title="Chọn phân hệ"
      visible={visible}
      onClose={close}
    >
      {modules.length === 0 ? (
        // `EmptyState` tự có lề `px-md` — ⛔ không bọc `SheetList` (lề đúp 32dp).
        <EmptyState
          description="Chưa có phân hệ nào được bật."
          icon="setting"
          size="compact"
          tone="neutral"
        />
      ) : (
        // `padded={false}` ⇒ thân tấm KHÔNG có lề ngang, mà `ListItem` cũng không tự có (nó vốn nằm trong `Card` đã có đệm) — bỏ
        // `SheetList` là icon dính mép trái, nút ghim dính mép phải, lệch 16dp so với tiêu đề. `gap-md` = khe giữa hai nhóm.
        <SheetList className="gap-md pb-md">
          {groups.map((group) => (
            <ModulePickerGroup
              key={group.title}
              modules={group.items}
              pin={pin}
              title={group.title}
              onOpen={open}
            />
          ))}
        </SheetList>
      )}
    </BottomSheet>
  );
}
