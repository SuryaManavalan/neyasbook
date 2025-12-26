const { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { Readable } = require('stream');

// Lambda automatically sets AWS_REGION, use it or default to us-east-1
const s3Client = new S3Client({});
const BUCKET_NAME = process.env.STORY_BUCKET;

// Helper to convert stream to string
async function streamToString(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });
}

class S3Storage {
    async readFile(key) {
        try {
            const command = new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: key
            });
            const response = await s3Client.send(command);
            const content = await streamToString(response.Body);
            return content;
        } catch (error) {
            if (error.name === 'NoSuchKey') {
                throw new Error('ENOENT');
            }
            throw error;
        }
    }

    async writeFile(key, data) {
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
            ContentType: 'application/json'
        });
        await s3Client.send(command);
    }

    async exists(key) {
        try {
            await this.readFile(key);
            return true;
        } catch (error) {
            return false;
        }
    }

    async listKeys(prefix) {
        const command = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: prefix
        });
        const response = await s3Client.send(command);
        return (response.Contents || []).map(item => item.Key);
    }

    async deleteFile(key) {
        // Implement if needed
    }
}

module.exports = new S3Storage();
