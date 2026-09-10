// ============================================================
// app.js - 小闪光 Soft Light
// ============================================================

// ---------- DOM 元素 ----------
const form = document.getElementById("record-form");
const textInput = document.getElementById("text-input");
const imageInput = document.getElementById("image-input");
const recordsContainer = document.getElementById("records-container");
const albumContainer = document.getElementById("album-container");
const summaryContent = document.getElementById("summary-content");
const tabRecords = document.getElementById("tab-records");
const tabAlbum = document.getElementById("tab-album");
const tabSummary = document.getElementById("tab-summary");
const pages = {
  records: document.getElementById("page-records"),
  album: document.getElementById("page-album"),
  summary: document.getElementById("page-summary"),
};

// ---------- 自定义确认弹窗 DOM ----------
let confirmOverlay, confirmText, confirmCancelBtn, confirmOkBtn;
let confirmResolve = null;

function initConfirmDialog() {
  confirmOverlay = document.getElementById("confirm-overlay");
  confirmText = document.getElementById("confirm-text");
  confirmCancelBtn = document.getElementById("confirm-cancel");
  confirmOkBtn = document.getElementById("confirm-ok");

  confirmCancelBtn.addEventListener("click", () => {
    confirmOverlay.classList.remove("show");
    if (confirmResolve) confirmResolve(false);
  });

  confirmOkBtn.addEventListener("click", () => {
    confirmOverlay.classList.remove("show");
    if (confirmResolve) confirmResolve(true);
  });
}

function showConfirm(message) {
  return new Promise((resolve) => {
    confirmResolve = resolve;
    confirmText.textContent = message;
    confirmOverlay.classList.add("show");
  });
}

// ---------- 设备身份 ----------
// 每个浏览器一个 id，只存在本地。服务端靠它隔离数据：
// 不登录、不留手机号，但每个人只看得到自己写的东西。
function getClientId() {
  try {
    let cid = localStorage.getItem("sl_client_id");
    if (!cid) {
      cid =
        (crypto && crypto.randomUUID && crypto.randomUUID()) ||
        "c-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
      localStorage.setItem("sl_client_id", cid);
    }
    return cid;
  } catch {
    // 隐私模式下 localStorage 不可用，退化成一次性 id
    return "anon-" + Math.random().toString(36).slice(2, 12);
  }
}

const CLIENT_ID = getClientId();

// ---------- 全局缓存 ----------
let memoryRecords = [];

// ---------- Tab 切换 ----------
function switchTab(tab) {
  Object.values(pages).forEach(p => p.style.display = "none");
  pages[tab].style.display = "block";
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.getElementById("tab-" + tab).classList.add("active");

  if (tab === "album") renderAlbum();
  if (tab === "summary") renderSummary();
}

tabRecords?.addEventListener("click", () => switchTab("records"));
tabAlbum?.addEventListener("click", () => switchTab("album"));
tabSummary?.addEventListener("click", () => switchTab("summary"));

// ---------- 图片压缩 ----------
function compressImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 400;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) {
            height = (height / width) * MAX;
            width = MAX;
          } else {
            width = (width / height) * MAX;
            height = MAX;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.6));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---------- 保存记录 ----------
async function saveRecord(text, imageBase64, reply) {
  try {
    const res = await fetch("/.netlify/functions/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        image: imageBase64 || null,
        reply,
        date: new Date().toISOString(),
        cid: CLIENT_ID,
      }),
    });
    if (!res.ok) throw new Error("save failed: " + res.status);
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    return data.id;
  } catch (err) {
    console.warn("⚠️ 云端保存失败，降级 localStorage", err);
    fallbackToLocal(text, imageBase64, reply);
    return null;
  }
}

// ---------- localStorage 降级 ----------
function fallbackToLocal(text, imageBase64, reply) {
  const records = JSON.parse(localStorage.getItem("softlight_records") || "[]");
  records.unshift({
    id: Date.now().toString(),
    text,
    image: imageBase64 || null,
    reply,
    date: new Date().toISOString(),
    cid: CLIENT_ID,
  });
  if (records.length > 50) records.splice(50);
  localStorage.setItem("softlight_records", JSON.stringify(records));
}

