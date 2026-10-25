/**
 * Khoá tuần tự theo khoá chuỗi TRONG MỘT tiến trình (chuỗi promise). Chỉ là lớp giảm tranh chấp: tính đúng đắn
 * giữa nhiều instance do transaction Mongo đảm bảo (ghi cùng tài liệu `Board` → write-conflict → retry).
 */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<unknown>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const result = previous.then(fn, fn);
    const tail = result.catch(() => undefined);
    this.tails.set(key, tail);
    try {
      return await result;
    } finally {
      // Dọn khi không còn ai xếp sau (tránh Map phình theo số bảng).
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
}
