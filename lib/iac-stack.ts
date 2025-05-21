import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';

export class IacStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create Lambda function from Docker image
    const mastraLambda = new lambda.DockerImageFunction(this, 'MastraLambda', {
      code: lambda.DockerImageCode.fromImageAsset("./mastra"),
      memorySize: 1024,
      timeout: cdk.Duration.seconds(30),
      environment: {
        NODE_ENV: 'production',
      },
      architecture: lambda.Architecture.X86_64
    });

    // Add Bedrock full access permissions to the Lambda function
    mastraLambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:*'  // フルアクセス権限を付与
      ],
      resources: ['*']
    }));

    // Create API Gateway REST API
    const api = new apigateway.RestApi(this, 'MastraApi', {
      restApiName: 'Mastra Service',
      description: 'API for Mastra application',
      deployOptions: {
        stageName: 'prod',
      },
      // CORS設定を追加
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date', 'X-Api-Key', 'X-Amz-Security-Token']
      }
    });

    // Add proxy integration for all routes
    const integration = new apigateway.LambdaIntegration(mastraLambda);
    
    // Add a catch-all proxy resource
    const apiResource = api.root.addResource('api');
    apiResource.addProxy({
      defaultIntegration: integration,
      anyMethod: true,
    });

    // Output the API URL
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: `${api.url}api`,
      description: 'The URL of the API Gateway',
    });
    
    // Alternative: Lambda Function URL (uncomment if you prefer this approach)
    /*
    const functionUrl = mastraLambda.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ['*'],
        allowedMethods: [lambda.HttpMethod.ALL],
        allowedHeaders: ['*'],
      },
    });

    new cdk.CfnOutput(this, 'FunctionUrl', {
      value: functionUrl.url,
      description: 'The URL of the Lambda function',
    });
    */
  }
}
