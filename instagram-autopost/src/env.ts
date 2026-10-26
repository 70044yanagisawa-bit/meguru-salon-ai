export interface Env {
  DB: D1Database;

  HPB_BLOG_URL: string;
  PUBLIC_BASE_URL: string;
  AUTO_PUBLISH: string;
  IG_USER_ID: string;
  IG_API_VERSION: string;
  SALON_NAME: string;
  BOOKING_TEXT: string;
  FIXED_HASHTAGS: string;

  ANTHROPIC_API_KEY: string;
  IG_ACCESS_TOKEN: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LINE_CHANNEL_SECRET: string;
  LINE_OWNER_USER_ID?: string;
  ADMIN_KEY: string;
}
