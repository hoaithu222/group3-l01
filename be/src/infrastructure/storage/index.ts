import { env } from "../../core/config";
import type { IStorage } from "./storage.interface";
import { LocalStorage } from "./local.storage";

export type {
  IStorage,
  UploadResult,
  CreateUploadUrlParams,
  UploadInstruction,
  HeadResult,
} from "./storage.interface";
export { LocalStorage } from "./local.storage";
export { S3Storage } from "./s3.storage";
export { CloudinaryStorage } from "./cloudinary.storage";
export { buildKey } from "./storage-keys";

/**
 * Trả về storage instance phù hợp dựa vào STORAGE_TYPE trong env.
 * Lazy-init: S3/Cloudinary chỉ instantiate khi cần để tránh crash nếu thiếu config.
 */
export function getStorage(): IStorage {
  if (env.STORAGE_TYPE === "s3") {
    const { S3Storage } = require("./s3.storage") as typeof import("./s3.storage");
    return new S3Storage();
  }
  if (env.STORAGE_TYPE === "cloudinary") {
    const { CloudinaryStorage } = require("./cloudinary.storage") as typeof import("./cloudinary.storage");
    return new CloudinaryStorage();
  }
  return new LocalStorage();
}

/** Instance storage mặc định dùng chung */
export const storage: IStorage = (() => {
  try {
    return getStorage();
  } catch {
    return new LocalStorage();
  }
})();
