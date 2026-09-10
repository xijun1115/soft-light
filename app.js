// ============================================================
// app.js - 小闪光 Soft Light
// 功能：记录日常闪光点 → AI 温暖回复 → 相册/小结持久化
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

// ---------- Tab 切换 ----------
function switchTab(tab) {
  Object.values(pages).forEach(p => p.style.display = "none");
  pages[tab].style.display = "block";
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.getElementById("tab-" + tab).classList.add("active");

  if (tab === "album") loadAlbum();
  if (tab === "summary") loadSummary();
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
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    console.log("☁️ 云端保存成功", data.id);
  } catch (err) {
    console.warn("云端保存失败，降级 localStorage", err);
    fallbackToLocal(text, imageBase64, reply);
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
  });
  // 只保留最近 50 条
  if (records.length > 50) records.splice(50);
  localStorage.setItem("softlight_records", JSON.stringify(records));
}

// ---------- 加载记录列表（首页） ----------
async function loadRecords() {
  if (!recordsContainer) return;
  recordsContainer.innerHTML = "<p style='color:#999;'>加载中...</p>";

  let records = [];
  try {
    const res = await fetch("/.netlify/functions/list");
    if (res.ok) {
      records = await res.json();
    } else {
      throw new Error("fetch failed");
    }
  } catch {
    // 降级读 localStorage
    records = JSON.parse(localStorage.getItem("softlight_records") || "[]");
  }

  if (records.length === 0) {
    recordsContainer.innerHTML = "<p style='color:#999;'>还没有记录，写下今天的小闪光吧 ✨</p>";
    return;
  }

  recordsContainer.innerHTML = "";
  records.forEach(record => {
    const div = document.createElement("div");
    div.className = "record-item";
    div.innerHTML = `
      <p class="record-text">${escapeHtml(record.text)}</p>
      ${record.image ? `<img src="${record.image}" class="record-img" style="max-width:200px;border-radius:8px;margin:8px 0;">` : ""}
      ${record.reply ? `<p class="record-reply" style="color:#e8967a;font-style:italic;">💬 ${escapeHtml(record.reply)}</p>` : ""}
      <p class="record-date" style="font-size:12px;color:#bbb;">${formatDate(record.date)}</p>
    `;
    recordsContainer.appendChild(div);
  });
}

// ---------- 加载相册 ----------
async function loadAlbum() {
  if (!albumContainer) return;
  albumContainer.innerHTML = "<p style='color:#999;'>加载中...</p>";

  let records = [];
  try {
    const res = await fetch("/.netlify/functions/list");
    if (res.ok) records = await res.json();
    else throw new Error("fetch failed");
  } catch {
    records = JSON.parse(localStorage.getItem("softlight_records") || "[]");
  }

  const withImages = records.filter(r => r.image);
  if (withImages.length === 0) {
    albumContainer.innerHTML = "<p style='color:#999;'>还没有照片，去记录第一条吧 📷</p>";
    return;
  }

  albumContainer.innerHTML = "";
  albumContainer.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;padding:8px;";
  withImages.forEach(record => {
    const img = document.createElement("img");
    img.src = record.image;
    img.style.cssText = "width:100%;height:140px;object-fit:cover;border-radius:8px;";
    img.title = record.text;
    albumContainer.appendChild(img);
  });
}

// ---------- 加载小结 ----------
async function loadSummary() {
  if (!summaryContent) return;
  summaryContent.innerHTML = "<p style='color:#999;'>加载中...</p>";

  let records = [];
  try {
    const res = await fetch("/.netlify/functions/list");
    if (res.ok) records = await res.json();
    else throw new Error("fetch failed");
  } catch {
    records = JSON.parse(localStorage.getItem("softlight_records") || "[]");
  }

  if (records.length === 0) {
    summaryContent.innerHTML = "<p style='color:#999;'>还没有数据，去记录第一条吧 ✨</p>";
    return;
  }

  const total = records.length;
  const withImage = records.filter(r => r.image).length;
  const allText = records.map(r => r.text).join("");
  const totalChars = allText.length;
  const dates = [...new Set(records.map(r => r.date.split("T")[0]))].sort();
  const streak = calcStreak(dates);

  // 本周记录
  const thisWeek = records.filter(r => {
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

// ---------- 连续天数计算 ----------
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

// ---------- 工具函数 ----------
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

  // 先展示用户自己的记录
  const tempRecord = {
    id: "temp",
    text,
    image: imageBase64,
    reply: "AI 正在思考温暖的话...",
    date: new Date().toISOString(),
  };
  prependRecord(tempRecord);

  // 请求 AI（带降级兜底）
  let reply = "今天也值得被看见。";
  try {
    const aiRes = await fetch("/.netlify/functions/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      reply = aiData.reply || reply;
    }
  } catch {
    console.warn("AI 请求失败，用兜底文案");
  }

  // 更新页面上的回复
  const lastReply = recordsContainer.querySelector(".record-reply");
  if (lastReply) lastReply.textContent = "💬 " + reply;

  // 保存到云端
  await saveRecord(text, imageBase64, reply);

  // 重置表单
  textInput.value = "";
  imageInput.value = "";
  submitBtn.disabled = false;
  submitBtn.textContent = "保存闪光 ✨";

  // 刷新记录列表
  // 刷新所有 Tab 的数据
  loadRecords();
  loadAlbum();
  loadSummary();
});

// ---------- 预展示 ----------
function prependRecord(record) {
  if (!recordsContainer) return;
  const div = document.createElement("div");
  div.className = "record-item";
  div.innerHTML = `
    <p class="record-text">${escapeHtml(record.text)}</p>
    ${record.image ? `<img src="${record.image}" class="record-img" style="max-width:200px;border-radius:8px;margin:8px 0;">` : ""}
    <p class="record-reply" style="color:#e8967a;font-style:italic;">💬 ${escapeHtml(record.reply)}</p>
    <p class="record-date" style="font-size:12px;color:#bbb;">刚刚</p>
  `;
  recordsContainer.prepend(div);
}

// ---------- 页面加载 ----------
switchTab("records");
loadRecords();