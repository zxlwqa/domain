export interface CloudflareEnv {
  DOMAIN: {
    prepare(query: string): {
      bind(...args: unknown[]): {
        run(): Promise<void>;
        all(): Promise<{ results: unknown[] }>;
      };
      run(): Promise<void>;
      all(): Promise<{ results: unknown[] }>;
    };
    exec(query: string): Promise<void>;
  };
  TG_BOT_TOKEN?: string;
  TG_USER_ID?: string;
  WECHAT_SENDKEY?: string;
  QMSG_KEY?: string;
  QMSG_QQ?: string;
  CF_KEY?: string;
  CF_EMAIL?: string;
  PASSWORD?: string;
  WEBDAV_URL?: string;
  WEBDAV_USER?: string;
  WEBDAV_PASS?: string;
  GIT_TOKEN?: string;
}

export interface CloudflareContext {
  request: Request;
  env: CloudflareEnv;
  waitUntil?: (promise: Promise<unknown>) => void;
  passThroughOnException?: () => void;
}

