import { Pool } from 'pg';

const isVercel = process.env.VERCEL === '1' || process.env.DATABASE_URL;
let pool = null;
export async function initializeDatabase() {
  if (isVercel) {
    if (!pool) {
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      });
      try {
        await pool.query('SELECT NOW()');
        console.log('✅ Vercel 数据库连接成功');
      } catch (error) {
        console.error('❌ Vercel 数据库连接失败:', error);
        throw error;
      }
      await initializeTables();
    }
    return pool;
  }
  return null;
}
export async function getDB() {
  if (isVercel && pool) {
    return pool;
  }
  throw new Error('数据库未初始化');
}
async function initializeTables() {
  if (!pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS domains (
        id SERIAL PRIMARY KEY,
        domain TEXT UNIQUE NOT NULL,
        registrar TEXT NOT NULL,
        register_date TEXT NOT NULL,
        expire_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        renewUrl TEXT
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS logs (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        status TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        user_agent TEXT,
        ip_address TEXT,
        device_info TEXT,
        domain TEXT,
        notification_method TEXT,
        error_details TEXT
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_settings (
        id SERIAL PRIMARY KEY,
        warning_days TEXT NOT NULL,
        notification_enabled TEXT NOT NULL,
        notification_interval TEXT NOT NULL,
        notification_method TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      ALTER TABLE notification_settings
      ADD COLUMN IF NOT EXISTS bg_image_url TEXT,
      ADD COLUMN IF NOT EXISTS carousel_interval INT,
      ADD COLUMN IF NOT EXISTS carousel_enabled TEXT
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_domains_domain ON domains(domain);
      CREATE INDEX IF NOT EXISTS idx_domains_status ON domains(status);
      CREATE INDEX IF NOT EXISTS idx_domains_expire_date ON domains(expire_date);
      CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_logs_type ON logs(type);
      CREATE INDEX IF NOT EXISTS idx_logs_domain ON logs(domain);
    `);
    console.log('✅ 数据库表初始化完成');
  } catch (error) {
    console.error('❌ 数据库表初始化失败:', error);
    throw error;
  }
}
export async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
