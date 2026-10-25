import type { InitLivePayload } from "../../src/bridge-protocol";
import { msg } from "./fake-transport";

export const DOC_ID = "64b7f0c2a1d3e4f5a6b7c8d9";
export const USER_ID = "64b7f0c2a1d3e4f5a6b7c8aa";
export const USER = { id: USER_ID, name: "Nguyễn Thị Hoài Thu", color: "#175CD3" } as const;

const b64url = (value: object): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** JWT giả (chữ ký không kiểm phía editor): chỉ để editor đọc `sub`/`docId`/`exp`. */
export function fakeJwt(claims: { sub?: string; docId?: string; kind?: string; exp?: number } = {}): string {
  const payload = { sub: USER_ID, docId: DOC_ID, kind: "document", exp: Math.floor(Date.now() / 1000) + 300, ...claims };
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.sig`;
}

export function initPayload(overrides: Partial<InitLivePayload> = {}): InitLivePayload {
  return {
    url: "wss://superapp.example.vn/collab",
    token: fakeJwt(),
    documentName: `doc:${DOC_ID}`,
    mode: "edit",
    user: { ...USER },
    ...overrides,
  };
}

export const initMessage = (overrides: Partial<InitLivePayload> = {}) => msg("init", initPayload(overrides));
