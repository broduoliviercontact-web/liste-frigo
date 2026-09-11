/// <reference types="@cloudflare/workers-types" />

declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    SUPERVIE_ACCESS_CODE?: string;
    IDFM_PRIM_API_KEY?: string;
    AISSTREAM_API_KEY?: string;
    BOATS_USE_MOCK?: string;
    SUPERVIE_LOCAL_MOCKS?: string;
  }
}

interface ImportMeta {
  env: { DEV?: boolean };
}
