import type { ITaskDependencyRepository } from "../repositories/task-dependency.repository.interface";
import { BOARD_EDGES_CAP, boardEdgeLoader } from "../services/dependency-edge-loader";
import { findPath } from "../services/dependency-graph";

const e = (predecessorId: string, successorId: string) => ({ predecessorId, successorId });

function fakeRepo(boardEdges: ReturnType<typeof e>[]) {
  const calls = { edgesOfBoard: 0, outgoing: 0, incoming: 0 };
  const repo = {
    edgesOfBoard: jest.fn((_b: string, limit: number) => {
      calls.edgesOfBoard += 1;
      return Promise.resolve(boardEdges.slice(0, limit));
    }),
    outgoing: jest.fn((ids: string[], limit: number) => {
      calls.outgoing += 1;
      return Promise.resolve(boardEdges.filter((x) => ids.includes(x.predecessorId)).slice(0, limit));
    }),
    incoming: jest.fn((ids: string[], limit: number) => {
      calls.incoming += 1;
      return Promise.resolve(boardEdges.filter((x) => ids.includes(x.successorId)).slice(0, limit));
    }),
  } as unknown as ITaskDependencyRepository;
  return { repo, calls };
}

describe("boardEdgeLoader — đọc cạnh của bảng MỘT lần rồi duyệt trong bộ nhớ", () => {
  it("chuỗi dài: BFS tìm đường chỉ tốn MỘT truy vấn (thay vì một truy vấn mỗi tầng); kết quả như tải theo tầng", async () => {
    const chain = Array.from({ length: 300 }, (_, i) => e(`t${i}`, `t${i + 1}`));
    const { repo, calls } = fakeRepo(chain);
    const loader = boardEdgeLoader(repo, "board1");
    const path = await findPath("t0", "t300", (ids, limit) => loader.outgoing(ids, limit), 5000);
    expect(path).toHaveLength(301);
    expect(calls).toEqual({ edgesOfBoard: 1, outgoing: 0, incoming: 0 });
  });

  it("lọc đúng theo đầu vào/đầu ra và tôn trọng `limit` như truy vấn thật", async () => {
    const { repo } = fakeRepo([e("a", "b"), e("a", "c"), e("d", "c"), e("x", "y")]);
    const loader = boardEdgeLoader(repo, "board1");
    expect(await loader.outgoing(["a"], 10)).toEqual([e("a", "b"), e("a", "c")]);
    expect(await loader.outgoing(["a"], 1)).toEqual([e("a", "b")]);
    expect(await loader.outgoing(["a", "d"], 10)).toHaveLength(3);
    expect(await loader.incoming(["c"], 10)).toEqual([e("a", "c"), e("d", "c")]);
    expect(await loader.incoming(["zzz"], 10)).toEqual([]);
  });

  it("bảng quá nhiều cạnh (> BOARD_EDGES_CAP) → lùi về truy vấn theo tầng, vẫn đúng", async () => {
    const many = Array.from({ length: BOARD_EDGES_CAP + 5 }, (_, i) => e(`p${i}`, `s${i}`));
    const { repo, calls } = fakeRepo(many);
    const loader = boardEdgeLoader(repo, "board1");
    expect(await loader.outgoing(["p3"], 10)).toEqual([e("p3", "s3")]);
    expect(await loader.incoming(["s4"], 10)).toEqual([e("p4", "s4")]);
    expect(calls.edgesOfBoard).toBe(1); // chỉ thử đọc một lần rồi nhớ kết quả "quá lớn"
    expect(calls.outgoing).toBe(1);
    expect(calls.incoming).toBe(1);
  });

  it("truyền tx cho lần đọc cạnh của bảng (kiểm vòng chạy TRONG transaction)", async () => {
    const { repo } = fakeRepo([e("a", "b")]);
    const tx = { __projectsTx: true } as const;
    await boardEdgeLoader(repo, "board1", tx).outgoing(["a"], 5);
    expect(repo.edgesOfBoard).toHaveBeenCalledWith("board1", BOARD_EDGES_CAP + 1, tx);
  });
});