// ---------- 删除记录 ----------
async function deleteRecord(id) {
  try {
    const res = await fetch("/.netlify/functions/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, cid: CLIENT_ID }),
    });
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error("删除失败:", err);
    return false;
  }
}

// ---------- 从云端拉数据 ----------
async function fetchFromCloud() {
  try {
    const res = await fetch("/.netlify/functions/list?cid=" + encodeURIComponent(CLIENT_ID), {
      cache: "no-store",
    });
    if (!res.ok) return;
    const cloudRecords = await res.json();
    if (!Array.isArray(cloudRecords)) return;
    const cloudIds = new Set(cloudRecords.map(r => String(r.id)));
    const optimisticRecords = memoryRecords.filter(r => String(r.id).startsWith("temp-") && !cloudIds.has(String(r.id)));
    memoryRecords = [...cloudRecords, ...optimisticRecords];
  } catch (err) {
    console.warn("⚠️ 云端读取失败，保留本地内存", err);
  }
}

// ---------- 渲染 ----------
function renderRecords() {
  if (!recordsContainer) return;
  if (memoryRecords.length === 0) {
    recordsContainer.innerHTML = "<p style='color:#999;'>还没有记录，写下今天的小闪光吧 ✨</p>";
    return;
  }
  recordsContainer.innerHTML = "";
  memoryRecords.forEach(record => {
    const div = document.createElement("div");
    div.className = "record-item";
    div.innerHTML = `
      <p class="record-text">${escapeHtml(record.text)}</p>
      ${record.image ? `<img src="${record.image}" class="record-img" style="max-width:200px;border-radius:8px;margin:8px 0;">` : ""}
      ${record.reply ? `<p class="record-reply" style="color:#e8967a;font-style:italic;">💬 ${escapeHtml(record.reply)}</p>` : ""}
      <p class="record-date" style="font-size:12px;color:#bbb;">${formatDate(record.date)}</p>
      <div class="record-actions">
        <button class="delete-btn" data-id="${record.id}">🗑️ 删除</button>
      </div>
    `;
    recordsContainer.appendChild(div);
  });
}

function renderAlbum() {
  if (!albumContainer) return;
  const withImages = memoryRecords.filter(r => r.image);
  if (withImages.length === 0) {
    albumContainer.innerHTML = "<p style='color:#999;'>还没有照片，去记录第一条吧 📷</p>";
    return;
  }
  albumContainer.innerHTML = "";
  albumContainer.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;padding:8px;";
  withImages.forEach(record => {
    const wrap = document.createElement("div");
    wrap.className = "album-item";
    wrap.style.cssText = "position:relative;";
    wrap.innerHTML = `
      <img src="${record.image}" style="width:100%;height:140px;object-fit:cover;border-radius:8px;">
      <button class="delete-btn album-delete" data-id="${record.id}" title="删除">×</button>
    `;
    albumContainer.appendChild(wrap);
  });
}

function renderSummary() {
  if (!summaryContent) return;
  if (memoryRecords.length === 0) {
    summaryContent.innerHTML = "<p style='color:#999;'>还没有数据，去记录第一条吧 ✨</p>";
    return;
  }
  const total = memoryRecords.length;
  const withImage = memoryRecords.filter(r => r.image).length;
  const allText = memoryRecords.map(r => r.text).join("");
  const totalChars = allText.length;
  const dates = [...new Set(memoryRecords.map(r => r.date.split("T")[0]))].sort();
  const streak = calcStreak(dates);
  const thisWeek = memoryRecords.filter(r => {
    const d = new Date(r.date);
    const now = new Date();
    const diff = (now - d) / 86400000;
    return diff <= 7;
  }).length;
  summaryContent.innerHTML = `
    <div style="line-height:2;">
      <p>📝 累计记录：<strong>${total}</strong> 条</p>
      <p>📷 带图片：<strong>${withImage}</strong> 条</p>
      <p>✍️ 总字数：<strong>${totalChars}</strong> 字</p>
      <p>🔥 连续记录：<strong>${streak}</strong> 天</p>
      <p>📅 本周记录：<strong>${thisWeek}</strong> 条</p>
    </div>
  `;
}

