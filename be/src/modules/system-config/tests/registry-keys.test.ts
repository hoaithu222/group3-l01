import { SYSTEM_CONFIG_REGISTRY } from "../../../core/config/system-config.registry";
import { systemConfigKeyParamSchema } from "../dtos/update-system-config.dto";

/**
 * Hợp đồng route ↔ registry: `GET|PUT /admin/system-config/:key` validate `:key` bằng `systemConfigKeyParamSchema` (1–2 đoạn, đoạn đầu chữ thường). Khoá registry vi phạm
 * KHÔNG sửa được từ admin (400 `VAL_001`) mà test service/registry vẫn xanh — nên kiểm MỌI khoá ở đây. Cần khoá dài hơn thì đặt tên 2 đoạn
 * (`pm.review`, `pm.contribution`), đừng nới regex của route.
 */
describe("khoá SYSTEM_CONFIG_REGISTRY đi qua được validator của route admin", () => {
  it.each(Object.keys(SYSTEM_CONFIG_REGISTRY))("%s", (key) => {
    expect(systemConfigKeyParamSchema.safeParse({ key }).success).toBe(true);
  });

  it("khoá 3 đoạn bị từ chối (ví dụ tên trong kế hoạch p4-06 `pm.contribution.defaults`)", () => {
    expect(systemConfigKeyParamSchema.safeParse({ key: "pm.contribution.defaults" }).success).toBe(false);
  });
});
