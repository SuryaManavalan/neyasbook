import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

export class WritingWorkspaceStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // 1. Storage - The Heart of the App
        const storyBucket = new s3.Bucket(this, 'StoryBucket', {
            versioned: true,
            encryption: s3.BucketEncryption.S3_MANAGED,
            cors: [{
                allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
                allowedOrigins: ['*'], // Tighten in production
                allowedHeaders: ['*'],
            }],
        });

        // 2. Chat Lambda (Streaming)
        const chatLambda = new nodejs.NodejsFunction(this, 'ChatHandler', {
            entry: 'backend/functions/chat/index.ts',
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_18_X,
            timeout: cdk.Duration.minutes(2), // Long timeout for streaming
            environment: {
                STORY_BUCKET: storyBucket.bucketName,
                OPENAI_API_KEY: 'set-locally-or-via-secrets',
            },
        });

        // 3. Sweep Lambda (Background Intelligence)
        const sweepLambda = new nodejs.NodejsFunction(this, 'SweepHandler', {
            entry: 'backend/functions/sweep/index.ts',
            handler: 'handler',
            runtime: lambda.Runtime.NODEJS_18_X,
            timeout: cdk.Duration.minutes(5),
            environment: {
                STORY_BUCKET: storyBucket.bucketName,
                OPENAI_API_KEY: 'set-locally-or-via-secrets',
            },
        });

        // Grant permissions
        storyBucket.grantReadWrite(chatLambda);
        storyBucket.grantReadWrite(sweepLambda);

        // 4. API Gateway (HTTP API for Streaming Support)
        const api = new apigateway.HttpApi(this, 'WritingWorkspaceApi', {
            corsPreflight: {
                allowedHeaders: ['Authorization', 'Content-Type'],
                allowedMethods: [apigateway.CorsHttpMethod.GET, apigateway.CorsHttpMethod.POST],
                allowedOrigins: ['*'],
            },
        });

        api.addRoutes({
            path: '/chat',
            methods: [apigateway.HttpMethod.POST],
            integration: new HttpLambdaIntegration('ChatIntegration', chatLambda),
        });

        new cdk.CfnOutput(this, 'ApiEndpoint', { value: api.apiEndpoint });
        new cdk.CfnOutput(this, 'BucketName', { value: storyBucket.bucketName });
    }
}
