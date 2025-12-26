# 🚀 Deployment Guide

## Quick Deploy

```bash
./deploy.sh
```

That's it! The script will deploy both backend and frontend automatically.

---

## What Gets Deployed

### Backend (AWS Lambda + API Gateway)
- **Lambda Function**: Runs your Express.js API
- **API Gateway**: HTTP endpoint for the Lambda
- **S3 Bucket**: Stores chapters, chat history, entities

### Frontend (S3 Static Website)
- **S3 Bucket**: Hosts your React app
- **HTTP Endpoint**: Direct S3 website URL

---

## First Time Setup

### 1. Install AWS CLI
```bash
# Ubuntu/WSL
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

### 2. Configure AWS Credentials
```bash
aws configure
```
You'll need:
- AWS Access Key ID
- AWS Secret Access Key  
- Region: `us-east-1`

### 3. Bootstrap CDK (First Time Only)
```bash
cd backend
npx cdk bootstrap
cd ..
```

### 4. Set OpenAI API Key
Create `backend/.env`:
```
OPENAI_API_KEY=sk-proj-your-key-here
```

### 5. Deploy
```bash
./deploy.sh
```

---

## Manual Deployment

If you prefer to deploy step-by-step:

### Backend Only
```bash
cd backend
export OPENAI_API_KEY="sk-..."
npx cdk deploy --require-approval never
```

### Frontend Only
```bash
# Update API URL in .env.production
echo "VITE_API_URL=https://your-api-url" > .env.production

# Build
npm run build

# Upload to S3
aws s3 sync dist/ s3://your-bucket-name --delete
```

---

## Updating Your App

### After Code Changes
```bash
./deploy.sh
```

### Update OpenAI Key Only
```bash
aws lambda update-function-configuration \
  --function-name $(aws lambda list-functions --query "Functions[?contains(FunctionName, 'NeyasbookStack-ApiHandler')].FunctionName" --output text) \
  --environment Variables={OPENAI_API_KEY=sk-new-key,STORY_BUCKET=your-bucket-name}
```

---

## Useful Commands

### View Logs
```bash
aws logs tail /aws/lambda/NeyasbookStack-ApiHandler* --follow
```

### Check Deployment Status
```bash
cd backend
npx cdk diff
```

### Destroy Everything
```bash
cd backend
npx cdk destroy
```
⚠️ **Warning**: This deletes all infrastructure but NOT the story data bucket (it's retained for safety)

---

## Costs

**Estimated Monthly Cost**: ~$0.10-0.50

- **Lambda**: FREE (1M requests/month free tier)
- **API Gateway**: FREE (1M calls/month free tier)
- **S3 Storage**: ~$0.05/month
- **S3 Transfer**: ~$0.05/month
- **OpenAI API**: Pay-per-use (separate)

**After 12 months**, you'll pay:
- Lambda: $0.20 per 1M requests
- S3: $0.023 per GB/month

For personal use, expect < $1/month after free tier expires.

---

## Troubleshooting

### Lambda Cold Starts
First request after idle (~5 min) takes ~10 seconds. Subsequent requests are fast.

### CORS Errors
Check that API URL in `.env.production` matches your deployed API Gateway URL.

### 500 Errors
View Lambda logs:
```bash
aws logs tail /aws/lambda/NeyasbookStack-ApiHandler* --since 10m
```

### Deployment Fails
1. Clear build cache: `cd backend && rm -rf cdk.out`
2. Try again: `./deploy.sh`

---

## Architecture

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       ├─────────► S3 Static Website (React App)
       │           http://bucket.s3-website-us-east-1.amazonaws.com
       │
       └─────────► API Gateway
                   https://xxxxx.execute-api.us-east-1.amazonaws.com
                   │
                   ▼
                   Lambda Function (Express + OpenAI)
                   │
                   ▼
                   S3 Bucket (Story Data)
```

---

## Development vs Production

### Local Development
```bash
npm run dev
```
- Uses filesystem storage (`backend/storage/`)
- Runs on localhost
- No AWS charges

### Production (AWS)
```bash
./deploy.sh
```
- S3 storage for persistence
- Lambda runs only when used ($0 when idle)
- Globally accessible

---

## Your Deployment Info

After deploying, you'll get:

- **Website**: http://neyasbookstack-websitebucket...s3-website-us-east-1.amazonaws.com
- **API**: https://xxxxx.execute-api.us-east-1.amazonaws.com
- **Storage Bucket**: neyasbookstack-storybucket...
- **Website Bucket**: neyasbookstack-websitebucket...

Save these URLs! They won't change unless you destroy and recreate the stack.
