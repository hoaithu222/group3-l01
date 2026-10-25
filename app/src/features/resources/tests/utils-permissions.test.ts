import { describeItem } from '../utils/describe-item';
import { canModifyItem } from '../utils/explorer-items';
import { buildItemActions } from '../utils/item-actions';
import { resolveExplorerCapabilities } from '../utils/resource-permissions';
import { makeFolder, makeResource } from './fixtures';

/**
 * Quyền Resource Hub (README p3-01 §6). Quyền theo MỤC do BE tính (`canModify`, `canRestore`, `canPurge`) — client
 * chỉ ĐỌC; quyền cấp KHO chỉ suy từ `status` của workspace.
 */
describe('quyền cấp kho (theo status workspace)', () => {
  it('ACTIVE ⇒ tải lên/tạo thư mục được, không readOnly', () => {
    expect(resolveExplorerCapabilities('ACTIVE')).toEqual({
      canCreateFolder: true,
      canUpload: true,
      readOnly: false,
    });
  });

  it('chưa biết status (đang tải/lỗi) ⇒ mọi quyền ghi TẮT, chưa coi là readOnly', () => {
    const unknown = resolveExplorerCapabilities(undefined);
    expect(unknown.canUpload).toBe(false);
    expect(unknown.canCreateFolder).toBe(false);
    expect(unknown.readOnly).toBe(false);
  });

  it('workspace ARCHIVED ⇒ chỉ xem/tải', () => {
    expect(resolveExplorerCapabilities('ARCHIVED')).toEqual({
      canCreateFolder: false,
      canUpload: false,
      readOnly: true,
    });
  });
});

describe('quyền theo mục = cờ canModify của BE', () => {
  it('đọc thẳng cờ của tệp/thư mục, không suy từ chủ sở hữu', () => {
    const file = { key: 'r:1', kind: 'resource' as const };
    expect(canModifyItem({ ...file, resource: makeResource({ canModify: true }) })).toBe(true);
    expect(canModifyItem({ ...file, resource: makeResource({ canModify: false }) })).toBe(false);
    const folder = { key: 'f:1', kind: 'folder' as const };
    expect(canModifyItem({ ...folder, folder: makeFolder({ canModify: false }) })).toBe(false);
  });
});

describe('menu hành động theo quyền', () => {
  const file = { key: 'r:1', kind: 'resource' as const, resource: makeResource() };

  it('không có canModify (tệp người khác, MEMBER) ⇒ không "Xoá"/"Đổi tên"/"Di chuyển"; vẫn Mở/Chia sẻ/Tải về', () => {
    const labels = buildItemActions(file, { canModify: false, inSearch: false, online: true }).map(
      (a) => a.label,
    );
    expect(labels).toEqual(['Mở', 'Chia sẻ', 'Tải về']);
  });

  it('có canModify thấy đủ, "Xoá" đánh dấu nguy hiểm', () => {
    const actions = buildItemActions(file, { canModify: true, inSearch: false, online: true });
    expect(actions.map((a) => a.key)).toEqual([
      'open',
      'rename',
      'move',
      'share',
      'download',
      'delete',
    ]);
    expect(actions.find((a) => a.key === 'delete')?.danger).toBe(true);
  });

  it('offline ẩn Chia sẻ/Tải về; kết quả tìm có "Mở thư mục chứa tệp"; thư mục không có Chia sẻ', () => {
    const offline = buildItemActions(file, { canModify: true, inSearch: true, online: false });
    expect(offline.map((a) => a.key)).toEqual(['open', 'locate', 'rename', 'move', 'delete']);
    const folder = { key: 'f:1', kind: 'folder' as const, folder: makeFolder() };
    const keys = buildItemActions(folder, { canModify: true, inSearch: false, online: true }).map(
      (a) => a.key,
    );
    expect(keys).toEqual(['open', 'rename', 'move', 'delete']);
  });
});

describe('describeItem', () => {
  it('tệp luôn hiện loại + dung lượng + NGÀY (phân biệt hai bản trùng tên)', () => {
    const view = describeItem({
      key: 'r:1',
      kind: 'resource',
      resource: makeResource({ size: 1536 }),
    });
    expect(view.subtitle).toBe('PDF · 1,5 KB · 10/09/2026');
    expect(view.title).toBe('Slide tuần 1.pdf');
  });

  it('chỉ ảnh mới dùng thumbnail', () => {
    const image = describeItem({
      key: 'r:2',
      kind: 'resource',
      resource: makeResource({ thumbnailUrl: 'https://x/t.jpg', type: 'IMAGE' }),
    });
    const pdf = describeItem({
      key: 'r:3',
      kind: 'resource',
      resource: makeResource({ thumbnailUrl: 'https://x/t.jpg' }),
    });
    expect(image.thumbnailUrl).toBe('https://x/t.jpg');
    expect(pdf.thumbnailUrl).toBeUndefined();
  });
});
