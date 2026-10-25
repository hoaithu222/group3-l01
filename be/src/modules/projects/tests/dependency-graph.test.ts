import { DependencyGraphTooLargeError, findPath, type DependencyEdge } from "../services/dependency-graph";

const edge = (predecessorId: string, successorId: string): DependencyEdge => ({ predecessorId, successorId });

/** Bộ tải cạnh ra theo lô — đếm số lần gọi để kiểm "một truy vấn mỗi tầng". */
function loader(edges: DependencyEdge[]) {
  const calls: string[][] = [];
  const load = (ids: string[], limit: number): Promise<DependencyEdge[]> => {
    calls.push([...ids]);
    return Promise.resolve(edges.filter((e) => ids.includes(e.predecessorId)).slice(0, limit));
  };
  return { load, calls };
}

describe("dependency-graph.findPath (p4-04 be.md §5.1)", () => {
  it("cùng một đỉnh → [from]; không có đường → null; đường theo CHIỀU cạnh (predecessor → successor)", async () => {
    const { load } = loader([edge("A", "B"), edge("B", "C")]);
    expect(await findPath("A", "A", load, 5000)).toEqual(["A"]);
    expect(await findPath("A", "C", load, 5000)).toEqual(["A", "B", "C"]);
    expect(await findPath("C", "A", load, 5000)).toBeNull();
    expect(await findPath("B", "A", load, 5000)).toBeNull();
  });

  it("PM2-03: thêm A→B khi đã có B→A ⇒ đường S=B ⇝ P=A trả đúng thứ tự [B, A] (dữ liệu của TASK_005 cycle)", async () => {
    const { load } = loader([edge("B", "A")]);
    expect(await findPath("B", "A", load, 5000)).toEqual(["B", "A"]);
  });

  it("vòng dài: thêm P→S khi đã có S→X→Y→P ⇒ trả [S, X, Y, P]", async () => {
    const { load } = loader([edge("S", "X"), edge("X", "Y"), edge("Y", "P"), edge("S", "Z")]);
    expect(await findPath("S", "P", load, 5000)).toEqual(["S", "X", "Y", "P"]);
  });

  it("BFS: nhiều đường → trả đường NGẮN nhất; đồ thị hình thoi không duyệt lại đỉnh chung", async () => {
    const { load, calls } = loader([edge("A", "B"), edge("B", "D"), edge("A", "C"), edge("C", "D"), edge("A", "E"), edge("E", "F"), edge("F", "D")]);
    const path = await findPath("A", "D", load, 5000);
    expect(path).toHaveLength(3);
    expect(path?.[0]).toBe("A");
    expect(path?.[2]).toBe("D");
    // Một lần tải cho MỖI tầng: {A}, rồi {B, C, E}; đích thấy ở tầng 2 nên dừng.
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(["A"]);
    expect([...calls[1]].sort()).toEqual(["B", "C", "E"]);
  });

  it("dữ liệu đã hỏng có vòng sẵn (A→B→A) vẫn dừng, không lặp vô hạn", async () => {
    const { load } = loader([edge("A", "B"), edge("B", "A")]);
    expect(await findPath("A", "Z", load, 5000)).toBeNull();
  });

  it("đồ thị 5.001 cạnh → DependencyGraphTooLargeError (TASK_021); đúng 5.000 cạnh → vẫn xử lý", async () => {
    const star = (n: number): DependencyEdge[] => Array.from({ length: n }, (_, i) => edge("A", `n${i}`));
    await expect(findPath("A", "Z", loader(star(5001)).load, 5000)).rejects.toBeInstanceOf(DependencyGraphTooLargeError);
    expect(await findPath("A", "Z", loader(star(5000)).load, 5000)).toBeNull();
    // Trần đếm CỘNG DỒN qua các tầng.
    const chain = Array.from({ length: 12 }, (_, i) => edge(`c${i}`, `c${i + 1}`));
    await expect(findPath("c0", "Z", loader(chain).load, 10)).rejects.toBeInstanceOf(DependencyGraphTooLargeError);
    expect(await findPath("c0", "Z", loader(chain).load, 12)).toBeNull();
  });

  it("truyền `limit` còn lại cho bộ tải (không đọc quá trần + 1 cạnh)", async () => {
    const limits: number[] = [];
    const load = (ids: string[], limit: number): Promise<DependencyEdge[]> => {
      limits.push(limit);
      return Promise.resolve(ids.includes("A") ? [edge("A", "B"), edge("A", "C")] : []);
    };
    await findPath("A", "Z", load, 100);
    expect(limits[0]).toBe(101);
    expect(limits[1]).toBe(101 - 2);
  });
});
