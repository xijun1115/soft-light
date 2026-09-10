import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const body = await req.json();
    const { text, image, reply, date } = body;

    if (!text) {
      return new Response(JSON.stringify({ error: "text required" }), { status: 400 });
    }

    const store = getStore("records");

    // 读现有
    let records = [];
    try {
      const existing = await store.get("all");
      records = existing ? JSON.parse(existing) : [];
    } catch (e) {
      records = [];
    }

    // 追加
    const record = {
      id: Date.now().toString(),
      text,
      image: image || null,
      reply: reply || "",
      date: date || new Date().toISOString(),
    };
    records.push(record);

    // 写回（不用 setJSON，直接用 set + 字符串）
    await store.set("all", JSON.stringify(records));

    return new Response(JSON.stringify({ success: true, id: record.id }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};