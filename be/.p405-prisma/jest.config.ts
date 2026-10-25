/**
 * Cấu hình jest TẠM của p4-05 (KHÔNG commit, xoá cuối phiên): `prisma generate` vào `node_modules/.prisma/client` bị EPERM vì tiến trình
 * node khác đang giữ `query_engine-windows.dll.node`, nên test dùng bản client sinh riêng ở `.p405-prisma/client` (cùng schema).
 */
import path from "node:path";
import base from "../jest.config";

const rootDir = path.resolve(__dirname, "..");
const prismaMap = { "^@prisma/client$": "<rootDir>/.p405-prisma/client/index.js" };

const projects = (base.projects ?? []).map((p) => {
  const project = p as Record<string, unknown>;
  return {
    ...project,
    rootDir,
    moduleNameMapper: { ...prismaMap, ...((project.moduleNameMapper as Record<string, string> | undefined) ?? {}) },
    transform: { "^.+\.tsx?$": ["ts-jest", { tsconfig: { strict: true }, diagnostics: false }] as [string, Record<string, unknown>] },
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const config: any = { ...base, rootDir, projects };
export default config;
