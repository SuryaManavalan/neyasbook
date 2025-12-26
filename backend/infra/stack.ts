import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Construct } from 'constructs';
import * as path from 'path';

export class NeyasbookStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // 1. S3 Storage Bucket - The "Infinite Hard Drive"
        const storyBucket = new s3.Bucket(this, 'StoryBucket', {
            versioned: true,
            encryption: s3.BucketEncryption.S3_MANAGED,
            cors: [{
                allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
                allowedOrigins: ['*'], // Tighten in production
                allowedHeaders: ['*'],
            }],
            removalPolicy: cdk.RemovalPolicy.RETAIN, // Don't delete data on stack destroy
        });

        // 2. Frontend S3 Bucket (for static website hosting)
        const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
            websiteIndexDocument: 'index.html',
            websiteErrorDocument: 'index.html', // SPA routing
            publicReadAccess: true,
            blockPublicAccess: new s3.BlockPublicAccess({
                blockPublicAcls: false,
                blockPublicPolicy: false,
                ignorePublicAcls: false,
                restrictPublicBuckets: false,
            }),
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });

        // 3. Backend Lambda Function
        const apiLambda = new lambda.Function(this, 'ApiHandler', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'lambda.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '..'), {
                exclude: [
                    'cdk.out',
                    '*.ts',
                    'app.ts',
                    'infra',
                    'tsconfig.json',
                    'cdk.json',
                ],
            }),
            timeout: cdk.Duration.minutes(2),
            memorySize: 512,
            environment: {
                STORY_BUCKET: storyBucket.bucketName,
                OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'SET_IN_CONSOLE',
            },
        });

        // Grant S3 permissions
        storyBucket.grantReadWrite(apiLambda);

        // 5. API Gateway HTTP API - Routes to Lambda
        const api = new apigateway.HttpApi(this, 'NeyasbookApi', {
            corsPreflight: {
                allowHeaders: ['Authorization', 'Content-Type', '*'],
                allowMethods: [
                    apigateway.CorsHttpMethod.GET,
                    apigateway.CorsHttpMethod.POST,
                    apigateway.CorsHttpMethod.PUT,
                    apigateway.CorsHttpMethod.DELETE,
                    apigateway.CorsHttpMethod.OPTIONS,
                ],
                allowOrigins: ['*'], // Update with your domain in production
            },
        });

        const integration = new HttpLambdaIntegration('ApiIntegration', apiLambda);

        // Add catch-all route
        api.addRoutes({
            path: '/{proxy+}',
            methods: [apigateway.HttpMethod.ANY],
            integration,
        });

        // Outputs
        new cdk.CfnOutput(this, 'ApiEndpoint', { 
            value: api.apiEndpoint,
            description: 'Backend API URL',
        });
        new cdk.CfnOutput(this, 'WebsiteURL', { 
            value: websiteBucket.bucketWebsiteUrl,
            description: 'Frontend URL (S3 website)',
        });
        new cdk.CfnOutput(this, 'StorageBucketName', { 
            value: storyBucket.bucketName,
            description: 'S3 bucket for story data',
        });
        new cdk.CfnOutput(this, 'WebsiteBucketName', { 
            value: websiteBucket.bucketName,
            description: 'S3 bucket for frontend (deploy dist/ here)',
        });
    }
}
