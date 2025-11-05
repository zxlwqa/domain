export default async function handler(req, res) {
  if (req.method?.toUpperCase() !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method Not Allowed'
    });
  }
  try {
    const { password } = req.body;
    const adminPassword = process.env.PASSWORD;
    if (!adminPassword) {
      return res.status(500).json({
        success: false,
        error: '管理员密码未配置'
      });
    }
    if (!password) {
      return res.status(400).json({
        success: false,
        error: '密码不能为空'
      });
    }
    const isValid = password.length === adminPassword.length && password === adminPassword;
    return res.json({
      success: isValid,
      message: isValid ? '密码验证成功' : '密码错误'
    });
  } catch (error) {
    console.error('密码验证错误:', error);
    return res.status(500).json({
      success: false,
      error: '密码验证失败'
    });
  }
}
