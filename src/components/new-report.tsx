"use client";
import { api, ApiError, uploadPhoto } from "@/lib/client";
import {
  facultyLabel,
  label,
  MAX_PHOTO_BYTES,
  ticketInput,
  type TicketInput,
  type User,
} from "@/lib/domain";
import { queueReport, readDraft, removeDraft, saveDraft } from "@/lib/offline";
import {
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  Info,
  MapPin,
  Save,
  ShieldCheck,
  WifiOff,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ReferenceData } from "./types";
import { Button } from "./ui/button";
import { Busy, Field, Notice, PageTitle } from "./ui/common";

type FormData = {
  categoryId: string;
  locationId: string;
  title: string;
  description: string;
  urgency: "LOW" | "MEDIUM" | "HIGH";
  faculty: string;
  building: string;
};
const blank: FormData = {
  categoryId: "",
  locationId: "",
  title: "",
  description: "",
  urgency: "LOW",
  faculty: "",
  building: "",
};
export function NewReport({
  user,
  reference,
  onQueued,
}: {
  user: User;
  reference: ReferenceData;
  onQueued: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<FormData>(blank);
  const [photo, setPhoto] = useState<File>();
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [queued, setQueued] = useState(false);
  const [duplicates, setDuplicates] = useState<
    { ticket_id: string; title: string; status: string }[]
  >([]);
  const [separate, setSeparate] = useState(false);
  const submissionKey = useRef("");
  useEffect(() => {
    submissionKey.current = crypto.randomUUID();
    readDraft(user.user_id)
      .then((draft) => {
        if (draft) {
          setData({ ...blank, ...draft.data } as FormData);
          setPhoto(draft.photo);
          if (draft.photo) setPreview(URL.createObjectURL(draft.photo));
          if (draft.data.submissionKey)
            submissionKey.current = draft.data.submissionKey;
          setMessage("Your saved draft is ready to finish.");
        }
      })
      .catch(() => {});
  }, [user.user_id]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(() => {
    let active = true;
    if (data.categoryId && data.locationId) {
      api<typeof duplicates>(
        `/api/tickets/duplicates?categoryId=${data.categoryId}&locationId=${data.locationId}`,
      )
        .then((items) => {
          if (active) {
            setDuplicates(items);
            setSeparate(false);
          }
        })
        .catch(() => {
          if (active) setDuplicates([]);
        });
    }
    return () => {
      active = false;
    };
  }, [data.categoryId, data.locationId]);
  function change<K extends keyof FormData>(key: K, value: FormData[K]) {
    if (["categoryId", "locationId", "faculty", "building"].includes(key)) {
      setDuplicates([]);
      setSeparate(false);
    }
    setData((previous) => ({
      ...previous,
      [key]: value,
      ...(key === "faculty"
        ? { building: "", locationId: "" }
        : key === "building"
          ? { locationId: "" }
          : {}),
    }));
    setFields((previous) => ({ ...previous, [key]: "" }));
  }
  async function draft() {
    try {
      await saveDraft({
        userId: user.user_id,
        data: { ...data, submissionKey: submissionKey.current },
        photo,
        savedAt: Date.now(),
      });
      setMessage("Draft saved on this device.");
      setError("");
    } catch {
      setError("The draft could not be saved on this device.");
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    const parsed = ticketInput.safeParse({
      ...data,
      submissionKey: submissionKey.current,
    });
    if (!parsed.success) {
      setFields(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            issue.path.join("."),
            issue.message,
          ]),
        ),
      );
      setError("Check the marked fields and try again.");
      return;
    }
    if (duplicates.length && !separate) {
      setError(
        "Choose an existing report or confirm that this is a separate issue.",
      );
      return;
    }
    setBusy(true);
    try {
      if (!navigator.onLine) {
        await queueReport({
          userId: user.user_id,
          data: parsed.data,
          photo,
          driver: reference.storageDriver,
        });
        setQueued(true);
        onQueued();
        return;
      }
      const payload: TicketInput = { ...parsed.data };
      if (photo)
        payload.attachmentId = await uploadPhoto(
          photo,
          "BEFORE",
          reference.storageDriver,
        );
      const result = await api<{ ticketId: string }>("/api/tickets", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await removeDraft(user.user_id);
      router.push(`/app/tickets/${result.ticketId}?created=1`);
    } catch (error) {
      if (error instanceof ApiError) {
        setError(error.message);
        setFields(error.fields);
      } else if (!navigator.onLine || error instanceof TypeError) {
        await queueReport({
          userId: user.user_id,
          data: parsed.data,
          photo,
          driver: reference.storageDriver,
        });
        setQueued(true);
        onQueued();
      } else
        setError(
          error instanceof Error
            ? error.message
            : "The report could not be sent.",
        );
    } finally {
      setBusy(false);
    }
  }
  const locations = reference.locations.filter((item) => item.is_active);
  const buildings = [
    ...new Set(
      locations
        .filter((item) => item.faculty_code === data.faculty)
        .map((item) => item.building_name),
    ),
  ];
  const rooms = locations.filter(
    (item) =>
      item.faculty_code === data.faculty &&
      item.building_name === data.building,
  );
  if (queued)
    return (
      <>
        <PageTitle
          title="Your report is saved"
          description="We will send it when your connection returns."
        />
        <div className="panel submission-success">
          <WifiOff size={36} aria-hidden="true" />
          <h2>Ready when you are connected.</h2>
          <p>
            Your report is in the queue on this device. Reopen CampusFix with
            the same account when you are online. A ticket number will appear
            after the report is sent.
          </p>
          <Button asChild>
            <Link href="/app">
              Return to overview
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </>
    );
  return (
    <>
      <Link className="back-link" href="/app/tickets">
        <ArrowLeft size={15} aria-hidden="true" />
        Back to my reports
      </Link>
      <PageTitle
        eyebrow="LET US TAKE CARE OF IT"
        title="Report an issue"
        description="Tell us what needs attention. We will take it from here."
      />
      <div className="report-layout">
        <form className="panel report-form" onSubmit={submit} noValidate>
          {error && <Notice>{error}</Notice>}
          {message && <Notice tone="success">{message}</Notice>}
          <fieldset>
            <legend>
              <span className="step-number">01</span>
              <span>
                What needs attention?
                <small>A clear report helps us send the right person.</small>
              </span>
            </legend>
            <Field
              label="Issue category"
              htmlFor="categoryId"
              error={fields.categoryId}
            >
              <select
                id="categoryId"
                value={data.categoryId}
                onChange={(e) => change("categoryId", e.target.value)}
                aria-invalid={!!fields.categoryId}
                aria-describedby={
                  fields.categoryId ? "categoryId-hint" : undefined
                }
                required
              >
                <option value="">Select an issue category</option>
                {reference.categories
                  .filter((c) => c.is_active)
                  .map((category) => (
                    <option
                      key={category.category_id}
                      value={category.category_id}
                    >
                      {category.category_name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field
              label="Report title"
              htmlFor="title"
              error={fields.title}
              hint="Keep it short and specific."
            >
              <input
                id="title"
                placeholder="e.g. Flickering lights in Computer Lab 3"
                maxLength={150}
                value={data.title}
                onChange={(e) => change("title", e.target.value)}
                aria-invalid={!!fields.title}
                aria-describedby="title-hint"
                required
              />
            </Field>
            <Field
              label="What is happening?"
              htmlFor="description"
              error={fields.description}
            >
              <textarea
                id="description"
                rows={4}
                placeholder="Describe the issue and where we can find it. Let us know if it affects access or safety."
                maxLength={500}
                minLength={15}
                value={data.description}
                onChange={(e) => change("description", e.target.value)}
                aria-invalid={!!fields.description}
                aria-describedby={
                  fields.description
                    ? "description-count description-hint"
                    : "description-count"
                }
                required
              />
              <span className="character-count" id="description-count">
                {data.description.length}/500 characters <span>Minimum 15</span>
              </span>
            </Field>
          </fieldset>
          <fieldset>
            <legend>
              <span className="step-number">02</span>
              <span>
                Where is the issue?
                <small>The exact location helps us get there sooner.</small>
              </span>
            </legend>
            <div className="form-grid">
              <Field label="Faculty or area" htmlFor="faculty">
                <select
                  id="faculty"
                  value={data.faculty}
                  onChange={(e) => change("faculty", e.target.value)}
                  required
                >
                  <option value="">Select a faculty or area</option>
                  {Object.entries(facultyLabel)
                    .filter(([key]) =>
                      locations.some((l) => l.faculty_code === key),
                    )
                    .map(([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Building" htmlFor="building">
                <select
                  id="building"
                  disabled={!data.faculty}
                  value={data.building}
                  onChange={(e) => change("building", e.target.value)}
                  required
                >
                  <option value="">Select a building</option>
                  {buildings.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field
              label="Room or specific area"
              htmlFor="locationId"
              error={fields.locationId}
            >
              <select
                id="locationId"
                value={data.locationId}
                disabled={!data.building}
                onChange={(e) => change("locationId", e.target.value)}
                aria-invalid={!!fields.locationId}
                aria-describedby={
                  fields.locationId ? "locationId-hint" : undefined
                }
                required
              >
                <option value="">Select a room or area</option>
                {rooms.map((item) => (
                  <option key={item.location_id} value={item.location_id}>
                    {item.room_number}
                  </option>
                ))}
              </select>
            </Field>
            {duplicates.length > 0 && (
              <div className="duplicate-suggestions">
                <div>
                  <Info size={18} aria-hidden="true" />
                  <strong>Someone may have reported this.</strong>
                </div>
                <p>
                  Follow an existing report to get updates, or report a separate
                  fault.
                </p>
                {duplicates.map((item) => (
                  <div className="duplicate-item" key={item.ticket_id}>
                    <span>
                      <strong>{item.title}</strong>
                      <small>
                        {item.ticket_id} · {label(item.status)}
                      </small>
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          await api(`/api/tickets/${item.ticket_id}/actions`, {
                            method: "POST",
                            body: JSON.stringify({ action: "follow" }),
                          });
                          await removeDraft(user.user_id);
                          router.push(`/app/tickets/${item.ticket_id}`);
                        } catch (error) {
                          setError(
                            error instanceof Error
                              ? error.message
                              : "Could not follow the report.",
                          );
                        }
                      }}
                    >
                      Follow report
                    </Button>
                  </div>
                ))}
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={separate}
                    onChange={(e) => setSeparate(e.target.checked)}
                  />
                  This is a separate issue.
                </label>
              </div>
            )}
          </fieldset>
          <fieldset>
            <legend>
              <span className="step-number">03</span>
              <span>
                A little more detail<small>Help us understand the issue.</small>
              </span>
            </legend>
            <Field
              label="Add a photo (optional)"
              htmlFor="photo"
              hint="JPG or PNG. Maximum 4.5 MB (4,500,000 bytes)."
            >
              <div className="photo-dropzone">
                {photo && preview ? (
                  <div className="photo-preview">
                    <Image
                      unoptimized
                      width={65}
                      height={65}
                      src={preview}
                      alt="Selected issue photo"
                    />
                    <span>
                      {photo.name}
                      <small>{(photo.size / 1_000_000).toFixed(2)} MB</small>
                    </span>
                    <button
                      type="button"
                      aria-label="Remove photo"
                      onClick={() => {
                        setPhoto(undefined);
                        setPreview("");
                      }}
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  <label className="photo-picker" htmlFor="photo">
                    <span>
                      <ImagePlus size={25} aria-hidden="true" />
                    </span>
                    <strong>Choose a photo or use your camera</strong>
                    <p>A clear photo helps us see what needs care.</p>
                  </label>
                )}
                <input
                  id="photo"
                  type="file"
                  accept="image/jpeg,image/png"
                  aria-describedby="photo-hint"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (
                      file.size < 1 ||
                      file.size > MAX_PHOTO_BYTES ||
                      !["image/jpeg", "image/png"].includes(file.type)
                    ) {
                      setError("Choose a JPG or PNG photo up to 4.5 MB.");
                      e.target.value = "";
                      return;
                    }
                    setPhoto(file);
                    setPreview(URL.createObjectURL(file));
                    setError("");
                  }}
                />
              </div>
            </Field>
            <fieldset className="urgency-field">
              <legend>How urgent is it?</legend>
              <div className="urgency-options">
                {[
                  { value: "LOW", title: "Routine", text: "Needs a repair" },
                  {
                    value: "MEDIUM",
                    title: "Disruptive",
                    text: "Affects daily use",
                  },
                  {
                    value: "HIGH",
                    title: "Safety concern",
                    text: "May cause harm",
                  },
                ].map((item) => (
                  <label
                    key={item.value}
                    className={data.urgency === item.value ? "selected" : ""}
                  >
                    <input
                      type="radio"
                      name="urgency"
                      value={item.value}
                      checked={data.urgency === item.value}
                      onChange={() =>
                        change("urgency", item.value as FormData["urgency"])
                      }
                    />
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.text}</small>
                    </span>
                  </label>
                ))}
              </div>
              <p className="field-hint">
                Facilities staff will check the report and set the final
                priority.
              </p>
            </fieldset>
          </fieldset>
          <div className="form-footer">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={draft}
            >
              <Save size={16} aria-hidden="true" />
              Save draft
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Busy /> : null}
              {busy ? "Sending report..." : "Submit report"}
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </form>
        <aside className="report-aside">
          <div className="report-tip">
            <span className="tip-icon">
              <ShieldCheck size={24} aria-hidden="true" />
            </span>
            <h2>
              You report it.
              <br />
              We take it from here.
            </h2>
            <p>
              Your report goes straight to the facilities team. You can follow
              each step from your workspace.
            </p>
            <ol>
              <li>
                <span>1</span>
                <div>
                  <strong>We review your report</strong>
                  <p>The team checks the details and priority.</p>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>A technician takes care of it</strong>
                  <p>The right person is assigned to the repair.</p>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>You get the update</strong>
                  <p>Check the repair and confirm it is complete.</p>
                </div>
              </li>
            </ol>
          </div>
          <div className="location-tip">
            <MapPin size={20} aria-hidden="true" />
            <h3>A good location saves time.</h3>
            <p>
              Select the exact room or area. Include nearby landmarks in your
              description if needed.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
