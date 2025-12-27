import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
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

        // 2. Frontend S3 Bucket (for CloudFront)
        const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });

        // 3. Import existing SSL certificate
        const certificate = acm.Certificate.fromCertificateArn(
            this,
            'Certificate',
            'arn:aws:acm:us-east-1:968267201240:certificate/7f0d8a50-a537-47e1-ac1e-d07434dd666b'
        );

        // 4. CloudFront Distribution with custom domain
        const distribution = new cloudfront.Distribution(this, 'Distribution', {
            defaultBehavior: {
                origin: new origins.S3Origin(websiteBucket),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
            },
            domainNames: ['neyasbook.com', 'www.neyasbook.com'],
            certificate: certificate,
            defaultRootObject: 'index.html',
            errorResponses: [
                {
                    httpStatus: 404,
                    responseHttpStatus: 200,
                    responsePagePath: '/index.html', // SPA routing
                },
                {
                    httpStatus: 403,
                    responseHttpStatus: 200,
                    responsePagePath: '/index.html',
                },
            ],
            comment: 'Neyasbook with custom domain',
        });

        // 5. Backend Lambda Function
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
            timeout: cdk.Duration.minutes(5),
            memorySize: 512,
            environment: {
                STORY_BUCKET: storyBucket.bucketName,
                OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'SET_IN_CONSOLE',
            },
        });

        // Grant S3 permissions
        storyBucket.grantReadWrite(apiLambda);

        // 4. API Gateway HTTP API - Routes to Lambda
        const api = new apigateway.HttpApi(this, 'NeyasbookApi', {
            corsPreflight: {
                allowHeaders: [
                    'Authorization',
                    'Content-Type',
                    'X-Requested-With',
                    'x-project-id',
                ],
                allowMethods: [
                    apigateway.CorsHttpMethod.GET,
                    apigateway.CorsHttpMethod.POST,
                    apigateway.CorsHttpMethod.PUT,
                    apigateway.CorsHttpMethod.DELETE,
                    apigateway.CorsHttpMethod.OPTIONS,
                ],
                allowOrigins: [
                    'https://neyasbook.com',
                    'https://www.neyasbook.com',
                    'https://d3bb1209mgsq4w.cloudfront.net',
                    'http://localhost:5173',
                    'http://localhost:3000',
                ],
                maxAge: cdk.Duration.days(1),
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
        new cdk.CfnOutput(this, 'CloudFrontURL', {
            value: `https://${distribution.distributionDomainName}`,
            description: 'CloudFront URL (use this until custom domain is set up)',
        });
        new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
            value: distribution.distributionId,
            description: 'CloudFront Distribution ID (for cache invalidation)',
        });
        new cdk.CfnOutput(this, 'CloudFrontDomainName', {
            value: distribution.distributionDomainName,
            description: 'CloudFront domain (for DNS CNAME record)',
        });
        new cdk.CfnOutput(this, 'ApiEndpoint', { 
            value: api.apiEndpoint,
            description: 'Backend API URL',
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