function renderAll() {
  renderRecords();
  renderAlbum();
  renderSummary();
}

// ---------- 删除事件绑定 ----------
function bindDeleteEvents() {
  recordsContainer?.addEventListener("click", handleDeleteClick);
  albumContainer?.addEventListener("click", handleDeleteClick);
}

async function handleDeleteClick(e) {
  const btn = e.target.closest(".delete-btn");
  if (!btn) return;

  const id = btn.dataset.id;
  const record = memoryRecords.find(r => String(r.id) === String(id));
  const text = record?.text || "";

  // 自定义确认弹窗
  const ok = await showConfirm(`确定要删除这条闪光吗？\n\n「${text}」`);
  if (!ok) return;

  // 乐观删除
  memoryRecords = memoryRecords.filter(r => String(r.id) !== String(id));
  renderAll();

  const success = await deleteRecord(id);
  if (!success) {
    alert("删除失败，请稍后重试");
    await fetchFromCloud();
    renderAll();
  }
}

// ---------- 工具函数 ----------
function calcStreak(dates) {
  if (dates.length === 0) return 0;
  let streak = 1;
  for (let i = dates.length - 1; i > 0; i--) {
    const diff = (new Date(dates[i]) - new Date(dates[i - 1])) / 86400000;
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

// 本地兜底：AI 完全不可用时，按内容挑一句，避免所有回复一模一样
const LOCAL_FALLBACKS = [
  "今天也值得被看见。",
  "记下来这件事，就足够温柔了。",
  "你已经做得挺好的。",
  "这一点点，也是光。",
  "慢慢来，你在往前走。",
];

function pickLocalFallback(seed) {
  let h = 0;
  for (const ch of String(seed)) {
    h = (h * 31 + ch.codePointAt(0)) % 1000003;
  }
  return LOCAL_FALLBACKS[h % LOCAL_FALLBACKS.length];
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ---------- 提交表单 ----------
form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = textInput.value.trim();
  if (!text) return;

  const submitBtn = form.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  submitBtn.textContent = "保存中...";

  let imageBase64 = null;
  if (imageInput.files[0]) {
    imageBase64 = await compressImage(imageInput.files[0]);
  }

  const optimisticId = "temp-" + Date.now();
  const optimistic = {
    id: optimisticId,
    text,
    image: imageBase64,
    reply: "AI 正在思考温暖的话...",
    date: new Date().toISOString(),
  };
  memoryRecords.unshift(optimistic);
  renderAll();

  // AI 请求
  let reply = "";
  try {
    const aiRes = await fetch("/.netlify/functions/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      reply = aiData.reply || "";
      // ok === false 表示 AI 没真正生成，用的是兜底语（如余额不足）
      if (aiData.ok === false) {
        console.warn("⚠️ AI 未生成，已用兜底语:", aiData.error);
      }
    }
  } catch (err) {
    console.warn("⚠️ AI 函数请求失败:", err);
  }
  if (!reply) reply = pickLocalFallback(text);

  optimistic.reply = reply;
  renderAll();

  const realId = await saveRecord(text, imageBase64, reply);
  if (realId) optimistic.id = realId;

  await fetchFromCloud();
  renderAll();

  textInput.value = "";
  imageInput.value = "";
  submitBtn.disabled = false;
  submitBtn.textContent = "保存闪光 ✨";
});

// ---------- 访问打点（失败不影响主流程） ----------
fetch("/.netlify/functions/stats", { method: "POST" }).catch(() => {});

// ---------- 页面加载 ----------
switchTab("records");
initConfirmDialog();
bindDeleteEvents();
fetchFromCloud().then(() => renderAll());