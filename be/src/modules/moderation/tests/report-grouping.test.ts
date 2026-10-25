/** Unit — `report-grouping.ts` (hàm thuần): gộp theo `groupKey`, thống kê lý do, sắp xếp + cursor ổn định. */
import { afterGroupCursor, groupReports, reasonsByFrequency, sortGroups, sortGroupsByLatest } from "../services/report-grouping";
import { makeReport, oid } from "./report-fixtures";

describe("groupReports", () => {
  it("gộp nhiều báo cáo cùng đích thành 1 nhóm: đếm, lý do phổ biến nhất trước, mốc đầu/cuối, đại diện = mới nhất", () => {
    const a = makeReport({ reason: "SPAM", reporterId: oid("1") });
    const b = makeReport({ reason: "HARASSMENT", reporterId: oid("2") });
    const c = makeReport({ reason: "HARASSMENT", reporterId: oid("3") });

    const [group] = groupReports([c, b, a]);

    expect(group.reportCount).toBe(3);
    expect(group.reasons).toEqual(["HARASSMENT", "SPAM"]);
    expect(group.firstAt).toEqual(a.createdAt);
    expect(group.latestAt).toEqual(c.createdAt);
    expect(group.representativeId).toBe(c.id);
    expect(group.status).toBe("OPEN");
  });

  it("tách nhóm theo groupKey (đích khác nhau)", () => {
    const other = makeReport({ targetId: oid("f"), groupKey: `MESSAGE:${oid("f")}` });
    expect(groupReports([makeReport(), makeReport(), other])).toHaveLength(2);
  });

  it("nhóm còn ≥1 báo cáo OPEN → OPEN, dù có báo cáo đã đóng; toàn đóng → lấy kết quả đóng mới nhất", () => {
    const closedEarly = makeReport({ status: "DISMISSED", resolution: "NO_ACTION", resolvedAt: new Date("2026-09-19T01:00:00Z") });
    const closedLate = makeReport({ status: "RESOLVED", resolution: "CONTENT_REMOVED", resolvedAt: new Date("2026-09-19T02:00:00Z") });
    expect(groupReports([closedEarly, closedLate, makeReport()])[0].status).toBe("OPEN");

    const allClosed = groupReports([closedEarly, closedLate])[0];
    expect(allClosed.status).toBe("RESOLVED");
    expect(allClosed.resolution).toBe("CONTENT_REMOVED");
  });

  it("KHÔNG mang reporterId ra khỏi nhóm (ẩn danh, MOD-08)", () => {
    const [group] = groupReports([makeReport()]);
    expect(Object.keys(group)).not.toContain("reporterId");
  });
});

describe("reasonsByFrequency / sắp xếp / cursor", () => {
  it("hoà số lần → giữ thứ tự xuất hiện", () => {
    expect(reasonsByFrequency([makeReport({ reason: "SCAM" }), makeReport({ reason: "SPAM" })])).toEqual(["SCAM", "SPAM"]);
  });

  it("sortGroups reportCount: nhiều báo cáo trước; latest: mới nhất trước", () => {
    const big = groupReports([makeReport({ targetId: oid("a"), groupKey: "G:a" }), makeReport({ targetId: oid("a"), groupKey: "G:a" })])[0];
    const recent = groupReports([makeReport({ targetId: oid("b"), groupKey: "G:b" })])[0];
    expect(sortGroups([recent, big], "reportCount").map((g) => g.groupKey)).toEqual(["G:a", "G:b"]);
    expect(sortGroups([big, recent], "latest").map((g) => g.groupKey)).toEqual(["G:b", "G:a"]);
  });

  it("afterGroupCursor: chỉ giữ nhóm CŨ HƠN con trỏ (latestAt giảm dần, hoà theo groupKey giảm dần)", () => {
    const g1 = groupReports([makeReport({ groupKey: "G:1", targetId: oid("1") })])[0];
    const g2 = groupReports([makeReport({ groupKey: "G:2", targetId: oid("2") })])[0];
    const g3 = groupReports([makeReport({ groupKey: "G:3", targetId: oid("3") })])[0];
    const sorted = sortGroupsByLatest([g1, g2, g3]);
    expect(sorted.map((g) => g.groupKey)).toEqual(["G:3", "G:2", "G:1"]);

    const page2 = afterGroupCursor(sorted, { at: g3.latestAt, id: g3.groupKey });
    expect(page2.map((g) => g.groupKey)).toEqual(["G:2", "G:1"]);
    expect(afterGroupCursor(sorted, null)).toHaveLength(3);
  });
});
