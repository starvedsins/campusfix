"use client";
import { api, uploadPhoto } from "@/lib/client";
import {
  formatDate,
  isManager,
  label,
  SLA_HOURS,
  type TicketDetail,
  type User,
} from "@/lib/domain";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  MapPin,
  MessageSquare,
  Send,
  ShieldCheck,
  UserRound,
  Wrench,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useResource } from "./resource";
import type { ReferenceData } from "./types";
import { Button } from "./ui/button";
import { Badge, Busy, Field, Loading, Notice, PageTitle } from "./ui/common";
import { useClock } from "./use-clock";

export function TicketPage({
  user,
  ticketId,
  reference,
  onChange,
}: {
  user: User;
  ticketId: string;
  reference: ReferenceData;
  onChange: () => void;
}) {
  const now = useClock();
  const resource = useResource<TicketDetail>(
    `/api/tickets/${ticketId}`,
    20_000,
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [priority, setPriority] = useState("");
  const [technician, setTechnician] = useState("auto");
  const [notes, setNotes] = useState("");
  const [parts, setParts] = useState("");
  const [labor, setLabor] = useState("0");
  const [photo, setPhoto] = useState<File>();
  const [reason, setReason] = useState("");
  const [master, setMaster] = useState("");
  const search = useSearchParams();
  async function action(input: Record<string, unknown>) {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      await api(`/api/tickets/${ticketId}/actions`, {
        method: "POST",
        body: JSON.stringify({
          ...input,
          version: resource.data?.ticket.version,
        }),
      });
      setMessage(
        input.action === "comment"
          ? "Your comment was added."
          : "The report was updated.",
      );
      setComment("");
      resource.refresh();
      onChange();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The report could not be updated.",
      );
      resource.refresh();
    } finally {
      setBusy(false);
    }
  }
  if (resource.error)
    return (
      <>
        <Link href="/app/tickets" className="back-link">
          <ArrowLeft size={16} />
          Back to reports
        </Link>
        <Notice>{resource.error}</Notice>
      </>
    );
  if (!resource.data) return <Loading />;
  const { ticket, activity, attachments, logs, comments } = resource.data;
  const manager = isManager(user.role);
  const assigned =
    user.role === "TECHNICIAN" && ticket.assigned_tech_id === user.user_id;
  const owner = ticket.reporter_id === user.user_id;
  const active = ["PENDING", "ASSIGNED", "IN_PROGRESS"].includes(ticket.status);
  const category = reference.categories.find(
    (c) => c.category_id === ticket.category_id,
  );
  const techs = reference.technicians.filter(
    (t) =>
      t.trade_specialty === category?.trade_specialty &&
      t.is_available &&
      t.is_active,
  );
  const lifecycle = [
    "PENDING",
    "ASSIGNED",
    "IN_PROGRESS",
    "COMPLETED",
    "CLOSED",
  ];
  const stage = lifecycle.indexOf(ticket.status);
  async function complete(event: React.FormEvent) {
    event.preventDefault();
    if (!photo) {
      setError("Add an after-repair photo before you complete this job.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const attachmentId = await uploadPhoto(
        photo,
        "AFTER",
        reference.storageDriver,
      );
      await action({ action: "complete", notes, attachmentId });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The repair could not be completed.",
      );
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="back-link" href="/app/tickets">
        <ArrowLeft size={15} aria-hidden="true" />
        Back to reports
      </Link>
      <PageTitle
        eyebrow={`${ticket.ticket_id} · ${ticket.category_name.toUpperCase()}`}
        title={ticket.title}
        description={`Reported ${formatDate(ticket.created_at)}`}
      >
        <Badge value={ticket.status} />
        <Badge value={ticket.priority} priority />
      </PageTitle>
      {search.get("created") === "1" && (
        <Notice tone="success">
          Your report is recorded. Your ticket number is {ticket.ticket_id}.
        </Notice>
      )}
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      {ticket.duplicate_of && (
        <Notice tone="info">
          This report is linked to{" "}
          <Link href={`/app/tickets/${ticket.duplicate_of}`}>
            {ticket.duplicate_of}
          </Link>
          . Follow the main report for repair updates.
        </Notice>
      )}
      {stage >= 0 && (
        <div
          className="lifecycle"
          aria-label={`Repair progress: ${label(ticket.status)}`}
        >
          {lifecycle.map((item, i) => (
            <div className={i <= stage ? "reached" : ""} key={item}>
              <span>
                {i < stage ? <Check size={15} aria-hidden="true" /> : i + 1}
              </span>
              <strong>{label(item)}</strong>
            </div>
          ))}
        </div>
      )}
      <div className="detail-layout">
        <div className="detail-main">
          <section className="panel">
            <div className="panel-heading">
              <h2>Issue details</h2>
              <span className="muted">
                Reported as {label(ticket.reporter_urgency)}
              </span>
            </div>
            <div className="panel-body">
              <p className="issue-description">{ticket.description}</p>
              <div className="detail-facts">
                <div>
                  <MapPin size={18} aria-hidden="true" />
                  <span>
                    <small>LOCATION</small>
                    <strong>{ticket.building_name}</strong>
                    <p>
                      {ticket.room_number} · {ticket.faculty_code}
                    </p>
                  </span>
                </div>
                <div>
                  <UserRound size={18} aria-hidden="true" />
                  <span>
                    <small>REPORTED BY</small>
                    <strong>{ticket.reporter_name}</strong>
                    <p>
                      {ticket.is_following && !owner
                        ? "You follow this report"
                        : "Campus community"}
                    </p>
                  </span>
                </div>
              </div>
              {attachments.length > 0 && (
                <div className="evidence-grid">
                  {attachments.map((item) => (
                    <a
                      key={item.attachment_id}
                      href={`/api/attachments/${item.attachment_id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="evidence-label">
                        {item.phase === "BEFORE"
                          ? "REPORTED ISSUE"
                          : "AFTER THE REPAIR"}
                        <ArrowUpRight size={14} aria-hidden="true" />
                      </span>
                      <Image
                        unoptimized
                        width={1000}
                        height={750}
                        src={`/api/attachments/${item.attachment_id}`}
                        alt={
                          item.phase === "BEFORE"
                            ? "Photo of the reported issue"
                            : "Photo submitted as repair proof"
                        }
                      />
                      <small>{item.original_name}</small>
                    </a>
                  ))}
                </div>
              )}
              {ticket.resolution_notes && (
                <div className="resolution-notes">
                  <CheckCircle2 size={18} aria-hidden="true" />
                  <div>
                    <strong>Repair notes</strong>
                    <p>{ticket.resolution_notes}</p>
                  </div>
                </div>
              )}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Activity history</h2>
              <span className="muted">{activity.length} update(s)</span>
            </div>
            <ol className="ticket-timeline">
              {activity.map((item) => (
                <li key={item.audit_id}>
                  <span className="timeline-marker" />
                  <div>
                    <strong>{label(item.event_code)}</strong>
                    <p>{item.details}</p>
                    <small>
                      {item.full_name ?? "CampusFix"} ·{" "}
                      {formatDate(item.created_at)}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          {logs.length > 0 && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Work log</h2>
              </div>
              <div className="work-logs">
                {logs.map((log) => (
                  <div key={log.log_id}>
                    <strong>{log.action_description}</strong>
                    {log.parts_consumed && <p>Parts: {log.parts_consumed}</p>}
                    <small>
                      {log.labor_minutes} minutes · {log.full_name} ·{" "}
                      {formatDate(log.logged_at)}
                    </small>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="panel">
            <div className="panel-heading">
              <h2>Conversation</h2>
              <MessageSquare size={18} aria-hidden="true" />
            </div>
            <div className="comments-list">
              {comments.length ? (
                comments.map((item) => (
                  <div className="comment" key={item.comment_id}>
                    <span className="avatar avatar-small">
                      {item.full_name
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <div>
                      <strong>
                        {item.full_name}
                        <small>{formatDate(item.created_at)}</small>
                      </strong>
                      <p>{item.body}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="muted">
                  Add a question or share an update about this report.
                </p>
              )}
              {!["CLOSED", "DUPLICATE", "REJECTED"].includes(ticket.status) && (
                <form
                  className="comment-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action({ action: "comment", body: comment });
                  }}
                >
                  <label className="sr-only" htmlFor="comment">
                    Your comment
                  </label>
                  <textarea
                    id="comment"
                    placeholder="Add a comment or ask a question..."
                    maxLength={2000}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    required
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={busy || !comment.trim()}
                  >
                    <Send size={15} aria-hidden="true" />
                    Post comment
                  </Button>
                </form>
              )}
            </div>
          </section>
        </div>
        <aside className="detail-sidebar">
          <section className="panel">
            <div className="panel-heading">
              <h2>Repair overview</h2>
              <Wrench size={18} aria-hidden="true" />
            </div>
            <div className="repair-overview">
              <div>
                <span>Assigned technician</span>
                <strong>
                  {ticket.technician_name ?? "Awaiting assignment"}
                </strong>
              </div>
              <div>
                <span>Repair target</span>
                <strong>
                  {SLA_HOURS[ticket.priority]} hours from submission
                </strong>
              </div>
              <div>
                <span>Deadline</span>
                <strong
                  className={
                    active && new Date(ticket.sla_deadline).getTime() < now
                      ? "overdue-label"
                      : ""
                  }
                >
                  {formatDate(ticket.sla_deadline)}
                </strong>
              </div>
              <div>
                <span>Last completed</span>
                <strong>{formatDate(ticket.resolved_at)}</strong>
              </div>
            </div>
          </section>
          {manager && active && (
            <section className="panel action-panel">
              <div className="panel-heading">
                <h2>Review and assign</h2>
              </div>
              <form
                className="panel-body form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action({
                    action: "assign",
                    priority: priority || ticket.priority,
                    technicianId: technician,
                  });
                }}
              >
                <Field label="Priority" htmlFor="priority">
                  <select
                    id="priority"
                    value={priority || ticket.priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    {["P1_CRITICAL", "P2_URGENT", "P3_ROUTINE"].map((p) => (
                      <option key={p} value={p}>
                        {p.slice(0, 2)} {label(p)} ·{" "}
                        {SLA_HOURS[p as keyof typeof SLA_HOURS]} hours
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Technician" htmlFor="technician">
                  <select
                    id="technician"
                    value={technician}
                    onChange={(e) => setTechnician(e.target.value)}
                  >
                    <option value="auto">Automatic: lowest workload</option>
                    {techs.map((tech) => (
                      <option key={tech.tech_id} value={tech.tech_id}>
                        {tech.full_name} ({tech.active_workload} jobs)
                      </option>
                    ))}
                  </select>
                </Field>
                <p className="field-hint">
                  Only available technicians with the correct trade are listed.
                  Reassignment keeps the original deadline.
                </p>
                <Button type="submit" disabled={busy}>
                  {busy ? <Busy /> : <Wrench size={16} aria-hidden="true" />}
                  Assign work order
                </Button>
              </form>
            </section>
          )}
          {assigned && ticket.status === "ASSIGNED" && (
            <section className="panel action-panel">
              <div className="panel-body">
                <h2>Ready to get started?</h2>
                <p className="muted">
                  Check the issue and location. Start work when you arrive.
                </p>
                <Button
                  disabled={busy}
                  onClick={() => action({ action: "start" })}
                >
                  {busy ? <Busy /> : <Wrench size={16} aria-hidden="true" />}
                  Start work
                </Button>
              </div>
            </section>
          )}
          {assigned && ticket.status === "IN_PROGRESS" && (
            <section className="panel action-panel">
              <div className="panel-heading">
                <h2>Record your work</h2>
              </div>
              <form
                className="panel-body form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action({
                    action: "log",
                    notes,
                    parts,
                    laborMinutes: Number(labor),
                  });
                }}
              >
                <Field label="Work notes" htmlFor="notes">
                  <textarea
                    id="notes"
                    rows={3}
                    value={notes}
                    minLength={3}
                    maxLength={2000}
                    onChange={(e) => setNotes(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Parts used" htmlFor="parts">
                  <input
                    id="parts"
                    value={parts}
                    maxLength={1000}
                    onChange={(e) => setParts(e.target.value)}
                    placeholder="e.g. 2 LED tubes"
                  />
                </Field>
                <Field label="Labour time (minutes)" htmlFor="labor">
                  <input
                    id="labor"
                    type="number"
                    min={0}
                    max={1440}
                    value={labor}
                    onChange={(e) => setLabor(e.target.value)}
                  />
                </Field>
                <Button type="submit" variant="outline" disabled={busy}>
                  Save work log
                </Button>
              </form>
              <form
                className="panel-body form-stack complete-form"
                onSubmit={complete}
              >
                <h3>Complete the repair</h3>
                <Field label="Final repair notes" htmlFor="resolution">
                  <textarea
                    id="resolution"
                    minLength={10}
                    maxLength={2000}
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    required
                  />
                </Field>
                <Field
                  label="After-repair photo"
                  htmlFor="after-photo"
                  hint="A JPG or PNG photo up to 4.5 MB is required."
                >
                  <input
                    id="after-photo"
                    type="file"
                    accept="image/jpeg,image/png"
                    onChange={(e) => setPhoto(e.target.files?.[0])}
                    required
                  />
                </Field>
                <Button type="submit" disabled={busy}>
                  {busy ? (
                    <Busy />
                  ) : (
                    <CheckCircle2 size={16} aria-hidden="true" />
                  )}
                  Complete repair
                </Button>
              </form>
            </section>
          )}
          {ticket.status === "COMPLETED" && (owner || manager) && (
            <section className="panel action-panel">
              <div className="panel-body form-stack">
                <CheckCircle2
                  size={26}
                  className="green-text"
                  aria-hidden="true"
                />
                <h2>How does it look?</h2>
                <p className="muted">
                  Check the repair and the after photo. Confirm it is complete,
                  or let us know if the problem remains.
                </p>
                <Button
                  disabled={busy}
                  onClick={() => action({ action: "close" })}
                >
                  <Check size={16} aria-hidden="true" />
                  Confirm repair and close
                </Button>
                {owner && (
                  <details>
                    <summary>Report a problem with the repair</summary>
                    <form
                      className="form-stack"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void action({ action: "dispute", reason });
                      }}
                    >
                      <Field
                        label="What still needs attention?"
                        htmlFor="dispute-reason"
                      >
                        <textarea
                          id="dispute-reason"
                          minLength={10}
                          maxLength={1000}
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          required
                        />
                      </Field>
                      <Button disabled={busy} type="submit" variant="outline">
                        Reopen the repair
                      </Button>
                    </form>
                  </details>
                )}
                <small className="field-hint">
                  If no problem is reported, this ticket will close 72 hours
                  after completion.
                </small>
              </div>
            </section>
          )}
          {manager && active && (
            <section className="panel">
              <div className="panel-body">
                <details>
                  <summary>Merge a duplicate report</summary>
                  <form
                    className="form-stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action({
                        action: "merge",
                        masterId: master,
                        reason,
                      });
                    }}
                  >
                    <p className="field-hint">
                      Use the main report ID. Both reports must have the same
                      room and category. Reporters will follow the main report.
                    </p>
                    <Field label="Main report ID" htmlFor="master">
                      <input
                        id="master"
                        placeholder="CF-2026-1041"
                        value={master}
                        onChange={(e) =>
                          setMaster(e.target.value.toUpperCase())
                        }
                        required
                      />
                    </Field>
                    <Field label="Reason for merging" htmlFor="merge-reason">
                      <textarea
                        id="merge-reason"
                        minLength={10}
                        maxLength={1000}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        required
                      />
                    </Field>
                    <Button type="submit" variant="outline" disabled={busy}>
                      Confirm merge
                    </Button>
                  </form>
                </details>
                <details>
                  <summary>Reject this report</summary>
                  <form
                    className="form-stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action({ action: "reject", reason });
                    }}
                  >
                    <Field label="Reason for rejection" htmlFor="reject-reason">
                      <textarea
                        id="reject-reason"
                        minLength={10}
                        maxLength={1000}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        required
                      />
                    </Field>
                    <Button type="submit" variant="destructive" disabled={busy}>
                      Confirm rejection
                    </Button>
                  </form>
                </details>
              </div>
            </section>
          )}
          <div className="subtle-note">
            <ShieldCheck size={17} aria-hidden="true" />
            Changes are saved in the ticket audit history.
          </div>
        </aside>
      </div>
    </>
  );
}
