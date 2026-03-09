import {
  S3Client,
  PutObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";

const BUCKET = process.env.S3_BUCKET ?? "parking-spot-images";
const ENDPOINT = process.env.S3_ENDPOINT ?? "http://localhost:4566";

const s3 = new S3Client({
  endpoint: ENDPOINT,
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "test",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "test",
  },
  forcePathStyle: true,
});

let bucketReady = false;

async function ensureBucket() {
  if (bucketReady) return;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  }
  bucketReady = true;
}

export async function uploadImage(
  key: string,
  body: Buffer,
  contentType = "image/jpeg",
): Promise<string> {
  await ensureBucket();
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return `${ENDPOINT}/${BUCKET}/${key}`;
}
