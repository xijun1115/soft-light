const MODEL = 'deepseek-ai/DeepSeek-V3';

// 兜底语料：按内容哈希挑选，保证「不同内容 → 不同兜底」，同一内容结果稳定
const FALLBACKS = [
  '今天也值得被看见。',
  '记下来这件事，就足够温柔了。',
  '你已经做得挺好的。',
  '这一点点，也是光。',
  '慢慢来，你在往前走。',
  '被你记下的瞬间，就不会白过。',
];

function pickFallback(seed) {
  let h = 0;
  for (const ch of String(seed)) {
    h = (h * 31 + ch.codePointAt(0)) % 1000003;
  }
  return FALLBACKS[h % FALLBACKS.length];
}

// 失败时统一返回：ok=false 让前端能感知降级，error 说明具体原因
function degraded(seed, reason) {
  console.error('🤖 [ai] 降级:', reason);
  return new Response(
    JSON.stringify({ reply: pickFallback(seed), ok: false, error: reason }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 });
  }

  const { text = '' } = await req.json();
  const apiKey = process.env.SILICONFLOW_API_KEY;
  const clean = String(text).slice(0, 300);

  if (!apiKey) {
    return degraded(clean, '未配置 SILICONFLOW_API_KEY');
  }

  const body = {
    model: MODEL,
    messages: [
      {
        role: 'system',
        content: '你叫 Soft Light。只回一句克制、温暖、正向的鼓励，不反问、不展开、不超过 40 字。像靠谱朋友拍拍肩膀说"挺好的"。'
      },
      {
        role: 'user',
        content: clean
      }
    ],
    max_tokens: 80,
    temperature: 0.8,
    stream: false
  };

  try {
    const resp = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const errText = await resp.text();
      let reason = `SiliconFlow ${resp.status}: ${errText}`;
      if (resp.status === 402) reason = 'SiliconFlow 账户余额不足（402），请充值';
      else if (resp.status === 401) reason = 'SiliconFlow API Key 无效（401）';
      else if (resp.status === 404) reason = `模型不存在（404）：${MODEL}`;
      else if (resp.status === 429) reason = '请求过于频繁（429）';
      return degraded(clean, reason);
    }

    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) return degraded(clean, '模型返回内容为空');

    console.log('🤖 [ai] 生成回复:', reply);
    return new Response(JSON.stringify({ reply, ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return degraded(clean, '请求异常: ' + err.message);
  }
};