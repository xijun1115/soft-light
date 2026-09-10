import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  try {
    const store = getStore("records");
    const records = await store.get("all");
    
    if (!records) {
      return new Response(JSON.stringify([]), {
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // get() 返回的是字符串，需要 JSON.parse
    const parsed = JSON.parse(records);
    const sorted = Array.isArray(parsed) ? parsed : [];
    sorted.sort((a, b) => b.id - a.id);
    
    return new Response(JSON.stringify(sorted), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    // 任何错误都返回空数组，不抛 500
    return new Response(JSON.stringify([]), {
      headers: { "Content-Type": "application/json" }
    });
  }
};