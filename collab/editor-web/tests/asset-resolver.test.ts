import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetUrlFailure, AssetUrlResolver } from "../src/asset-resolver";

const ID = "64b7f0c2a1d3e4f5a6b7c8d9";

let requests: string[];
let resolver: AssetUrlResolver;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-26T12:00:00Z"));
  requests = [];
  resolver = new AssetUrlResolver({ request: (id) => void requests.push(id), timeoutMs: 15_000 });
});
afterEach(() => vi.useRealTimers());

describe("AssetUrlResolver", () => {
  it("xin app một lần, gộp các yêu cầu đang chờ cùng assetId", async () => {
    const a = resolver.resolve(ID);
    const b = resolver.resolve(ID);
    expect(requests).toEqual([ID]);
    resolver.receive({ assetId: ID, url: "https://cdn.example/a.png?sig=1" });
    await expect(a).resolves.toBe("https://cdn.example/a.png?sig=1");
    await expect(b).resolves.toBe("https://cdn.example/a.png?sig=1");
  });

  it("đệm URL tới gần hết hạn (mặc định 45 s, trừ 5 s an toàn), sau đó xin lại", async () => {
    const first = resolver.resolve(ID);
    resolver.receive({ assetId: ID, url: "https://cdn.example/1" });
    await first;
    vi.advanceTimersByTime(39_000);
    await expect(resolver.resolve(ID)).resolves.toBe("https://cdn.example/1");
    expect(requests).toHaveLength(1);
    vi.advanceTimersByTime(2_000);
    void resolver.resolve(ID);
    expect(requests).toHaveLength(2);
  });

  it("dùng expiresAt do app gửi", async () => {
    const p = resolver.resolve(ID);
    resolver.receive({ assetId: ID, url: "https://cdn.example/1", expiresAt: Date.now() + 10_000 });
    await p;
    vi.advanceTimersByTime(4_000);
    await resolver.resolve(ID);
    expect(requests).toHaveLength(1);
    vi.advanceTimersByTime(2_000);
    void resolver.resolve(ID);
    expect(requests).toHaveLength(2);
  });

  it("invalidate buộc xin lại", async () => {
    const p = resolver.resolve(ID);
    resolver.receive({ assetId: ID, url: "https://cdn.example/1" });
    await p;
    resolver.invalidate(ID);
    void resolver.resolve(ID);
    expect(requests).toHaveLength(2);
  });

  it.each(["not-found", "forbidden", "failed"] as const)("app trả lỗi %s → từ chối, không đệm", async (error) => {
    const p = resolver.resolve(ID);
    resolver.receive({ assetId: ID, error });
    await expect(p).rejects.toMatchObject({ reason: error });
    void resolver.resolve(ID);
    expect(requests).toHaveLength(2);
  });

  it("app im lặng quá hạn → từ chối 'timeout' và cho phép xin lại", async () => {
    const p = resolver.resolve(ID);
    const assertion = expect(p).rejects.toBeInstanceOf(AssetUrlFailure);
    vi.advanceTimersByTime(15_001);
    await assertion;
    void resolver.resolve(ID);
    expect(requests).toHaveLength(2);
  });

  it("tin assetUrl của ảnh không ai chờ vẫn được đệm", async () => {
    resolver.receive({ assetId: ID, url: "https://cdn.example/pre" });
    await expect(resolver.resolve(ID)).resolves.toBe("https://cdn.example/pre");
    expect(requests).toEqual([]);
  });

  it("dispose từ chối các yêu cầu đang chờ và xoá đệm", async () => {
    const p = resolver.resolve(ID);
    const assertion = expect(p).rejects.toBeInstanceOf(AssetUrlFailure);
    resolver.dispose();
    await assertion;
    void resolver.resolve(ID);
    expect(requests).toHaveLength(2);
  });
});
