import { openDB } from "idb";
import { api, uploadPhoto } from "./client";
import type { TicketInput, User } from "./domain";
export type Draft = {
  userId: string;
  data: Partial<TicketInput> & { faculty?: string; building?: string };
  photo?: File;
  savedAt: number;
};
type Queued = {
  key: string;
  userId: string;
  data: TicketInput;
  photo?: File;
  driver: string;
  queuedAt: number;
};
const open = () =>
  openDB("campusfix-reports", 1, {
    upgrade(db) {
      db.createObjectStore("drafts");
      db.createObjectStore("submissions", { keyPath: "key" });
    },
  });
export async function saveDraft(draft: Draft) {
  const db = await open();
  await db.put("drafts", draft, draft.userId);
}
export async function readDraft(userId: string): Promise<Draft | undefined> {
  return (await open()).get("drafts", userId);
}
export async function removeDraft(userId: string) {
  await (await open()).delete("drafts", userId);
}
export async function queueReport(item: Omit<Queued, "key" | "queuedAt">) {
  await (
    await open()
  ).put("submissions", {
    ...item,
    key: item.data.submissionKey,
    queuedAt: Date.now(),
  });
  await removeDraft(item.userId);
}
export async function queuedCount(userId: string) {
  return ((await (await open()).getAll("submissions")) as Queued[]).filter(
    (q) => q.userId === userId,
  ).length;
}
let processing = false;
export async function flushReports(
  userId: string,
  onSent?: (id: string) => void,
) {
  if (processing || !navigator.onLine) return;
  processing = true;
  try {
    const { user } = await api<{ user: User }>("/api/session");
    if (user.user_id !== userId) return;
    const db = await open();
    const items = ((await db.getAll("submissions")) as Queued[]).filter(
      (q) => q.userId === userId,
    );
    for (const item of items) {
      if (item.photo && !item.data.attachmentId) {
        item.data.attachmentId = await uploadPhoto(
          item.photo,
          "BEFORE",
          item.driver,
        );
        await db.put("submissions", item);
      }
      const result = await api<{ ticketId: string }>("/api/tickets", {
        method: "POST",
        body: JSON.stringify(item.data),
      });
      await db.delete("submissions", item.key);
      onSent?.(result.ticketId);
    }
  } finally {
    processing = false;
  }
}
