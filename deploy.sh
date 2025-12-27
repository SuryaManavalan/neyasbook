#!/bin/bash
# Neyasbook Deployment Script
# Deploys both backend and frontend to AWS

set -e

echo "🚀 Deploying Neyasbook to AWS"
echo ""

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Run 'aws configure' first."
    exit 1
fi

# Set OpenAI key from .env if exists
if [ -f "backend/.env" ]; then
    export $(cat backend/.env | xargs)
fi

# Bootstrap CDK (first time only)
if ! aws cloudformation describe-stacks --stack-name CDKToolkit &> /dev/null; then
    echo "🔧 Bootstrapping AWS CDK (one-time setup)..."
    npm run setup:aws
fi

# Deploy backend
echo "☁️  Deploying backend infrastructure..."
npm run deploy:backend

# Deploy backend
echo "📦 Deploying backend..."
cd backend
npx cdk deploy --require-approval never

# Get API endpoint
API_ENDPOINT=$(aws cloudformation describe-stacks \
    --stack-name NeyasbookStack \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
    --output text)

echo ""
echo "✅ Backend deployed: $API_ENDPOINT"

# Update frontend config
cd ..
echo "VITE_API_URL=$API_ENDPOINT" > .env.production

# Build and deploy frontend
echo "📦 Building frontend..."
npm run build

BUCKET=$(aws cloudformation describe-stacks \
    --stack-name NeyasbookStack \
    --query 'Stacks[0].Outputs[?OutputKey==`WebsiteBucketName`].OutputValue' \
    --output text)

echo "📤 Uploading to S3..."
aws s3 sync dist/ s3://$BUCKET --delete

CLOUDFRONT_ID=$(aws cloudformation describe-stacks \
    --stack-name NeyasbookStack \
    --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
    --output text)

echo "🔄 Invalidating CloudFront cache..."
aws cloudfront create-invalidation --distribution-id $CLOUDFRONT_ID --paths "/*" > /dev/null 2>&1 || echo "⚠️  Cache invalidation skipped"

CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
    --stack-name NeyasbookStack \
    --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontURL`].OutputValue' \
    --output text)

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "🌐 Your app: https://neyasbook.com (after DNS setup)"
echo "🔗 CloudFront: $CLOUDFRONT_URL"
echo "🔗 API: $API_ENDPOINT"
echo ""
echo "💡 First request may be slow (Lambda cold start)"

