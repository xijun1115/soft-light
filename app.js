// ============================================================
// app.js - 小闪光 Soft Light（诊断版，带详细日志）
// 部署后打开 F12 → Console，按提示看 LOG 输出
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

// ---------- 全局缓存：内存里永远有一份，不依赖异步刷新 ----------
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
  console.log("📤 [save] 开始保存...");
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
    console.log("📤 [save] 响应状态:", res.status);
    const data = await res.json();
    console.log("📤 [save] 响应数据:", data);
    if (!data.success) throw new Error(data.error);
    console.log("☁️ 云端保存成功", data.id);
    return true;
  } catch (err) {
    console.warn("⚠️ 云端保存失败，降级 localStorage", err);
    fallbackToLocal(text, imageBase64, reply);
    return false;
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
  if (records.length > 50) records.splice(50);
  localStorage.setItem("softlight_records", JSON.stringify(records));
  console.log("💾 localStorage 已写入，条数:", records.length);
}

// ---------- 从云端拉数据，更新内存缓存 ----------
async function fetchFromCloud() {
  try {
    const res = await fetch("/.netlify/functions/list", { cache: "no-store" });
    console.log("📥 [list] 响应状态:", res.status);
    if (res.ok) {
      const cloudRecords = await res.json();
      console.log("📥 [list] 返回条数:", cloudRecords.length, cloudRecords);
      if (Array.isArray(cloudRecords)) {
        // 🔑 关键：把云端数据里没有的"临时记录"保留下来
        const cloudIds = new Set(cloudRecords.map(r => r.id));
        const optimisticRecords = memoryRecords.filter(r => 
          r.id.startsWith("temp-") && !cloudIds.has(r.id)
        );
        // 云端数据放前面，乐观记录跟在后面
        memoryRecords = [...cloudRecords, ...optimisticRecords];
      }
    } else {
      throw new Error("list fetch failed: " + res.status);
    }
  } catch (err) {
    console.warn("⚠️ 云端读取失败，降级 localStorage", err);
    // 读取失败时不覆盖内存，保留现有数据
  }
}

// ---------- 渲染：全部基于 memoryRecords，同步、无闪烁 ----------
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
    const img = document.createElement("img");
    img.src = record.image;
    img.style.cssText = "width:100%;height:140px;object-fit:cover;border-radius:8px;";
    img.title = record.text;
    albumContainer.appendChild(img);
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

// 一键刷新所有视图（同步，无异步竞态）
function renderAll() {
  console.log("🎨 [renderAll] memoryRecords 条数:", memoryRecords.length);
  renderRecords();
  renderAlbum();
  renderSummary();
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

  // 立刻把这条临时加进内存并渲染 → 用户立即看到，绝不依赖云端
  const optimistic = {
    id: "temp-" + Date.now(),
    text,
    image: imageBase64,
    reply: "AI 正在思考温暖的话...",
    date: new Date().toISOString(),
  };
  memoryRecords.unshift(optimistic);
  renderAll();

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

  // 更新内存中这条的 reply（就地改，不再整列重渲）
  optimistic.reply = reply;
  renderAll();

  // 保存到云端（不 await 也不影响页面，页面已显示）
  await saveRecord(text, imageBase64, reply);

  // 重置表单
  textInput.value = "";
  imageInput.value = "";
  submitBtn.disabled = false;
  submitBtn.textContent = "保存闪光 ✨";

  // 保存完成后，后台静默同步一次云端真实数据（替换临时 id）
  await fetchFromCloud();
  // 关键：用内存数据重新渲染，临时节点被真实数据无缝替换
  renderAll();
  console.log("✅ [submit] 完成，最终条数:", memoryRecords.length);
});

// ---------- 页面加载 ----------
switchTab("records");
fetchFromCloud().then(() => renderAll());
