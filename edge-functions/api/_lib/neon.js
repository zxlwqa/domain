import { neon, neonConfig } from '@neondatabase/serverless';

let cachedSql = null;
let tablesInitialized = false;
let externalEnv = null;

export function setEnvSource(env) {
  externalEnv = env || null;
}

const safeGetEnv = (key) => {
  if (externalEnv && typeof externalEnv === 'object') return externalEnv[key];
  try {
    if (typeof process !== 'undefined' && process && process.env) return process.env[key];
  } catch {
  }
  return undefined;
};

const getDatabaseUrl = () => {
  const url = safeGetEnv('DATABASE_URL');
  if (!url) {
    throw new Error('Missing DATABASE_URL environment variable');
  }
  if (typeof url === 'string' && !/([?&])sslmode=/.test(url)) {
    const join = url.includes('?') ? '&' : '?';
    return `${url}${join}sslmode=require`;
  }
  return url;
};

export function getNeonClient(env) {
  if (env) setEnvSource(env);
  if (cachedSql) return cachedSql;
  try {
    neonConfig.fetchConnectionCache = true;
    neonConfig.pipelineConnect = false;
    neonConfig.poolQueryViaFetch = true;
  } catch {
  }
  const connectionString = getDatabaseUrl();
  cachedSql = neon(connectionString);
  return cachedSql;
}

export async function testConnection(env) {
  const sql = getNeonClient(env);
  await sql`SELECT NOW()`;
}

export async function initializeTablesIfNeeded(env) {
  if (env) setEnvSource(env);
  if (tablesInitialized) return;
  const sql = getNeonClient();
  try {
    await sql`CREATE TABLE IF NOT EXISTS domains (
      id SERIAL PRIMARY KEY,
      domain TEXT UNIQUE NOT NULL,
      registrar TEXT NOT NULL,
      register_date TEXT NOT NULL,
      expire_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      renewUrl TEXT
    )`;

    await sql`CREATE TABLE IF NOT EXISTS logs (
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
    )`;

    await sql`CREATE TABLE IF NOT EXISTS notification_settings (
      id SERIAL PRIMARY KEY,
      warning_days TEXT NOT NULL,
      notification_enabled TEXT NOT NULL,
      notification_interval TEXT NOT NULL,
      notification_method TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;

    await sql`ALTER TABLE notification_settings
      ADD COLUMN IF NOT EXISTS bg_image_url TEXT,
      ADD COLUMN IF NOT EXISTS carousel_interval INT,
      ADD COLUMN IF NOT EXISTS carousel_enabled TEXT`;

    await sql`CREATE INDEX IF NOT EXISTS idx_domains_domain ON domains(domain)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_domains_status ON domains(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_domains_expire_date ON domains(expire_date)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_logs_type ON logs(type)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_logs_domain ON logs(domain)`;

    tablesInitialized = true;
  } catch (e) {
    tablesInitialized = false;
    throw e;
  }
}


