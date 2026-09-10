import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  try {
    // 开启强一致性，确保写入后立即可读
    const store = getStore({ name: "records", consistency: "strong" });

    // 读单 key 存储（新版本）
    const all = await store.get("all");
    let records = all ? JSON.parse(all) : [];

    // 兼容旧版本 list() 存储（防止历史数据丢失）
    try {
      const objs = await store.list();
      if (Array.isArray(objs) && objs.length > 0) {
        const old = await Promise.all(
          objs.map(async (o) => {
            try {
              return await store.get(o.key, { type: "json" });
            } catch {
              return null;
            }
          })
        );
        records = [...records, ...old.filter(Boolean)];
      }
    } catch (e) {
      // 旧版 list 读取失败不影响主流程
    }

    // 按 id 倒序
    records.sort((a, b) => Number(b.id) - Number(a.id));

    return new Response(JSON.stringify(records), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    // 任何错误兜底返回空数组，绝不报 500
    return new Response(JSON.stringify([]), {
      headers: { "Content-Type": "application/json" },
    });
  }
};