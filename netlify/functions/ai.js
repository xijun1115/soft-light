export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 });
  }
  const { text = '' } = await req.json();

  // 限流：按 IP 简单记（Netlify 函数无状态，演示用，生产可换 KV）
  // 这里先不接 KV，只做基础防护：截断长度
  const clean = String(text).slice(0, 300);

  const sys = '你叫 Soft Light。只回一句克制、温暖、正向的鼓励，不反问、不展开、不超过 40 字。像靠谱朋友拍拍肩膀说“挺好的”。';
  const body = {
    model: 'deepseek-ai/DeepSeek-V2.5',
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: clean }
    ],
    max_tokens: 80,
    temperature: 0.8,
    stream: false
  };

  const resp = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SILICONFLOW_API_KEY}`
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    return new Response(JSON.stringify({ reply: '今天也值得被看见。' }), { status: 200 });
  }
  const data = await resp.json();
  const reply = data.choices?.[0]?.message?.content?.trim() || '挺好的。';
  return new Response(JSON.stringify({ reply }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

export const config = { path: '/api/ai' };