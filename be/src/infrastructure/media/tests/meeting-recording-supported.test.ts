import { setLiveKitEnv } from "./livekit-test-utils";

setLiveKitEnv();
process.env.STORAGE_TYPE = "s3";
process.env.AWS_REGION = "ap-southeast-1";
process.env.AWS_ACCESS_KEY_ID = "AKIAAWS";
process.env.AWS_SECRET_ACCESS_KEY = "aws-secret";
process.env.AWS_S3_BUCKET = "assets-bucket";
process.env.EGRESS_S3_BUCKET = "assets-bucket";
process.env.EGRESS_S3_REGION = "ap-southeast-1";
process.env.EGRESS_S3_ACCESS_KEY_ID = "AKIAEGRESS";
process.env.EGRESS_S3_SECRET_ACCESS_KEY = "egress-secret";

import { env } from "../../../core/config";
import { isMeetingRecordingSupported } from "../livekit.config";

const mutable = env as unknown as Record<string, unknown>;
const snapshot = { ...mutable };
afterEach(() => Object.assign(mutable, snapshot));

describe("isMeetingRecordingSupported — ghi hình họp chỉ khi LiveKit + storage S3 + Egress CÙNG bucket (p2-06)", () => {
  it("đủ cấu hình → true", () => {
    expect(isMeetingRecordingSupported()).toBe(true);
  });

  it.each([
    ["STORAGE_TYPE khác s3 (Cloudinary/local — Egress không ghi lên được)", { STORAGE_TYPE: "cloudinary" }],
    ["thiếu khoá egress", { EGRESS_S3_SECRET_ACCESS_KEY: undefined }],
    ["egress khác bucket asset (BE không đọc/ký/xoá được tệp)", { EGRESS_S3_BUCKET: "another-bucket" }],
    ["chưa cấu hình LiveKit", { LIVEKIT_API_SECRET: undefined }],
  ])("%s → false", (_name, patch) => {
    Object.assign(mutable, patch);
    expect(isMeetingRecordingSupported()).toBe(false);
  });
});
