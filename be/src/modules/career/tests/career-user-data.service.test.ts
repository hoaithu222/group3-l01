import { CareerUserDataService } from "../services/career-user-data.service";

/**
 * Consumer `gamification/career.user-anonymized` (dòng outbox RIÊNG do `UserAnonymizer` ghi, p6-06 README): xoá credit/tiến độ/huy hiệu/hồ sơ nghề nghiệp của
 * ĐÚNG người bị ẩn danh hoá, idempotent (chạy lại → 0 bản ghi, không lỗi).
 */
type RepoName = "credits" | "progress" | "badges" | "careers";

function fakeRepos() {
  // Mô phỏng `deleteByUser` — trả số bản ghi đã xoá của người đó, gọi lại trả 0.
  const rows: Record<RepoName, Record<string, number>> = { credits: { u1: 2, u2: 1 }, progress: { u1: 3 }, badges: { u1: 1, u2: 4 }, careers: { u1: 1 } };
  const del = (name: RepoName) =>
    jest.fn((userId: string) => {
      const n = rows[name][userId] ?? 0;
      delete rows[name][userId];
      return Promise.resolve(n);
    });
  return { credits: { deleteByUser: del("credits") }, progress: { deleteByUser: del("progress") }, badges: { deleteByUser: del("badges") }, careers: { deleteByUser: del("careers") } };
}

describe("CareerUserDataService.erase", () => {
  it("xoá đúng dữ liệu của người bị ẩn danh hoá và trả số bản ghi từng loại; người khác không bị đụng", async () => {
    const repos = fakeRepos();
    const service = new CareerUserDataService(repos as never);
    await expect(service.erase("u1")).resolves.toEqual({ credits: 2, progress: 3, badges: 1, career: 1 });
    for (const r of Object.values(repos)) expect(r.deleteByUser).toHaveBeenCalledWith("u1");
    // u2 còn nguyên: lần xoá của u2 vẫn thấy dữ liệu của mình.
    await expect(service.erase("u2")).resolves.toEqual({ credits: 1, progress: 0, badges: 4, career: 0 });
  });

  it("idempotent: chạy lại (job retry / outbox trùng) → không còn gì để xoá, không ném lỗi", async () => {
    const service = new CareerUserDataService(fakeRepos() as never);
    await service.erase("u1");
    await expect(service.erase("u1")).resolves.toEqual({ credits: 0, progress: 0, badges: 0, career: 0 });
  });
});
