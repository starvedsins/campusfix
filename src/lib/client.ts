import { upload } from "@vercel/blob/client";
import { MAX_PHOTO_BYTES } from "./domain";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public fields: Record<string, string> = {},
  ) {
    super(message);
  }
}
export async function api<T = Record<string, unknown>>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
    cache: "no-store",
  });
  const data = await response
    .json()
    .catch(() => ({ error: "The server response could not be read." }));
  if (!response.ok)
    throw new ApiError(
      data.error ?? "The request could not be completed.",
      response.status,
      data.fields,
    );
  return data;
}
export async function uploadPhoto(
  file: File,
  phase: "BEFORE" | "AFTER",
  driver: string,
): Promise<string> {
  if (file.size < 1 || file.size > MAX_PHOTO_BYTES)
    throw new Error("Choose a photo from 1 byte to 4.5 MB.");
  if (!["image/jpeg", "image/png"].includes(file.type))
    throw new Error("Choose a JPG or PNG photo.");
  if (driver !== "vercel") {
    const form = new FormData();
    form.set("file", file);
    form.set("phase", phase);
    return (
      await api<{ attachment_id: string }>("/api/uploads", {
        method: "POST",
        body: form,
      })
    ).attachment_id;
  }
  const item = await api<{ attachment_id: string; pathname: string }>(
    "/api/uploads/prepare",
    {
      method: "POST",
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        contentType: file.type,
        phase,
      }),
    },
  );
  await upload(item.pathname, file, {
    access: "private",
    handleUploadUrl: "/api/uploads/blob",
  });
  await api("/api/uploads/confirm", {
    method: "POST",
    body: JSON.stringify({ attachmentId: item.attachment_id }),
  });
  return item.attachment_id;
}
