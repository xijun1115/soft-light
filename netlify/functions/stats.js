import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

// 统计：PV（访问次数）/ UV（独立访客，IP+UA 加盐哈希）/ 闪光条数
// 读数据需要 ?k=STATS_KEY，避免被路人看光

const SALT = process.env.STATS_SALT || "soft-light-2026";

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

    // 闪光条数（主数据）
    let records = [];
    try {
      const rs = getStore("records");
      const raw = await rs.get("all");
      records = raw ? JSON.parse(raw) : [];
    } catch {
      records = [];
    }

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
        records: records.length,
        withImage: records.filter((r) => r.image).length,
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
