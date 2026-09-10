import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  try {
    const body = await req.json();
    const { text, image, reply, date } = body;
    if (!text) return new Response(JSON.stringify({ error: "text required" }), { status: 400 });

    // 限制图片大小（Base64 约 1.5MB 上限，防 Blobs 超限）
    if (image && image.length > 1500000) {
      return new Response(JSON.stringify({ error: "image too large" }), { status: 413 });
    }

    const store = getStore("records");
    let records = [];
    try {
      const existing = await store.get("all");
      records = existing ? JSON.parse(existing) : [];
    } catch (e) { records = []; }

    const record = {
      id: Date.now().toString(),
      text,
      image: image || null,
      reply: reply || "",
      date: date || new Date().toISOString(),
    };
    records.push(record);
    await store.set("all", JSON.stringify(records));

    return new Response(JSON.stringify({ success: true, id: record.id }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};