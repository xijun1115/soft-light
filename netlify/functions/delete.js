import { getStore } from "@netlify/blobs";

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const { id } = await req.json();
    if (!id) {
      return new Response(JSON.stringify({ error: "id required" }), { status: 400 });
    }

    // 与 save.js 保持一致：单 key "all" 存数组
    const store = getStore("records");

    const existing = await store.get("all");
    let records = existing ? JSON.parse(existing) : [];

    // 过滤掉要删除的记录
    records = records.filter(r => String(r.id) !== String(id));

    // 写回整个数组
    await store.set("all", JSON.stringify(records));

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};