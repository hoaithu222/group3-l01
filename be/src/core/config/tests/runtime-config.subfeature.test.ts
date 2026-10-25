/**
 * Unit — cờ PHỤ của tiện ích (p5-04): `isSubFeatureEnabled` = (override ?? BẬT) && phân hệ cha bật. Tách file riêng vì cần phân hệ
 * `communication` "có mã + bật" (mock hằng phân hệ), khác `runtime-config.test.ts` (giữ mặc định thật của repo).
 */
jest.mock("../../constants/modules", () => {
  const actual = jest.requireActual("../../constants/modules");
  return {
    ...actual,
    // Cờ phụ có thể thuộc phân hệ khác `communication` (p2-06: `meetingRecording` thuộc `meeting`; p7-04: `messageToTask`/`messageToResource` thuộc `project`) — bật cả ba phân hệ cha để vòng "mọi cờ phụ" kiểm được hết.
    AVAILABLE_MODULES: [...actual.AVAILABLE_MODULES, actual.MODULES.COMMUNICATION, actual.MODULES.MEETING, actual.MODULES.PROJECT],
    FEATURE_FLAGS: { ...actual.FEATURE_FLAGS, [actual.MODULES.COMMUNICATION]: true, [actual.MODULES.MEETING]: true, [actual.MODULES.PROJECT]: true },
  };
});

// Nạp `core/config` TRƯỚC: `constants/modules` ↔ `config/validate-runtime` import vòng — factory mock chỉ chạy đúng khi `env` đã sẵn sàng.
import "../index";
import { initRuntimeConfig, isSubFeatureEnabled, resetRuntimeConfig, type ISystemConfigReader, type SystemConfigSnapshot } from "../runtime-config";
import { SUB_FEATURES, subFeatureDefault } from "../../constants/modules";

const fakeReader = (data: Record<string, SystemConfigSnapshot>): ISystemConfigReader => ({
  async findByKey(key: string) {
    return data[key] ?? null;
  },
});

describe("isSubFeatureEnabled", () => {
  afterEach(() => resetRuntimeConfig());

  it("phân hệ cha bật + chưa cấu hình → BẬT mặc định (trừ cờ mặc định TẮT như `gif`)", async () => {
    initRuntimeConfig(fakeReader({}));
    for (const id of Object.values(SUB_FEATURES)) expect(await isSubFeatureEnabled(id)).toBe(subFeatureDefault(id));
    expect(await isSubFeatureEnabled(SUB_FEATURES.POLLS)).toBe(true);
    expect(await isSubFeatureEnabled(SUB_FEATURES.GIF)).toBe(false);
  });

  it("`gif` mặc định TẮT nhưng admin bật được; các cờ chat khác tắt riêng lẻ; cờ theo `project` tắt khi phân hệ `project` tắt", async () => {
    initRuntimeConfig(fakeReader({ features: { value: { gif: true, polls: false }, version: 1 } }));
    expect(await isSubFeatureEnabled(SUB_FEATURES.GIF)).toBe(true);
    expect(await isSubFeatureEnabled(SUB_FEATURES.POLLS)).toBe(false);
    expect(await isSubFeatureEnabled(SUB_FEATURES.SCHEDULED_MESSAGES)).toBe(true);
    resetRuntimeConfig();
    initRuntimeConfig(fakeReader({ features: { value: { project: false }, version: 1 } }));
    expect(await isSubFeatureEnabled(SUB_FEATURES.MESSAGE_TO_TASK)).toBe(false);
    expect(await isSubFeatureEnabled(SUB_FEATURES.MESSAGE_TO_RESOURCE)).toBe(false);
    expect(await isSubFeatureEnabled(SUB_FEATURES.POLLS)).toBe(true);
  });

  it("override false → tắt đúng cờ đó, các cờ khác vẫn bật", async () => {
    initRuntimeConfig(fakeReader({ features: { value: { workspaceSearch: false }, version: 1 } }));
    expect(await isSubFeatureEnabled(SUB_FEATURES.WORKSPACE_SEARCH)).toBe(false);
    expect(await isSubFeatureEnabled(SUB_FEATURES.READ_CONFIRM)).toBe(true);
  });

  it("phân hệ cha tắt (override communication=false) → mọi cờ phụ tắt dù bật riêng", async () => {
    initRuntimeConfig(fakeReader({ features: { value: { communication: false, readConfirm: true }, version: 1 } }));
    expect(await isSubFeatureEnabled(SUB_FEATURES.READ_CONFIRM)).toBe(false);
    expect(await isSubFeatureEnabled(SUB_FEATURES.WORKSPACE_TEMPLATES)).toBe(false);
  });
});
