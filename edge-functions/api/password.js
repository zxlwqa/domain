function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
  });
}

export async function onRequest({ request, env }) {
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }
  if (method !== 'POST') {
    return json({ success: false, error: 'Method Not Allowed' }, 405);
  }
  try {
    const { password } = await request.json();
    const adminPassword = (env && env.PASSWORD) || (typeof process !== 'undefined' && process.env ? process.env.PASSWORD : undefined);
    if (!adminPassword) {
      return json({ success: false, error: '管理员密码未配置' }, 500);
    }
    if (!password) {
      return json({ success: false, error: '密码不能为空' }, 400);
    }
    const isValid = password.length === adminPassword.length && password === adminPassword;
    return json({ success: isValid, message: isValid ? '密码验证成功' : '密码错误' });
  } catch {
    return json({ success: false, error: '密码验证失败' }, 500);
  }
}


