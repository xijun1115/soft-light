import { getStore } from "@netlify/blobs";

// 只能删自己的：id 和 cid 必须同时对上

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const { id, cid } = await req.json();
    if (!id) return new Response(JSON.stringify({ error: "id required" }), { status: 400 });
    if (!cid) return new Response(JSON.stringify({ error: "cid required" }), { status: 400 });

    const store = getStore({ name: "records", consistency: "strong" });

    // 新格式：直接删独立 key（别人的 key 里 cid 不同，删不掉）
    await store.delete(`rec:${cid}:${id}`);

    // 旧格式：从单 key 数组里移除（同样校验 cid）
    let removedFromLegacy = false;
    try {
      const raw = await store.get("all");
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          const next = arr.filter(
            (r) => !(String(r.id) === String(id) && String(r.cid) === String(cid))
          );
          if (next.length !== arr.length) {
            await store.set("all", JSON.stringify(next));
            removedFromLegacy = true;
          }
        }
      }
    } catch {
      // 旧数据处理失败不影响主流程
    }

    return new Response(JSON.stringify({ success: true, removedFromLegacy }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
