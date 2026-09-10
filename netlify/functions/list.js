import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  try {
    const store = getStore("records");
    const objects = await store.list();

    if (!objects || objects.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // 并行读取所有记录
    const records = await Promise.all(
      objects.map(async (obj) => {
        const data = await store.get(obj.key, { type: "json" });
        return data;
      })
    );

    // 按时间倒序
    records.sort((a, b) => b.id - a.id);

    return new Response(JSON.stringify(records), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};