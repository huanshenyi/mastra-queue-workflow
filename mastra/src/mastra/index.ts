import { Mastra } from "@mastra/core/mastra";
import { createEpisodeWorkflow } from "./workflows";
import { weatherAgent } from "./agents";
import { episodeGeneratorAgent } from "./agents/episodeGeneratorAgent";
import { summaryAgent } from "./agents/summaryAgent";
import { characterEvaluatorAgent } from "./agents/characterEvaluatorAgent";
import { LangfuseExporter } from "langfuse-vercel";
import { PinoLogger } from "@mastra/loggers";
import { LibSQLStore } from "@mastra/libsql";

export const mastra = new Mastra({
  workflows: { createEpisodeWorkflow },
  agents: {
    weatherAgent,
    episodeGeneratorAgent,
    characterEvaluatorAgent,
    summaryAgent,
  },
  storage: new LibSQLStore({
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),
  telemetry: {
    serviceName: "ai",
    enabled: true,
    export: {
      type: "custom",
      exporter: new LangfuseExporter({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        baseUrl: process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com",
      }),
    },
  },
  server: {
    middleware: [
      {
        handler: async (c, next) => {
          const isDevPlayground =
            c.req.header("x-mastra-dev-playground") === "true";
          if (isDevPlayground) {
            await next();
            return;
          }
          const authHeader = c.req.header("Authorization");
          if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return new Response("Unauthorized", { status: 401 });
          }
          const token = authHeader.substring(7);
          const validApiKey = process.env.BEARER_KEY || "your-secret-api-key";
          if (token !== validApiKey) {
            return new Response("Invalid token", { status: 401 });
          }
          await next();
        },
        path: "/api/*",
      },
    ],
  },
});
