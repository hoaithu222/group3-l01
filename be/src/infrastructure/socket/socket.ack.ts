/**
 * @file socket.ack.ts
 * @description Kiểu chuẩn cho ack `{ ok, code? }` mọi sự kiện C→S có callback
 * (be.md p0-03 §6) + helper dựng ack — tránh mỗi handler tự ghép object tay,
 * dễ lệch hình dạng giữa các handler.
 */
import type { ErrorCodeType } from "../../core/utils/error.codes";

export interface AckOk {
  ok: true;
}

export interface AckErr {
  ok: false;
  code: ErrorCodeType;
}

export type Ack = AckOk | AckErr;

/** Chữ ký callback client truyền làm tham số cuối cùng của `socket.emit(event, payload, ack)`. */
export type AckCallback = (ack: Ack) => void;

export function ackOk(): AckOk {
  return { ok: true };
}

export function ackErr(code: ErrorCodeType): AckErr {
  return { ok: false, code };
}

/** `true` nếu tham số cuối của mảng args (packet C→S) là hàm callback ack — Socket.IO không serialize function nên chỉ có thể là ack người gọi truyền. */
export function extractAck(args: unknown[]): AckCallback | undefined {
  const last = args[args.length - 1];
  return typeof last === "function" ? (last as AckCallback) : undefined;
}
