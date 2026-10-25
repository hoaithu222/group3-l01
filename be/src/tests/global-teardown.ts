/** Jest globalTeardown — dừng `MongoMemoryReplSet` khởi ở `global-setup.ts` (nếu có). */
export default async function globalTeardown(): Promise<void> {
  const replSet = global.__MONGO_REPLSET__;
  if (replSet) {
    await replSet.stop();
  }
}
