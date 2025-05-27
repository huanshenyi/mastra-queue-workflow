import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';

export class IacStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create Lambda function from Docker image
    const mastraLambda = new lambda.DockerImageFunction(this, 'MastraLambda', {
      code: lambda.DockerImageCode.fromImageAsset("./mastra"),
      memorySize: 512,
      timeout: cdk.Duration.seconds(300),
      environment: {
        NODE_ENV: 'production',
        AWS_LWA_INVOKE_MODE: 'response_stream', // ストリーミング設定
        LANGFUSE_PUBLIC_KEY: 'pk-xxx',
        LANGFUSE_SECRET_KEY: 'sk-xxx',
        LANGFUSE_BASE_URL: 'https://xxx.langfuse.com',
      },
      architecture: lambda.Architecture.ARM_64, // 元の設定に合わせる
    });

    // Add Bedrock full access permissions to the Lambda function
    mastraLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:*'
      ],
      resources: ['*']
    }));

    // Function URL with streaming support
    const functionUrl = mastraLambda.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM, // ストリーミング有効
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedHeaders: ['*'],
      },
    });

    // Outputs
    new cdk.CfnOutput(this, 'MastraLambdaArn', {
      value: mastraLambda.functionArn,
      description: 'Mastra Lambda Function ARN',
    });

    new cdk.CfnOutput(this, 'MastraFunctionUrl', {
      value: functionUrl.url,
      description: 'Mastra Lambda Function URL with streaming support',
    });
  }
}