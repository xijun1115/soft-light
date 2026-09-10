import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  try {
    const store = getStore("records");
    
    // 方案A：新版本单key存储
    const all = await store.get("all");
    let records = all ? JSON.parse(all) : [];
    
    // 方案B：兼容旧版本 list() 存储（防止历史数据丢失）
    try {
      const objs = await store.list();
      if (Array.isArray(objs) && objs.length > 0) {
        const old = await Promise.all(objs.map(o => store.get(o.key, { type: "json" })));
        records = [...records, ...old.filter(Boolean)];
      }
    } catch(e) {}
    
    records.sort((a, b) => b.id - a.id);
    return new Response(JSON.stringify(records), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    // 任何错误兜底返回空数组，绝不报500
    return new Response(JSON.stringify([]), {
      headers: { "Content-Type": "application/json" }
    });
  }
};