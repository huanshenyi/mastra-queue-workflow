import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";

export function initializeBedrockClient() {
  return createAmazonBedrock({
    region: "us-east-1",
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN ?? undefined,
  });
}
