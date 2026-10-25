import type {
  Portfolio,
  PortfolioBuild,
  PortfolioBuildUpdatedEvent,
  PortfolioOverview,
  PortfolioProject,
} from '../api/portfolio.types';

/**
 * Hàm THUẦN vá cache `['career','portfolio']` (app.md p6-07 §4 "patch"): mọi đột biến trả bản MỚI, `undefined` (chưa tải) đi qua nguyên vẹn — không
 * bao giờ dựng một `overview` giả từ một mảnh, vì thiếu `portfolio.version` là lần lưu sau gửi sai `expectedVersion`.
 */
type Overview = PortfolioOverview | undefined;

export const sortProjects = (projects: readonly PortfolioProject[]): PortfolioProject[] =>
  [...projects].sort((a, b) => a.order - b.order);

export function patchPortfolio(overview: Overview, portfolio: Portfolio): Overview {
  if (!overview) return overview;
  return { ...overview, portfolio };
}

/** Thay MỘT dự án theo `id`; chưa có thì thêm cuối (dự án vừa tạo). */
export function upsertProject(overview: Overview, project: PortfolioProject): Overview {
  if (!overview) return overview;
  const exists = overview.projects.some((item) => item.id === project.id);
  const projects = exists
    ? overview.projects.map((item) => (item.id === project.id ? project : item))
    : [...overview.projects, project];
  return { ...overview, projects: sortProjects(projects) };
}

export function removeProject(overview: Overview, projectId: string): Overview {
  if (!overview) return overview;
  return { ...overview, projects: overview.projects.filter((item) => item.id !== projectId) };
}

/** Sắp lại theo mảng id (đủ tập hiện có — BE từ chối thiếu/thừa); `order` = chỉ số mới, khớp cách BE `setOrders`. */
export function reorderProjects(overview: Overview, projectIds: readonly string[]): Overview {
  if (!overview) return overview;
  const byId = new Map(overview.projects.map((item) => [item.id, item]));
  const projects = projectIds.flatMap((id, index) => {
    const found = byId.get(id);
    return found ? [{ ...found, order: index }] : [];
  });
  return { ...overview, projects };
}

/** Đổi vị trí một dự án lên/xuống MỘT bậc; ra ngoài biên ⇒ giữ nguyên thứ tự. */
export function movedIds(
  projects: readonly PortfolioProject[],
  projectId: string,
  direction: -1 | 1,
): string[] {
  const ids = sortProjects(projects).map((item) => item.id);
  const from = ids.indexOf(projectId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  [ids[from], ids[to]] = [ids[to] as string, ids[from] as string];
  return ids;
}

/** Sửa dự án/thứ tự khi đang PUBLISHED ⇒ BE `touch` hồ sơ (`updatedAt`) và `hasUnpublishedChanges` thành `true` — phản chiếu ngay để hiện "Cập nhật trang" mà không chờ tải lại. */
export function markDirty(overview: Overview): Overview {
  if (!overview?.portfolio || overview.portfolio.status !== 'PUBLISHED') return overview;
  return { ...overview, portfolio: { ...overview.portfolio, hasUnpublishedChanges: true } };
}

export function patchBuild(overview: Overview, latestBuild: PortfolioBuild | null): Overview {
  if (!overview) return overview;
  return { ...overview, latestBuild };
}

/** Dựng trạng thái build từ sự kiện socket; đè lên build đang giữ nếu CÙNG `buildId`, còn không thì dựng bản tối thiểu (build do server tự xếp — thu hồi huy hiệu). */
export function mergeBuildEvent(
  current: PortfolioBuild | null,
  event: PortfolioBuildUpdatedEvent,
  now: string,
): PortfolioBuild {
  const base: PortfolioBuild =
    current?.id === event.buildId
      ? current
      : {
          buildVersion: event.buildVersion,
          createdAt: now,
          error: null,
          finishedAt: null,
          id: event.buildId,
          portfolioVersion: 0,
          sizeBytes: null,
          status: event.status,
          trigger: 'PUBLISH',
        };
  const finished = event.status === 'READY' || event.status === 'FAILED';
  return {
    ...base,
    error:
      event.status === 'FAILED'
        ? (event.error ?? base.error ?? 'Không tạo được trang, vui lòng thử lại')
        : null,
    finishedAt: finished ? now : null,
    status: event.status,
  };
}

/** Build còn CHẠY (chưa ra kết quả) — nút Công khai bị khoá, trạng thái "Đang tạo trang…". */
export const isBuildInFlight = (build: PortfolioBuild | null | undefined): boolean =>
  build?.status === 'QUEUED' || build?.status === 'BUILDING';

/**
 * Dấu vân tay nội dung trang xem trước: đổi khi hồ sơ (`version`) hoặc dự án (phiên bản, thứ tự, ẩn/hiện, mốc chụp số liệu) đổi — khung xem trước cạnh danh sách nạp lại theo nó. Không dùng `updatedAt`:
 * cache chỉ có giá trị mới sau khi tải lại, còn dấu vân tay này đổi NGAY khi mutation vá cache.
 */
export function previewRevision(overview: PortfolioOverview): string {
  const projects = sortProjects(overview.projects).map(
    (p) => `${p.id}.${String(p.version)}.${p.visible ? 1 : 0}.${p.snapshotAt}`,
  );
  return `${String(overview.portfolio?.version ?? 0)}|${projects.join(',')}`;
}
