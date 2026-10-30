import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  canReadTicket,
  MAX_PHOTO_BYTES,
  slaDeadline,
  ticketInput,
  validatePhotoSize,
  type User,
} from "../src/lib/domain";
import { csvCell } from "../src/lib/reports";
import { validateImage } from "../src/lib/storage";

const valid = {
  categoryId: randomUUID(),
  locationId: randomUUID(),
  title: "Leaking classroom tap",
  description: "Water is leaking onto the classroom floor.",
  urgency: "MEDIUM",
  submissionKey: randomUUID(),
};
describe("Black-box input partitions and boundaries", () => {
  for (const [length, accepted] of [
    [14, false],
    [15, true],
    [16, true],
    [499, true],
    [500, true],
    [501, false],
  ] as const)
    it(`description length ${length} is ${accepted ? "accepted" : "rejected"}`, () => {
      expect(
        ticketInput.safeParse({ ...valid, description: "x".repeat(length) })
          .success,
      ).toBe(accepted);
    });
  for (const [length, accepted] of [
    [0, false],
    [1, true],
    [150, true],
    [151, false],
  ] as const)
    it(`title length ${length}`, () => {
      expect(
        ticketInput.safeParse({ ...valid, title: "x".repeat(length) }).success,
      ).toBe(accepted);
    });
  for (const [size, accepted] of [
    [0, false],
    [1, true],
    [4499999, true],
    [4500000, true],
    [4500001, false],
    [-1, false],
    [1.5, false],
  ] as const)
    it(`photo size ${size} bytes`, () => {
      if (accepted) expect(() => validatePhotoSize(size)).not.toThrow();
      else expect(() => validatePhotoSize(size)).toThrow();
    });
  it("rejects an unknown category ID and urgency", () => {
    expect(
      ticketInput.safeParse({
        ...valid,
        categoryId: "electrical",
        urgency: "EXTREME",
      }).success,
    ).toBe(false);
  });
  it("does not accept an empty or whitespace-only description", () => {
    expect(
      ticketInput.safeParse({ ...valid, description: " ".repeat(20) }).success,
    ).toBe(false);
  });
  it("rejects a one-byte file even though its size alone is allowed", async () => {
    await expect(validateImage(Buffer.from([1]), "image/png")).rejects.toThrow(
      "valid JPG or PNG",
    );
  });
  it("decodes and accepts a real PNG", async () => {
    const image = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#557b60" },
    })
      .png()
      .toBuffer();
    expect((await validateImage(image, "image/png")).contentType).toBe(
      "image/png",
    );
  });
  it("rejects a MIME type that does not match the file signature", async () => {
    const image = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#557b60" },
    })
      .png()
      .toBuffer();
    await expect(validateImage(image, "image/jpeg")).rejects.toThrow(
      "valid JPG or PNG",
    );
  });
  it("rejects a corrupt PNG with a copied signature", async () => {
    await expect(
      validateImage(
        Buffer.concat([
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
          Buffer.from("not image data"),
        ]),
        "image/png",
      ),
    ).rejects.toThrow("cannot be read");
  });
  it("accepts an exact 4,500,000-byte image input and removes trailing payloads", async () => {
    const png = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    const padded = Buffer.alloc(MAX_PHOTO_BYTES);
    png.copy(padded);
    const clean = await validateImage(padded, "image/png");
    expect(clean.bytes.length).toBeLessThan(1000);
  });
});
describe("Deadlines and data access", () => {
  for (const [priority, hours] of [
    ["P1_CRITICAL", 4],
    ["P2_URGENT", 24],
    ["P3_ROUTINE", 72],
  ] as const)
    it(`${priority} uses ${hours} hours from the original submission`, () => {
      const start = new Date("2026-10-30T10:00:00Z");
      expect(slaDeadline(start, priority).getTime() - start.getTime()).toBe(
        hours * 3600000,
      );
    });
  const user = { user_id: "reporter", role: "STUDENT" } as User;
  const ticket = { reporter_id: "reporter", assigned_tech_id: "tech" };
  it("allows the original reporter", () =>
    expect(canReadTicket(user, ticket, false)).toBe(true));
  it("allows a subscriber", () =>
    expect(canReadTicket({ ...user, user_id: "follower" }, ticket, true)).toBe(
      true,
    ));
  it("blocks an unrelated reporter", () =>
    expect(canReadTicket({ ...user, user_id: "stranger" }, ticket, false)).toBe(
      false,
    ));
  it("allows the assigned technician", () =>
    expect(
      canReadTicket(
        { ...user, user_id: "tech", role: "TECHNICIAN" },
        ticket,
        false,
      ),
    ).toBe(true));
  it("blocks a different technician even if subscribed", () =>
    expect(
      canReadTicket(
        { ...user, user_id: "wrong", role: "TECHNICIAN" },
        ticket,
        true,
      ),
    ).toBe(false));
  for (const role of ["FMD_ADMIN", "FMD_DISPATCHER"] as const)
    it(`allows ${role}`, () =>
      expect(
        canReadTicket({ ...user, user_id: "manager", role }, ticket, false),
      ).toBe(true));
});
describe("CSV export safety", () => {
  it("escapes commas and quotes", () =>
    expect(csvCell('A, "B"')).toBe('"A, ""B"""'));
  it("prevents spreadsheet formula execution", () =>
    expect(csvCell("=HYPERLINK(1)")).toBe('"\'=HYPERLINK(1)"'));
  it("handles missing values", () => expect(csvCell(null)).toBe('""'));
});
