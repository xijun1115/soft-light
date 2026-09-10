import { getStore } from "@netlify/blobs";

// 每条记录存成一个独立 key：rec:{cid}:{id}
// 不做「读整个数组 → 追加 → 写回」，因此并发保存不会互相覆盖

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }
  try {
    const body = await req.json();
    const { text, image, reply, date, cid } = body;

    if (!text) return new Response(JSON.stringify({ error: "text required" }), { status: 400 });
    if (!cid) return new Response(JSON.stringify({ error: "cid required" }), { status: 400 });

    // 限制图片大小（Base64 约 1.5MB 上限，防 Blobs 超限）
    if (image && image.length > 1500000) {
      return new Response(JSON.stringify({ error: "image too large" }), { status: 413 });
    }

    const store = getStore({ name: "records", consistency: "strong" });

    const id = Date.now().toString() + "-" + Math.random().toString(36).slice(2, 6);
    const record = {
      id,
      text,
      image: image || null,
      reply: reply || "",
      date: date || new Date().toISOString(),
      cid: String(cid),
    };

    await store.set(`rec:${record.cid}:${id}`, JSON.stringify(record));

    return new Response(JSON.stringify({ success: true, id }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
