require("dotenv/config");
const { MongoClient } = require("mongodb");

async function main() {
  const client = new MongoClient(process.env.DATABASE_URL);
  await client.connect();
  const db = client.db();
  const sessions = await db.collection("Session")
    .find({}, { projection: { createdAt: 1, userAgent: 1, ipAddress: 1, _id: 0 } })
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray();
  console.log(JSON.stringify(sessions, null, 2));
  const userCount = await db.collection("User").countDocuments();
  console.log("User count:", userCount);
  await client.close();
}

main().catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
