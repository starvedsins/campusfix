"use client";
import { api } from "@/lib/client";
import {
  facultyLabel,
  formatDate,
  label,
  PRIORITIES,
  ROLES,
  TRADES,
  type Category,
  type Location,
  type User,
} from "@/lib/domain";
import {
  BarChart3,
  Check,
  Download,
  FileText,
  Plus,
  Printer,
  Search,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { useResource } from "./resource";
import type { Activity, ReferenceData } from "./types";
import { Button } from "./ui/button";
import { Busy, Empty, Field, Loading, Notice, PageTitle } from "./ui/common";
import { useClock } from "./use-clock";

type Metric = number | string | null;
interface ReportData {
  summary: {
    total: number;
    active: number;
    completed: number;
    mttr_hours: Metric;
    sla_percent: Metric;
  };
  faculties: {
    faculty_code: string;
    total: number;
    completed: number;
    overdue: number;
    mttr_hours: Metric;
  }[];
  buildings: { building_name: string; category_name: string; count: number }[];
  technicians: { full_name: string; completed: number; mttr_hours: Metric }[];
}
export function ReportsPage() {
  const [faculty, setFaculty] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const params = new URLSearchParams({ faculty, from, to });
  const resource = useResource<ReportData>(`/api/reports?${params}`);
  return (
    <>
      <PageTitle
        eyebrow="A CLEARER PICTURE"
        title="Reports and insights"
        description="See what is working and where more care is needed."
      >
        <Button asChild variant="outline">
          <a href={`/api/reports/export?${params}`}>
            <Download size={16} aria-hidden="true" />
            Export CSV
          </a>
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer size={16} aria-hidden="true" />
          Print or save PDF
        </Button>
      </PageTitle>
      <section className="panel report-filters no-print">
        <Field label="Faculty or area" htmlFor="report-faculty">
          <select
            id="report-faculty"
            value={faculty}
            onChange={(e) => setFaculty(e.target.value)}
          >
            <option value="">All faculties and areas</option>
            {Object.entries(facultyLabel).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reported from" htmlFor="report-from">
          <input
            id="report-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label="Reported to" htmlFor="report-to">
          <input
            id="report-to"
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
      </section>
      {resource.error ? (
        <Notice>{resource.error}</Notice>
      ) : !resource.data ? (
        <Loading />
      ) : (
        <>
          <div className="stats-row">
            {[
              {
                name: "Reports received",
                value: resource.data.summary.total,
                unit: "",
                hint: "Excludes duplicate and rejected reports",
              },
              {
                name: "Repairs completed",
                value: resource.data.summary.completed,
                unit: "",
                hint: "Completed and closed repairs",
              },
              {
                name: "Average repair time",
                value: resource.data.summary.mttr_hours ?? "N/A",
                unit: resource.data.summary.mttr_hours ? " hrs" : "",
                hint: "From first report to completion",
              },
              {
                name: "Within repair target",
                value: resource.data.summary.sla_percent ?? "N/A",
                unit: resource.data.summary.sla_percent !== null ? "%" : "",
                hint: "Of repairs completed in this period",
              },
            ].map((item) => (
              <div className="stat" key={item.name}>
                <span className="stat-label">{item.name}</span>
                <strong>
                  {item.value}
                  <small>{item.unit}</small>
                </strong>
                <span>{item.hint}</span>
              </div>
            ))}
          </div>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>By faculty and area</h2>
                <p>Keep an eye on demand across campus.</p>
              </div>
              <BarChart3 size={20} aria-hidden="true" />
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Faculty or area</th>
                    <th>Reports</th>
                    <th>Completed</th>
                    <th>Past deadline</th>
                    <th>Average repair time</th>
                  </tr>
                </thead>
                <tbody>
                  {resource.data.faculties.map((item) => (
                    <tr key={item.faculty_code}>
                      <td>
                        <strong>
                          {facultyLabel[item.faculty_code] ?? item.faculty_code}
                        </strong>
                        <small>{item.faculty_code}</small>
                      </td>
                      <td>{item.total}</td>
                      <td>{item.completed}</td>
                      <td>{item.overdue}</td>
                      <td>
                        {item.mttr_hours !== null
                          ? `${item.mttr_hours} hours`
                          : "No completed repairs"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!resource.data.faculties.length && (
              <Empty
                title="No reports in this period"
                text="Choose another date range or faculty."
              />
            )}
          </section>
          <div className="dashboard-columns report-columns">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Where faults recur</h2>
                  <p>Report counts by building and issue type.</p>
                </div>
              </div>
              <div className="ranking-list">
                {resource.data.buildings.map((item, i) => (
                  <div key={item.building_name + item.category_name}>
                    <span className="ranking-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>
                      <strong>{item.building_name}</strong>
                      <small>{item.category_name}</small>
                    </span>
                    <b>{item.count}</b>
                  </div>
                ))}
                {!resource.data.buildings.length && (
                  <Empty
                    title="No building data yet"
                    text="Building counts will appear after reports are submitted."
                  />
                )}
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>Completed work by technician</h2>
              </div>
              <div className="ranking-list">
                {resource.data.technicians.map((item) => (
                  <div key={item.full_name}>
                    <span className="avatar avatar-small">
                      {item.full_name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </span>
                    <span>
                      <strong>{item.full_name}</strong>
                      <small>{item.mttr_hours} hours average</small>
                    </span>
                    <b>{item.completed}</b>
                  </div>
                ))}
                {!resource.data.technicians.length && (
                  <Empty
                    title="Repairs are in progress"
                    text="Completed repairs will appear here."
                  />
                )}
              </div>
            </section>
          </div>
          <p className="subtle-note">
            <FileText size={16} aria-hidden="true" />
            Report generated {formatDate(new Date())}. Figures use actual
            database records. Demo records are included.
          </p>
        </>
      )}
    </>
  );
}
export function SettingsPage({ user }: { user: User }) {
  const [email, setEmail] = useState(user.pref_email);
  const [sms, setSms] = useState(user.pref_sms);
  const [inApp, setInApp] = useState(user.pref_in_app);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return (
    <>
      <PageTitle
        eyebrow="MAKE IT YOURS"
        title="Preferences"
        description="Your account details and the updates you want to receive."
      />
      <div className="settings-layout">
        <section className="panel">
          <div className="panel-heading">
            <h2>Your account</h2>
            <ShieldCheck size={18} aria-hidden="true" />
          </div>
          <dl className="profile-details">
            <div>
              <dt>Name</dt>
              <dd>{user.full_name}</dd>
            </div>
            <div>
              <dt>University ID</dt>
              <dd>{user.institutional_id}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Workspace role</dt>
              <dd>{label(user.role)}</dd>
            </div>
          </dl>
          <p className="panel-note">
            Contact the demonstration administrator to change account details.
          </p>
        </section>
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setMessage("");
            try {
              await api("/api/settings", {
                method: "PATCH",
                body: JSON.stringify({ email, sms, inApp }),
              });
              setMessage("Your preferences are saved.");
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Preferences could not be saved.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="panel-heading">
            <h2>Notification preferences</h2>
            <Settings2 size={18} aria-hidden="true" />
          </div>
          <div className="panel-body form-stack">
            {error && <Notice>{error}</Notice>}
            {message && <Notice tone="success">{message}</Notice>}
            {[
              {
                id: "in-app",
                title: "In-app updates",
                text: "See ticket updates in your notification inbox.",
                checked: inApp,
                set: setInApp,
              },
              {
                id: "email-pref",
                title: "Email updates",
                text: "Create test email delivery records for ticket updates.",
                checked: email,
                set: setEmail,
              },
              {
                id: "sms-pref",
                title: "SMS updates",
                text: "Create test SMS delivery records for ticket updates.",
                checked: sms,
                set: setSms,
              },
            ].map((item) => (
              <label className="preference-row" key={item.id} htmlFor={item.id}>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.text}</small>
                </span>
                <input
                  role="switch"
                  id={item.id}
                  type="checkbox"
                  checked={item.checked}
                  onChange={(e) => item.set(e.target.checked)}
                />
              </label>
            ))}
            <Notice tone="info">
              Email and SMS use a test transport. This demonstration does not
              send external messages.
            </Notice>
            <Button type="submit" disabled={busy}>
              {busy ? <Busy /> : <Check size={16} aria-hidden="true" />}Save
              preferences
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
interface ManagedUser {
  user_id: string;
  institutional_id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
  locked_until: string | null;
  trade_specialty: string | null;
  is_available: boolean | null;
  active_workload: number | null;
}
export function UsersPage() {
  const now = useClock();
  const resource = useResource<ManagedUser[]>("/api/admin/users");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [role, setRole] = useState("STUDENT");
  async function change(input: Record<string, unknown>) {
    setError("");
    setBusy(true);
    try {
      await api("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      resource.refresh();
      setMessage("The account was updated.");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The account could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="THE CAMPUS COMMUNITY"
        title="Accounts"
        description="Manage access and technician availability."
      >
        <Button onClick={() => setAdding(!adding)}>
          <Plus size={16} aria-hidden="true" />
          {adding ? "Close account form" : "Add account"}
        </Button>
      </PageTitle>
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      {adding && (
        <form
          className="panel admin-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const data = Object.fromEntries(new FormData(form));
            setBusy(true);
            setError("");
            try {
              await api("/api/admin/users", {
                method: "POST",
                body: JSON.stringify(data),
              });
              setAdding(false);
              setMessage("The account was created.");
              resource.refresh();
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "The account could not be created.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>Add an authorised account</h2>
          <div className="form-grid">
            <Field label="Full name" htmlFor="fullName">
              <input
                id="fullName"
                name="fullName"
                minLength={2}
                maxLength={120}
                required
              />
            </Field>
            <Field label="University ID" htmlFor="institutionalId">
              <input
                id="institutionalId"
                name="institutionalId"
                minLength={3}
                maxLength={20}
                required
              />
            </Field>
            <Field label="Institutional email" htmlFor="email">
              <input id="email" name="email" type="email" required />
            </Field>
            <Field
              label="Initial password"
              htmlFor="new-password"
              hint="Use at least 12 characters."
            >
              <input
                id="new-password"
                name="password"
                type="password"
                minLength={12}
                maxLength={72}
                autoComplete="new-password"
                required
              />
            </Field>
            <Field label="Role" htmlFor="role">
              <select
                id="role"
                name="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                {ROLES.map((item) => (
                  <option key={item} value={item}>
                    {label(item)}
                  </option>
                ))}
              </select>
            </Field>
            {role === "TECHNICIAN" && (
              <Field label="Trade specialty" htmlFor="trade">
                <select id="trade" name="trade" required>
                  {TRADES.map((item) => (
                    <option key={item} value={item}>
                      {label(item)}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? <Busy /> : null}Create account
          </Button>
        </form>
      )}
      <section className="panel">
        {resource.error ? (
          <Notice>{resource.error}</Notice>
        ) : !resource.data ? (
          <Loading />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Role</th>
                  <th>Account</th>
                  <th>Availability</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {resource.data.map((person) => (
                  <tr key={person.user_id}>
                    <td>
                      <strong>{person.full_name}</strong>
                      <small>{person.email}</small>
                      <small>{person.institutional_id}</small>
                    </td>
                    <td>
                      {label(person.role)}
                      {person.trade_specialty && (
                        <small>{label(person.trade_specialty)}</small>
                      )}
                    </td>
                    <td>
                      <span
                        className={`availability ${person.is_active ? "available" : ""}`}
                      >
                        <span />
                        {person.is_active ? "Active" : "Inactive"}
                      </span>
                      {person.locked_until &&
                        new Date(person.locked_until).getTime() > now && (
                          <small className="overdue-label">Locked</small>
                        )}
                    </td>
                    <td>
                      {person.role === "TECHNICIAN" ? (
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            disabled={busy}
                            aria-label={`${person.full_name} available`}
                            checked={!!person.is_available}
                            onChange={(e) =>
                              change({
                                userId: person.user_id,
                                available: e.target.checked,
                              })
                            }
                          />
                          Available{" "}
                          <small>({person.active_workload} jobs)</small>
                        </label>
                      ) : (
                        <span className="muted">Not applicable</span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            change({
                              userId: person.user_id,
                              active: !person.is_active,
                            })
                          }
                        >
                          {person.is_active ? "Deactivate" : "Activate"}
                        </Button>
                        {person.locked_until && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              change({ userId: person.user_id, unlock: true })
                            }
                          >
                            Unlock
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
export function ReferencePage({
  reference,
  refresh,
}: {
  reference: ReferenceData;
  refresh: () => void;
}) {
  const [tab, setTab] = useState("categories");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [editLocation, setEditLocation] = useState<Location | null>(null);
  const [open, setOpen] = useState(false);
  async function save(input: unknown) {
    setBusy(true);
    setError("");
    try {
      await api("/api/admin/reference", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setMessage("The campus directory was updated.");
      setOpen(false);
      setEditCategory(null);
      setEditLocation(null);
      refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "The directory could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="THE RIGHT PLACE AND PEOPLE"
        title="Campus directory"
        description="Keep issue categories and campus locations up to date."
      >
        <Button
          onClick={() => {
            setEditCategory(null);
            setEditLocation(null);
            setOpen(!open);
          }}
        >
          <Plus size={16} aria-hidden="true" />
          Add {tab === "categories" ? "category" : "location"}
        </Button>
      </PageTitle>
      {error && <Notice>{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <div className="tabs" role="tablist" aria-label="Directory type">
        <button
          role="tab"
          aria-selected={tab === "categories"}
          onClick={() => {
            setTab("categories");
            setOpen(false);
          }}
        >
          Issue categories
        </button>
        <button
          role="tab"
          aria-selected={tab === "locations"}
          onClick={() => {
            setTab("locations");
            setOpen(false);
          }}
        >
          Campus locations
        </button>
      </div>
      {open && (
        <form
          key={
            (editCategory?.category_id ?? editLocation?.location_id ?? "new") +
            tab
          }
          className="panel admin-form"
          onSubmit={(e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.currentTarget));
            void save(
              tab === "categories"
                ? {
                    kind: "category",
                    ...(editCategory ? { id: editCategory.category_id } : {}),
                    name: data.name,
                    trade: data.trade,
                    priority: data.priority,
                    active: data.active === "on",
                  }
                : {
                    kind: "location",
                    ...(editLocation ? { id: editLocation.location_id } : {}),
                    faculty: data.faculty,
                    building: data.building,
                    room: data.room,
                    active: data.active === "on",
                  },
            );
          }}
        >
          <h2>
            {editCategory || editLocation ? "Edit" : "Add"}{" "}
            {tab === "categories" ? "category" : "location"}
          </h2>
          <div className="form-grid">
            {tab === "categories" ? (
              <>
                <Field label="Category name" htmlFor="category-name">
                  <input
                    id="category-name"
                    name="name"
                    defaultValue={editCategory?.category_name}
                    minLength={2}
                    maxLength={60}
                    required
                  />
                </Field>
                <Field label="Trade specialty" htmlFor="category-trade">
                  <select
                    id="category-trade"
                    name="trade"
                    defaultValue={editCategory?.trade_specialty}
                  >
                    {TRADES.map((item) => (
                      <option key={item} value={item}>
                        {label(item)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Default priority" htmlFor="category-priority">
                  <select
                    id="category-priority"
                    name="priority"
                    defaultValue={
                      editCategory?.default_priority ?? "P3_ROUTINE"
                    }
                  >
                    {PRIORITIES.map((item) => (
                      <option key={item} value={item}>
                        {label(item)}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            ) : (
              <>
                <Field label="Faculty or area" htmlFor="location-faculty">
                  <select
                    id="location-faculty"
                    name="faculty"
                    defaultValue={editLocation?.faculty_code}
                  >
                    {Object.entries(facultyLabel).map(([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Building name" htmlFor="location-building">
                  <input
                    id="location-building"
                    name="building"
                    defaultValue={editLocation?.building_name}
                    minLength={2}
                    maxLength={80}
                    required
                  />
                </Field>
                <Field label="Room or area" htmlFor="location-room">
                  <input
                    id="location-room"
                    name="room"
                    defaultValue={editLocation?.room_number}
                    maxLength={30}
                    required
                  />
                </Field>
              </>
            )}
            <label className="checkbox-label">
              <input
                name="active"
                type="checkbox"
                defaultChecked={
                  editCategory?.is_active ?? editLocation?.is_active ?? true
                }
              />
              Active and available in forms
            </label>
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? <Busy /> : null}Save{" "}
            {tab === "categories" ? "category" : "location"}
          </Button>
        </form>
      )}
      <section className="panel">
        <div className="table-scroll">
          {tab === "categories" ? (
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Trade specialty</th>
                  <th>Default priority</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {reference.categories.map((item) => (
                  <tr key={item.category_id}>
                    <td>
                      <strong>{item.category_name}</strong>
                    </td>
                    <td>{label(item.trade_specialty)}</td>
                    <td>{label(item.default_priority)}</td>
                    <td>{item.is_active ? "Active" : "Inactive"}</td>
                    <td>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditCategory(item);
                          setOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Faculty</th>
                  <th>Building</th>
                  <th>Room or area</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {reference.locations.map((item) => (
                  <tr key={item.location_id}>
                    <td>{item.faculty_code}</td>
                    <td>
                      <strong>{item.building_name}</strong>
                    </td>
                    <td>{item.room_number}</td>
                    <td>{item.is_active ? "Active" : "Inactive"}</td>
                    <td>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditLocation(item);
                          setOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
export function AuditPage() {
  const resource = useResource<Activity[]>("/api/admin/audit");
  const [search, setSearch] = useState("");
  const filtered = resource.data?.filter((item) =>
    `${item.event_code} ${item.details} ${item.ticket_id ?? ""} ${item.full_name ?? ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageTitle
        eyebrow="A RECORD YOU CAN FOLLOW"
        title="Audit history"
        description="The latest 200 recorded actions. Audit records cannot be edited."
      />
      <section className="panel">
        <div className="list-toolbar">
          <div className="search-input">
            <Search size={17} aria-hidden="true" />
            <input
              aria-label="Search audit history"
              placeholder="Search actions, reports, or people..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {resource.error ? (
          <Notice>{resource.error}</Notice>
        ) : !resource.data ? (
          <Loading />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Time in Jamaica</th>
                  <th>Action</th>
                  <th>Person</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered?.map((item) => (
                  <tr key={item.audit_id}>
                    <td className="nowrap">{formatDate(item.created_at)}</td>
                    <td>
                      <strong>{label(item.event_code)}</strong>
                      <small>{item.ticket_id}</small>
                    </td>
                    <td>{item.full_name ?? "CampusFix"}</td>
                    <td className="audit-details">{item.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
interface Delivery {
  delivery_id: string;
  channel: string;
  status: string;
  attempts: number;
  last_error: string | null;
  processed_at: string | null;
  title: string;
  ticket_id: string;
  full_name: string;
}
export function DeliveriesPage() {
  const resource = useResource<Delivery[]>("/api/admin/deliveries", 20_000);
  return (
    <>
      <PageTitle
        eyebrow="TEST TRANSPORT"
        title="Message delivery records"
        description="Inspect email and SMS test records for the course demonstration."
      />
      <Notice tone="info">
        TEST_RECORDED means the test transport recorded the message. It does not
        mean an email or SMS was sent.
      </Notice>
      <section className="panel">
        {resource.error ? (
          <Notice>{resource.error}</Notice>
        ) : !resource.data ? (
          <Loading />
        ) : !resource.data.length ? (
          <Empty
            title="No test messages yet"
            text="Ticket updates create records when email or SMS preferences are on."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Report and message</th>
                  <th>Recipient</th>
                  <th>Channel</th>
                  <th>Result</th>
                  <th>Attempts</th>
                </tr>
              </thead>
              <tbody>
                {resource.data.map((item) => (
                  <tr key={item.delivery_id}>
                    <td>
                      <strong>{item.title}</strong>
                      <small>{item.ticket_id}</small>
                    </td>
                    <td>{item.full_name}</td>
                    <td>{item.channel}</td>
                    <td>
                      {item.status}
                      <small>
                        {item.last_error ?? formatDate(item.processed_at)}
                      </small>
                    </td>
                    <td>{item.attempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
