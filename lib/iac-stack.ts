import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

export class IacStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // API Key用のSecret作成
    const apiKeySecret = new secretsmanager.Secret(this, "MastraApiKey", {
      description: "API Key for Mastra Lambda Function",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ apiKey: "" }),
        generateStringKey: "apiKey",
        excludeCharacters: " %+~`#$&*()|[]{}:;<>?!'/\\\"",
        passwordLength: 32,
      },
    });

    // Create Lambda function from Docker image
    const mastraLambda = new lambda.DockerImageFunction(this, "MastraLambda", {
      code: lambda.DockerImageCode.fromImageAsset("./mastra"),
      memorySize: 512,
      timeout: cdk.Duration.seconds(300),
      reservedConcurrentExecutions: 50,
      environment: {
        NODE_ENV: "production",
        AWS_LWA_INVOKE_MODE: "response_stream", // ストリーミング設定
        LANGFUSE_PUBLIC_KEY: "pk-xxx",
        LANGFUSE_SECRET_KEY: "sk-xxx",
        LANGFUSE_BASE_URL: "https://xxx.langfuse.com",
        API_KEY_SECRET_ARN: apiKeySecret.secretArn,
        // 許可されたオリジンを環境変数で設定
        ALLOWED_ORIGINS: JSON.stringify([
          "https://your-client-app.com", // 本番クライアントのURL
          "http://localhost:3000", // ローカル開発用
          "http://localhost:4111", // ローカル開発用（別ポート）
        ]),
      },
      architecture: lambda.Architecture.ARM_64, // 元の設定に合わせる
    });

    // Secrets Managerへのアクセス権限を付与
    apiKeySecret.grantRead(mastraLambda);

    // Add Bedrock full access permissions to the Lambda function
    mastraLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:*"],
        resources: ["*"],
      })
    );

    // Function URL with streaming support
    const functionUrl = mastraLambda.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM, // ストリーミング有効
      cors: {
        allowedOrigins: ["*"],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedHeaders: ["*"],
      },
    });

    // Outputs
    new cdk.CfnOutput(this, "MastraLambdaArn", {
      value: mastraLambda.functionArn,
      description: "Mastra Lambda Function ARN",
    });

    new cdk.CfnOutput(this, "MastraFunctionUrl", {
      value: functionUrl.url,
      description: "Mastra Lambda Function URL with streaming support",
    });

    new cdk.CfnOutput(this, "ApiKeySecretArn", {
      value: apiKeySecret.secretArn,
      description:
        "API Key Secret ARN - Retrieve the API key from Secrets Manager",
    });
  }
}
