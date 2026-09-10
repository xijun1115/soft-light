import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

// 统计：PV（访问次数）/ UV（独立访客，IP+UA 加盐哈希）/ 闪光条数
// 读数据需要 ?k=STATS_KEY，避免被路人看光

const SALT = process.env.STATS_SALT || "soft-light-2026";
const MAX_SAMPLE = 300;

// 不同版本 @netlify/blobs 的 list() 返回结构不同，都兼容
function keysOf(listed) {
  const entries = Array.isArray(listed) ? listed : (listed && listed.blobs) || [];
  return entries.map((e) => (typeof e === "string" ? e : e && e.key)).filter(Boolean);
}
function idOf(key) {
  return String(key).split(":").pop();
}

const today = () => new Date().toISOString().slice(0, 10);

function dayKey(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10);
}

function visitorId(req) {
  const ip =
    req.headers.get("x-nf-client-connection-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown";
  const ua = req.headers.get("user-agent") || "";
  return createHash("sha256").update(`${SALT}|${ip}|${ua}`).digest("hex").slice(0, 16);
}

async function readJSON(store, key, fallback) {
  try {
    const raw = await store.get(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export default async (req) => {
  const store = getStore("stats");

  // ---------- 打点：记录一次访问 ----------
  if (req.method === "POST") {
    try {
      const id = visitorId(req);
      const day = today();
      const now = new Date().toISOString();

      const totals = await readJSON(store, "totals", { pv: 0, visitors: {}, since: now });
      const todayData = await readJSON(store, `day:${day}`, { pv: 0, visitors: [] });

      totals.pv = (totals.pv || 0) + 1;
      if (!totals.visitors) totals.visitors = {};
      if (!totals.visitors[id]) totals.visitors[id] = now;
      if (!totals.since) totals.since = now;

      todayData.pv = (todayData.pv || 0) + 1;
      if (!Array.isArray(todayData.visitors)) todayData.visitors = [];
      if (!todayData.visitors.includes(id)) todayData.visitors.push(id);

      await store.set("totals", JSON.stringify(totals));
      await store.set(`day:${day}`, JSON.stringify(todayData));

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      // 打点失败绝不影响主流程
      return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 200 });
    }
  }

  // ---------- 读取：需要密钥 ----------
  const url = new URL(req.url);
  const key = url.searchParams.get("k");

  if (!process.env.STATS_KEY || key !== process.env.STATS_KEY) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const days = Number(url.searchParams.get("days") || 14);

    const totals = await readJSON(store, "totals", { pv: 0, visitors: {}, since: null });
    const uvTotal = Object.keys(totals.visitors || {}).length;

    // 最近 N 天
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
      const dk = dayKey(i);
      const d = await readJSON(store, `day:${dk}`, { pv: 0, visitors: [] });
      series.push({ date: dk, pv: d.pv || 0, uv: (d.visitors || []).length });
    }

    const todayData = series[series.length - 1] || { pv: 0, uv: 0 };

    const rs = getStore({ name: "records", consistency: "strong" });

    // 认领历史数据：把迁移前没有 cid 的记录绑到指定 cid（需密钥，只能操作一次性的归属）
    if (url.searchParams.get("action") === "claim") {
      const cid = url.searchParams.get("cid");
      if (!cid) {
        return new Response(JSON.stringify({ error: "cid required" }), { status: 400 });
      }
      const rawClaim = await rs.get("all");
      const list = rawClaim ? JSON.parse(rawClaim) : [];
      let n = 0;
      for (const r of list) {
        if (r && !r.cid) {
          r.cid = String(cid);
          n++;
        }
      }
      if (n > 0) await rs.set("all", JSON.stringify(list));
      return new Response(JSON.stringify({ ok: true, claimed: n }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 闪光条数：新格式每条一个 key（rec:{cid}:{id}），旧格式在 "all" 数组里
    let legacy = [];
    try {
      const raw = await rs.get("all");
      legacy = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(legacy)) legacy = [];
    } catch {
      legacy = [];
    }

    let recKeys = [];
    try {
      recKeys = keysOf(await rs.list({ prefix: "rec:" }));
    } catch {
      recKeys = [];
    }

    const totalCount = recKeys.length + legacy.length;

    // 全量读取太慢，只取最近 MAX_SAMPLE 条用于展示
    const newest = recKeys
      .slice()
      .sort((a, b) => idOf(b).localeCompare(idOf(a)))
      .slice(0, MAX_SAMPLE);

    const fetched = (
      await Promise.all(
        newest.map(async (k) => {
          try {
            return await rs.get(k, { type: "json" });
          } catch {
            return null;
          }
        })
      )
    ).filter(Boolean);

    const records = [...fetched, ...legacy];

    // 最近新增的 5 条（只看文字，便于感受用户真实在写什么）
    const recent = [...records]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5)
      .map((r) => ({ text: String(r.text || "").slice(0, 60), date: r.date }));

    // 今天新增闪光
    const todayStr = today();
    const todayRecords = records.filter(
      (r) => String(r.date || "").slice(0, 10) === todayStr
    ).length;

    return new Response(
      JSON.stringify({
        ok: true,
        pv: totals.pv || 0,
        uv: uvTotal,
        since: totals.since,
        todayPv: todayData.pv,
        todayUv: todayData.uv,
        records: totalCount,
        withImage: records.filter((r) => r.image).length,
        unclaimed: legacy.filter((r) => !r.cid).length,
        todayRecords,
        series,
        recent,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
