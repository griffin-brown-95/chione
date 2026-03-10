declare namespace NodeJS {
    interface ProcessEnv {
      DATABASE_URL: string;
      DATABASE_URL_UNPOOLED: string;
      ANTHROPIC_API_KEY: string;
      BROWSE_AI_API_KEY: string;
      BROWSE_AI_ROBOT_ISU: string;
    }
  }