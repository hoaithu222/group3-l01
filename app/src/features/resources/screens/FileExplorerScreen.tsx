import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { SearchInput, useSearchInput } from '@/shared/ui/search';

import { ROOT_FOLDER, type FolderRef, type ResourceType } from '../api';
import { ExplorerList } from '../components/ExplorerList';
import { ExplorerSheets } from '../components/ExplorerSheets';
import { ExplorerToolbar } from '../components/ExplorerToolbar';
import { FolderBreadcrumb } from '../components/FolderBreadcrumb';
import { StorageUsageBanner } from '../components/StorageUsageBanner';
import { UploadQueueBar } from '../components/UploadQueueBar';
import { useExplorerActions } from '../hooks/useExplorerActions';
import { useExplorerAdd } from '../hooks/useExplorerAdd';
import { useExplorerData } from '../hooks/useExplorerData';
import { useExplorerPrefs } from '../hooks/useExplorerPrefs';
import { useIsOnline } from '../hooks/useIsOnline';
import { useItemEditing } from '../hooks/useItemEditing';
import { useResourceLimits } from '../hooks/useResourceLimits';
import { useResourceNavigation } from '../hooks/useResourceNavigation';
import { useExplorerAccess, useStorageUsage } from '../queries/workspace-access.queries';

/**
 * Trình duyệt tệp của workspace (app.md p3-01 §3): breadcrumb · lưới/danh sách ·
 * sắp xếp · lọc loại · tìm không dấu (IME-safe) · thư mục CRUD · menu theo quyền ·
 * hàng đợi tải lên · banner dung lượng · trạng thái rỗng/tải/lỗi/ngoại tuyến.
 * Cùng một màn cho gốc (`resources/index`) và thư mục con (`resources/[folderId]`).
 *
 * Màn chỉ LẮP BỐ CỤC — dữ liệu ở `useExplorerData`, thao tác ở `useExplorerActions`/
 * `useItemEditing`/`useExplorerAdd`, các tấm ở `ExplorerSheets`. Đợt sau (P1):
 * `resource:changed` realtime, bố cục 2 pane trên máy tính bảng.
 */
export function FileExplorerScreen() {
  const { folderId: folderParam, wsId } = useLocalSearchParams<{
    folderId?: string;
    wsId: string;
  }>();
  const folderId: FolderRef = folderParam ?? ROOT_FOLDER;
  const nav = useResourceNavigation(wsId);
  const online = useIsOnline();
  const limits = useResourceLimits();
  const access = useExplorerAccess(wsId);
  const { capabilities } = access;
  const { prefs, update } = useExplorerPrefs(access.userId);
  const [typeFilter, setTypeFilter] = useState<ResourceType | 'ALL'>('ALL');
  const [searchOpen, setSearchOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const search = useSearchInput();

  const data = useExplorerData({
    folderId,
    prefs,
    query: searchOpen ? search.value : '',
    typeFilter,
    wsId,
  });
  const storage = useStorageUsage(wsId, capabilities.canUpload);
  const remainingBytes = storage.data
    ? Math.max(0, storage.data.quotaBytes - storage.data.usedBytes)
    : undefined;
  const add = useExplorerAdd({ folderId, remainingBytes, wsId });
  const editing = useItemEditing(wsId, data.items, limits);
  const actions = useExplorerActions({
    inSearch: data.searching,
    items: data.items,
    online,
    onEdit: editing.start,
    wsId,
  });

  const canAdd = capabilities.canUpload || capabilities.canCreateFolder;
  // ✅ Trạng thái rỗng chỉ có MỘT CTA ("Thêm tài liệu") mở đúng menu của nút "+" trên thanh tiêu đề — trước đây là hai nút
  // ("Tải lên" + "Tạo thư mục") lặp lại các mục của menu đó. Menu đã tự lọc theo quyền (`canUpload`/`canCreateFolder`).
  const emptyActions =
    online && !data.searching && canAdd
      ? [{ label: 'Thêm tài liệu', onPress: () => setAddMenuOpen(true) }]
      : [];

  const toggleSearch = () => {
    if (searchOpen) search.clear();
    setSearchOpen((open) => !open);
  };

  return (
    <Screen
      header={
        <AppBar
          actions={
            <View className="flex-row items-center gap-xs">
              <Button
                accessibilityLabel="Tìm tài liệu"
                iconLeft="search"
                iconOnly
                size="sm"
                variant="tertiary"
                onPress={toggleSearch}
              />
              {canAdd ? (
                <Button
                  accessibilityLabel="Thêm vào kho"
                  iconLeft="add"
                  iconOnly
                  size="sm"
                  variant="tertiary"
                  onPress={() => setAddMenuOpen(true)}
                />
              ) : null}
            </View>
          }
          title={data.currentFolder?.name ?? 'Tài liệu'}
          onBack={nav.back}
        />
      }
      padded={false}
      scrollable={false}
    >
      <View className="flex-1 gap-xs pt-xs">
        {!online ? (
          <View className="px-md">
            <Alert
              description="Bạn đang xem dữ liệu đã lưu. Kết nối lại để tải lên hoặc thay đổi."
              title="Bạn đang ngoại tuyến"
              tone="warning"
            />
          </View>
        ) : null}
        <StorageUsageBanner enabled={capabilities.canUpload} wsId={wsId} />
        {searchOpen ? (
          <View className="px-md">
            <SearchInput {...search.inputProps} placeholder="Tìm tài liệu trong nhóm" />
          </View>
        ) : null}
        {data.searching ? null : (
          <FolderBreadcrumb segments={data.breadcrumb} onNavigate={nav.goToFolder} />
        )}
        <ExplorerToolbar
          prefs={prefs}
          typeFilter={typeFilter}
          onOpenTrash={nav.openTrash}
          onSortChange={(option) => update({ order: option.order, sort: option.sort })}
          onTypeChange={setTypeFilter}
          onViewChange={(view) => update({ view })}
        />
        <View className="flex-1">
          <ExplorerList
            data={data}
            emptyActions={emptyActions}
            view={prefs.view}
            onClearSearch={() => {
              search.clear();
              setSearchOpen(false);
            }}
            onLeave={nav.toWorkspace}
            onMore={actions.onMore}
            onOpen={actions.open}
          />
        </View>
        <UploadQueueBar wsId={wsId} />
      </View>

      <ExplorerSheets
        actions={actions}
        add={add}
        addMenuOpen={addMenuOpen}
        canCreateFolder={capabilities.canCreateFolder}
        canUpload={capabilities.canUpload}
        editing={editing}
        limits={limits}
        online={online}
        wsId={wsId}
        onCloseAddMenu={() => setAddMenuOpen(false)}
      />
    </Screen>
  );
}
