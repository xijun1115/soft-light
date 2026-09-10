import { getStore } from "@netlify/blobs";

// 只返回「这台设备」的记录。没带 cid 一律返回空。
// 新数据是每条一个 key（rec:{cid}:{id}），旧数据还在单 key "all" 数组里，两者合并返回。

const MAX_FETCH = 300;

// 不同版本 @netlify/blobs 的 list() 返回结构不一样，这里都兼容
function keysOf(listed) {
  const entries = Array.isArray(listed) ? listed : (listed && listed.blobs) || [];
  return entries
    .map((e) => (typeof e === "string" ? e : e && e.key))
    .filter(Boolean);
}

function idOf(key) {
  return String(key).split(":").pop();
}

export default async (req) => {
  const url = new URL(req.url);
  const cid = url.searchParams.get("cid");

  if (!cid) {
    return new Response(JSON.stringify([]), {
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const store = getStore({ name: "records", consistency: "strong" });

    // 新格式：每人独立 key
    const listed = await store.list({ prefix: `rec:${cid}:` });
    const keys = keysOf(listed)
      .sort((a, b) => idOf(b).localeCompare(idOf(a)))
      .slice(0, MAX_FETCH);

    const mine = (
      await Promise.all(
        keys.map(async (k) => {
          try {
            return await store.get(k, { type: "json" });
          } catch {
            return null;
          }
        })
      )
    ).filter(Boolean);

    // 旧格式：单 key 数组，按 cid 过滤
    let legacy = [];
    try {
      const raw = await store.get("all");
      if (raw) {
        const arr = JSON.parse(raw);
        legacy = (Array.isArray(arr) ? arr : []).filter(
          (r) => r && String(r.cid) === String(cid)
        );
      }
    } catch {
      legacy = [];
    }

    const seen = new Set(mine.map((r) => String(r.id)));
    const all = [...mine, ...legacy.filter((r) => !seen.has(String(r.id)))];

    all.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    return new Response(JSON.stringify(all), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify([]), {
      headers: { "Content-Type": "application/json" },
    });
  }
};
