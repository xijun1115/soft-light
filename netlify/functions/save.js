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

    // 用时间戳做 key
    const key = Date.now().toString();
    const record = {
      id: key,
      text,
      image: image || null,   // base64 字符串
      reply: reply || "",
      date: date || new Date().toISOString(),
    };

    await store.setJSON(key, record);

    return new Response(JSON.stringify({ success: true, id: key }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};