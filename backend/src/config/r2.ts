import crypto from "crypto";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 Storage (S3-compatible)
 * Stores private employee documents (PAN / Aadhaar images)
 */

export const EMPLOYEE_DOCUMENT_PREFIX = "employee-documents/";

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

let client: S3Client | null = null;

function getBucketName() {
  return process.env.R2_BUCKET_NAME || "printdeldoc";
}

function getClient() {
  if (client) return client;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.");
  }

  client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return client;
}

/**
 * Uploads a base64 image data URL and returns the object key
 */
export async function uploadEmployeeDocument(documentType: "pan-card" | "aadhaar-card", dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image. Upload a JPG, PNG or WEBP file.");
  }

  const contentType = match[1].toLowerCase();
  const extension = ALLOWED_IMAGE_TYPES[contentType];
  if (!extension) {
    throw new Error("Only JPG, PNG or WEBP images are allowed.");
  }

  const body = Buffer.from(match[2], "base64");
  if (body.length === 0) {
    throw new Error("Image is empty.");
  }
  if (body.length > MAX_DOCUMENT_BYTES) {
    throw new Error("Image must be 5 MB or smaller.");
  }

  const key = `${EMPLOYEE_DOCUMENT_PREFIX}${documentType}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  return key;
}

/**
 * Returns a short-lived URL to view a private document
 */
export async function getEmployeeDocumentUrl(key: string, expiresInSeconds = 900) {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: getBucketName(), Key: key }),
    { expiresIn: expiresInSeconds }
  );
}
