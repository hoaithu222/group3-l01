import type { useExplorerActions } from '../hooks/useExplorerActions';
import type { useExplorerAdd } from '../hooks/useExplorerAdd';
import type { useItemEditing } from '../hooks/useItemEditing';
import type { ResourceLimits } from '../constants/resource-limits.constants';
import { AddMenuSheet } from './AddMenuSheet';
import { ConfirmDeleteDialog } from './ConfirmDeleteDialog';
import { CreateFolderSheet } from './CreateFolderSheet';
import { MoveToFolderSheet } from './MoveToFolderSheet';
import { RenameSheet } from './RenameSheet';
import { ResourceActionsSheet } from './ResourceActionsSheet';

export interface ExplorerSheetsProps {
  actions: ReturnType<typeof useExplorerActions>;
  add: ReturnType<typeof useExplorerAdd>;
  addMenuOpen: boolean;
  canCreateFolder: boolean;
  canUpload: boolean;
  editing: ReturnType<typeof useItemEditing>;
  limits: ResourceLimits;
  onCloseAddMenu: () => void;
  online: boolean;
  wsId: string;
}

/**
 * Mọi tấm/hộp thoại của FileExplorer gom một chỗ để màn chính chỉ lo bố cục:
 * menu "+", tạo thư mục, menu "⋯", đổi tên, di chuyển, xác nhận xoá.
 * Chỉ VẼ — trạng thái nằm ở các hook `useExplorer*`/`useItemEditing`.
 */
export function ExplorerSheets({
  actions,
  add,
  addMenuOpen,
  canCreateFolder,
  canUpload,
  editing,
  limits,
  onCloseAddMenu,
  online,
  wsId,
}: ExplorerSheetsProps) {
  return (
    <>
      <AddMenuSheet
        canCreateFolder={canCreateFolder}
        canUpload={canUpload}
        online={online}
        visible={addMenuOpen}
        onClose={onCloseAddMenu}
        onSelect={(key) => void add.pick(key)}
      />
      <CreateFolderSheet
        error={add.folderError}
        maxLength={limits.folderNameMax}
        pending={add.folderPending}
        visible={add.folderSheetOpen}
        onClose={add.closeFolderSheet}
        onSubmit={(name) => void add.submitFolder(name)}
      />
      <ResourceActionsSheet
        actions={actions.actions}
        item={actions.menuItem}
        onClose={actions.closeMenu}
        onSelect={actions.select}
      />
      <RenameSheet
        error={editing.error}
        maxLength={editing.maxNameLength}
        pending={editing.pending}
        target={editing.renameTarget}
        onClose={editing.close}
        onSubmit={(name) => void editing.submitRename(name)}
      />
      <MoveToFolderSheet
        error={editing.error}
        maxDepth={limits.folderDepthMax}
        pending={editing.pending}
        target={editing.moveTarget}
        wsId={wsId}
        onClose={editing.close}
        onMove={(destinationId) => void editing.submitMove(destinationId)}
      />
      <ConfirmDeleteDialog
        item={actions.deleteItem}
        pending={actions.deletePending}
        retentionDays={limits.trashRetentionDays}
        onClose={actions.closeDelete}
        onConfirm={() => void actions.confirmDelete()}
      />
    </>
  );
}
