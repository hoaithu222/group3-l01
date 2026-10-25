/**
 * Unit — `block-guard.ts` (p1-08 README §2 "Thêm vào nhóm chat" / BLOCK-02): người THÊM bị target chặn → 403 `BLOCK_003` (trung tính,
 * không `details`); người thêm đã chặn target vẫn thêm được ("A chủ động"). Dùng `BlockPort` giả (không đụng Prisma/Redis).
 */
import { assertNotBlockedByAny } from "../services/block-guard";
import type { BlockPort } from "../../../shared/ports/block.port";

const port = (blockerIds: string[]): BlockPort => ({ blockerIdsOf: jest.fn().mockResolvedValue(blockerIds) }) as unknown as BlockPort;

describe("assertNotBlockedByAny", () => {
  it("BLOCK-02: một trong các người được thêm ĐÃ CHẶN actor → 403 BLOCK_003, không lộ ai chặn", async () => {
    const err = await assertNotBlockedByAny("B", ["C", "A"], port(["A"])).catch((e: unknown) => e);
    expect(err).toMatchObject({ statusCode: 403, errorCode: "BLOCK_003" });
    expect((err as { details?: unknown }).details).toBeUndefined();
  });

  it("không ai trong danh sách chặn actor → qua (kể cả actor đã chặn họ — chiều ngược lại)", async () => {
    await expect(assertNotBlockedByAny("A", ["B", "C"], port(["X", "Y"]))).resolves.toBeUndefined();
  });

  it("danh sách rỗng → không tra BlockPort", async () => {
    const p = port(["A"]);
    await expect(assertNotBlockedByAny("B", [], p)).resolves.toBeUndefined();
    expect(p.blockerIdsOf).not.toHaveBeenCalled();
  });
});
