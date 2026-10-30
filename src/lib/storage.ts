import { one, rows } from "@/db";
import { del, get, head, put } from "@vercel/blob";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { MAX_PHOTO_BYTES, validatePhotoSize, type User } from "./domain";
import { AppError, assert } from "./errors";

export const isCloudStorage = () => process.env.STORAGE_DRIVER === "vercel";
const storageDir = () =>
  path.resolve(
    /* turbopackIgnore: true */ process.env.LOCAL_STORAGE_DIR ??
      ".data/uploads",
  );
function localPath(key: string) {
  const resolved = path.resolve(storageDir(), key);
  assert(resolved.startsWith(storageDir() + path.sep), "Invalid storage path.");
  return resolved;
}
export async function validateImage(bytes: Buffer, declaredType: string) {
  validatePhotoSize(bytes.length);
  const png = bytes
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg =
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255;
  const type = png ? "image/png" : jpeg ? "image/jpeg" : null;
  assert(type && type === declaredType, "Choose a valid JPG or PNG photo.");
  try {
    const image = sharp(bytes, {
      limitInputPixels: 25_000_000,
      failOn: "error",
    }).rotate();
    const metadata = await image.metadata();
    assert(
      metadata.width &&
        metadata.height &&
        metadata.width > 0 &&
        metadata.height > 0,
      "This photo cannot be read.",
    );
    // Decode and re-encode. This also removes EXIF location data and trailing payloads.
    const clean = await (
      type === "image/png" ? image.png() : image.jpeg({ quality: 90 })
    ).toBuffer();
    validatePhotoSize(clean.length);
    return { bytes: clean, contentType: type };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "This photo cannot be read. Choose another JPG or PNG photo.",
    );
  }
}
export async function saveLocalPhoto(
  user: User,
  file: File,
  phase: "BEFORE" | "AFTER",
) {
  assert(
    !isCloudStorage(),
    "Use direct photo uploads for the hosted application.",
  );
  validatePhotoSize(file.size);
  const clean = await validateImage(
    Buffer.from(await file.arrayBuffer()),
    file.type,
  );
  const key = `${user.user_id}/${randomUUID()}.${clean.contentType === "image/png" ? "png" : "jpg"}`;
  await mkdir(path.dirname(localPath(key)), { recursive: true });
  await writeFile(localPath(key), clean.bytes, { flag: "wx" });
  try {
    const row = await one(
      sql`INSERT INTO attachments(owner_id,phase,storage_key,original_name,content_type,byte_size,verified) VALUES (${user.user_id}::uuid,${phase},${key},${file.name.slice(0, 200)},${clean.contentType},${clean.bytes.length},TRUE) RETURNING attachment_id`,
    );
    return row;
  } catch (error) {
    await unlink(localPath(key)).catch(() => {});
    throw error;
  }
}
export async function prepareCloudPhoto(
  user: User,
  input: {
    name: string;
    size: number;
    contentType: string;
    phase: "BEFORE" | "AFTER";
  },
) {
  assert(isCloudStorage(), "Cloud storage is not enabled.");
  validatePhotoSize(input.size);
  assert(
    ["image/jpeg", "image/png"].includes(input.contentType),
    "Choose a JPG or PNG photo.",
  );
  const key = `${user.user_id}/${randomUUID()}.${input.contentType === "image/png" ? "png" : "jpg"}`;
  const row = await one(
    sql`INSERT INTO attachments(owner_id,phase,storage_key,original_name,content_type,byte_size) VALUES (${user.user_id}::uuid,${input.phase},${key},${input.name.slice(0, 200)},${input.contentType},${input.size}) RETURNING attachment_id`,
  );
  return { ...row, pathname: key };
}
export async function confirmCloudPhoto(user: User, id: string) {
  const photo = await one<{
    attachment_id: string;
    storage_key: string;
    verified: boolean;
    content_type: string;
  }>(
    sql`SELECT attachment_id,storage_key,verified,content_type FROM attachments WHERE attachment_id=${id}::uuid AND owner_id=${user.user_id}::uuid`,
  );
  assert(photo, "This upload was not found.", 404);
  if (photo.verified) return { attachment_id: photo.attachment_id };
  const metadata = await head(photo.storage_key);
  validatePhotoSize(metadata.size);
  const object = await get(photo.storage_key, {
    access: "private",
    useCache: false,
  });
  assert(
    object && object.statusCode === 200,
    "This upload has not finished.",
    409,
  );
  try {
    const clean = await validateImage(
      Buffer.from(await new Response(object.stream).arrayBuffer()),
      photo.content_type,
    );
    await put(photo.storage_key, clean.bytes, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: clean.contentType,
    });
    await rows(
      sql`UPDATE attachments SET verified=TRUE,byte_size=${clean.bytes.length},content_type=${clean.contentType} WHERE attachment_id=${id}::uuid AND ticket_id IS NULL`,
    );
    return { attachment_id: photo.attachment_id };
  } catch (error) {
    await del(photo.storage_key).catch(() => {});
    await rows(
      sql`DELETE FROM attachments WHERE attachment_id=${id}::uuid AND ticket_id IS NULL`,
    );
    throw error;
  }
}
export async function photoBytes(key: string) {
  if (!isCloudStorage())
    return readFile(/* turbopackIgnore: true */ localPath(key));
  const object = await get(key, { access: "private", useCache: false });
  assert(object && object.statusCode === 200, "This photo was not found.", 404);
  return Buffer.from(await new Response(object.stream).arrayBuffer());
}
export async function cleanOrphanPhotos() {
  const old = await rows<{ attachment_id: string; storage_key: string }>(
    sql`SELECT attachment_id,storage_key FROM attachments WHERE ticket_id IS NULL AND created_at<NOW()-INTERVAL '24 hours' LIMIT 100`,
  );
  for (const item of old) {
    if (isCloudStorage()) await del(item.storage_key);
    else
      await unlink(localPath(item.storage_key)).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    await rows(
      sql`DELETE FROM attachments WHERE attachment_id=${item.attachment_id}::uuid AND ticket_id IS NULL`,
    );
  }
  return old.length;
}
export { MAX_PHOTO_BYTES };
