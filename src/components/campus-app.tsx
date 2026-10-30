"use client";
import { api } from "@/lib/client";
import {
  facultyLabel,
  formatDate,
  isManager,
  isReporter,
  label,
  type Ticket,
  type User,
} from "@/lib/domain";
import { flushReports, queuedCount } from "@/lib/offline";
import type { LucideIcon } from "lucide-react";
import {
  Activity as ActivityIcon,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Leaf,
  LifeBuoy,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  Users,
  WifiOff,
  Wrench,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AuditPage,
  DeliveriesPage,
  ReferencePage,
  ReportsPage,
  SettingsPage,
  UsersPage,
} from "./management";
import { NewReport } from "./new-report";
import { useResource } from "./resource";
import { TicketPage } from "./ticket-page";
import type {
  DashboardData,
  Notification,
  ReferenceData,
  TicketListData,
} from "./types";
import { Button } from "./ui/button";
import {
  Badge,
  Brand,
  Busy,
  CampusIllustration,
  Empty,
  Loading,
  Notice,
  PageTitle,
} from "./ui/common";
import { useClock } from "./use-clock";

export function CampusApp({ user, view }: { user: User; view: string[] }) {
  const router = useRouter();
  const [mobile, setMobile] = useState(false);
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState(0);
  const [toast, setToast] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const reference = useResource<ReferenceData>("/api/reference");
  const summary = useResource<DashboardData>("/api/dashboard", 30_000);
  const refreshSummary = summary.refresh;
  const page = view[0] ?? "overview";
  const manager = isManager(user.role);
  const reporter = isReporter(user.role);
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    const sync = async () => {
      setOnline(navigator.onLine);
      try {
        if (navigator.onLine)
          await flushReports(user.user_id, (id) => {
            setToast(`Report ${id} was sent.`);
            refreshSummary();
          });
        setQueue(await queuedCount(user.user_id));
      } catch (error) {
        if (navigator.onLine)
          setToast(
            error instanceof Error
              ? error.message
              : "Your queued report is saved. Try again when you are signed in.",
          );
      }
    };
    void sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    const timer = setInterval(sync, 30_000);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
      clearInterval(timer);
    };
  }, [user.user_id, refreshSummary]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 7000);
    return () => clearTimeout(timer);
  }, [toast]);
  const links: {
    href: string;
    label: string;
    icon: LucideIcon;
    count?: number;
  }[] = [
    { href: "/app", label: "Overview", icon: LayoutDashboard },
    {
      href: "/app/tickets",
      label: manager
        ? "All reports"
        : user.role === "TECHNICIAN"
          ? "My work orders"
          : "My reports",
      icon: ClipboardList,
      count: summary.data?.counts.active,
    },
    ...(reporter
      ? [{ href: "/app/report", label: "Report an issue", icon: Plus }]
      : []),
    ...(manager
      ? [
          {
            href: "/app/reports",
            label: "Reports and insights",
            icon: ActivityIcon,
          },
          { href: "/app/team", label: "Maintenance team", icon: Users },
        ]
      : []),
    {
      href: "/app/notifications",
      label: "Notifications",
      icon: Bell,
      count: summary.data?.unread,
    },
  ];
  const adminLinks =
    user.role === "FMD_ADMIN"
      ? [
          { href: "/app/users", label: "Accounts", icon: ShieldCheck },
          {
            href: "/app/reference",
            label: "Campus directory",
            icon: GraduationCap,
          },
          { href: "/app/audit", label: "Audit history", icon: FileText },
        ]
      : [];
  const current =
    page === "tickets" && view[1]
      ? "Report details"
      : page === "report"
        ? "Report an issue"
        : ([
            ...links,
            ...adminLinks,
            { href: "/app/settings", label: "Preferences" },
            { href: "/app/deliveries", label: "Message delivery" },
          ].find(
            (link) =>
              link.href === `/app${page === "overview" ? "" : "/" + page}`,
          )?.label ?? "Workspace");
  async function signOut() {
    setSigningOut(true);
    try {
      await api("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Sign-out failed.");
      setSigningOut(false);
    }
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      {mobile && (
        <button
          className="sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="mobile-close"
            onClick={() => setMobile(false)}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-label">
          <span className="workspace-icon">
            <GraduationCap size={18} aria-hidden="true" />
          </span>
          <div>
            UTech, Jamaica
            <small>
              {manager
                ? "Facilities workspace"
                : user.role === "TECHNICIAN"
                  ? "Technician workspace"
                  : "Campus community"}
            </small>
          </div>
          <ChevronDown size={14} aria-hidden="true" />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobile(false)}
              className={`nav-link ${(link.href === "/app" ? page === "overview" : link.href === `/app/${page}`) ? "active" : ""}`}
              aria-current={
                (
                  link.href === "/app"
                    ? page === "overview"
                    : link.href === `/app/${page}`
                )
                  ? "page"
                  : undefined
              }
            >
              <link.icon size={19} strokeWidth={1.7} aria-hidden="true" />
              {link.label}
              {!!link.count && <span className="nav-count">{link.count}</span>}
            </Link>
          ))}
        </nav>
        {adminLinks.length > 0 && (
          <>
            <div className="nav-label">ADMINISTRATION</div>
            <nav aria-label="Administration">
              {adminLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`nav-link ${link.href === `/app/${page}` ? "active" : ""}`}
                >
                  <link.icon size={18} aria-hidden="true" />
                  {link.label}
                </Link>
              ))}
            </nav>
          </>
        )}
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Leaf size={21} aria-hidden="true" />
            <strong>A little care goes a long way.</strong>
            <p>Every report helps make our campus a better place.</p>
            <Link href="/help">
              How CampusFix works <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <Link
            href="/app/settings"
            className={`nav-link ${page === "settings" ? "active" : ""}`}
          >
            <Settings2 size={18} aria-hidden="true" />
            Preferences
          </Link>
          <Link href="/help" className="nav-link">
            <LifeBuoy size={18} aria-hidden="true" />
            Help and support
          </Link>
          <div className="sidebar-profile">
            <span className="avatar">
              {user.full_name
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div>
              <strong>{user.full_name}</strong>
              <small>{label(user.role)}</small>
            </div>
            <button
              onClick={signOut}
              disabled={signingOut}
              aria-label="Sign out"
            >
              {signingOut ? <Busy /> : <LogOut size={17} />}
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="menu-button"
              onClick={() => setMobile(true)}
              aria-label="Open navigation"
            >
              <Menu size={22} />
            </button>
            <span>Workspace</span>
            <span className="breadcrumb-divider">/</span>
            <strong>{current}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-pill">
              <span />
              Course demonstration
            </span>
            <Link
              href="/app/notifications"
              className="notification-button"
              aria-label={`Notifications, ${summary.data?.unread ?? 0} unread`}
            >
              <Bell size={20} />
              {!!summary.data?.unread && <i />}
            </Link>
            <span className="avatar avatar-small">
              {user.full_name
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("")}
            </span>
          </div>
        </header>
        <main id="main-content" className="page-content" tabIndex={-1}>
          {(!online || queue > 0) && (
            <Notice tone="info">
              <WifiOff size={16} aria-hidden="true" />{" "}
              {online
                ? `${queue} report(s) are waiting to send.`
                : "You are offline. Open report forms can save drafts and queue submissions."}
            </Notice>
          )}
          {toast && (
            <div className="toast" role="status">
              <CheckCircle2 size={18} aria-hidden="true" />
              {toast}
              <button onClick={() => setToast("")} aria-label="Dismiss message">
                <X size={15} />
              </button>
            </div>
          )}
          {reference.error ? (
            <Notice>{reference.error}</Notice>
          ) : !reference.data ? (
            <Loading />
          ) : page === "overview" ? (
            <Overview user={user} resource={summary} />
          ) : page === "report" && reporter ? (
            <NewReport
              user={user}
              reference={reference.data}
              onQueued={() => {
                queuedCount(user.user_id).then(setQueue);
              }}
            />
          ) : page === "tickets" && view[1] ? (
            <TicketPage
              key={view[1]}
              user={user}
              ticketId={view[1]}
              reference={reference.data}
              onChange={summary.refresh}
            />
          ) : page === "tickets" ? (
            <TicketList user={user} />
          ) : page === "reports" && manager ? (
            <ReportsPage />
          ) : page === "team" && manager ? (
            <Team reference={reference.data} />
          ) : page === "notifications" ? (
            <Notifications refresh={summary.refresh} />
          ) : page === "settings" ? (
            <SettingsPage user={user} />
          ) : page === "users" && user.role === "FMD_ADMIN" ? (
            <UsersPage />
          ) : page === "reference" && user.role === "FMD_ADMIN" ? (
            <ReferencePage
              reference={reference.data}
              refresh={reference.refresh}
            />
          ) : page === "audit" && user.role === "FMD_ADMIN" ? (
            <AuditPage />
          ) : page === "deliveries" && manager ? (
            <DeliveriesPage />
          ) : (
            <Empty
              title="This page is not available"
              text="Return to your workspace to see the pages for your account."
              href="/app"
              action="Open overview"
            />
          )}
          <footer className="workspace-footer">
            <span>CampusFix · University facilities services</span>
            <span>
              <span className="live-dot" /> {online ? "Connected" : "Offline"}{" "}
              <span className="footer-separator">·</span> All times in Jamaica
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
function Overview({
  user,
  resource,
}: {
  user: User;
  resource: ReturnType<typeof useResource<DashboardData>>;
}) {
  if (resource.error) return <Notice>{resource.error}</Notice>;
  if (!resource.data) return <Loading />;
  const { counts, recent, activity, categories } = resource.data;
  const manager = isManager(user.role);
  const reporter = isReporter(user.role);
  return (
    <>
      <PageTitle
        eyebrow={
          manager
            ? "FACILITIES AT A GLANCE"
            : user.role === "TECHNICIAN"
              ? "YOUR WORKSPACE"
              : "YOUR CAMPUS, CARED FOR"
        }
        title={`Hello, ${user.full_name.split(" ")[0]}.`}
        description={
          manager
            ? "Here is what needs your team's attention today."
            : user.role === "TECHNICIAN"
              ? "A clear view of your jobs and what comes next."
              : "A small report can make a big difference."
        }
      >
        {reporter ? (
          <Button asChild>
            <Link href="/app/report">
              <Plus size={17} aria-hidden="true" />
              Report an issue
            </Link>
          </Button>
        ) : (
          <span className="date-chip">
            <CalendarDays size={16} aria-hidden="true" />
            {new Intl.DateTimeFormat("en-JM", {
              timeZone: "America/Jamaica",
              month: "short",
              day: "numeric",
              year: "numeric",
            }).format(new Date())}
          </span>
        )}
      </PageTitle>
      <section className="welcome-banner">
        <div>
          <span className="banner-eyebrow">
            <span />
            WORKING TOGETHER, EVERY DAY
          </span>
          <h2>
            {manager
              ? "Keep campus moving."
              : user.role === "TECHNICIAN"
                ? "Good work starts with you."
                : "A better campus starts here."}
          </h2>
          <p>
            {manager
              ? `${counts.active} active reports. One place to keep every repair on track.`
              : user.role === "TECHNICIAN"
                ? "Your next job, the right details, and a clear path to completion."
                : "Report what needs a little care. Track the repair. Get back to your day."}
          </p>
          <Link href={reporter ? "/app/report" : "/app/tickets"}>
            {reporter ? "Tell us what needs fixing" : "View the work queue"}
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
        <CampusIllustration />
      </section>
      <div className="stats-row">
        {[
          {
            title: "Active reports",
            value: counts.active,
            caption: "Awaiting or receiving care",
            icon: ClipboardList,
            color: "green",
          },
          {
            title: manager ? "Awaiting review" : "Pending",
            value: counts.pending,
            caption: "Ready for facilities review",
            icon: Clock3,
            color: "amber",
          },
          {
            title: "Completed",
            value: counts.completed,
            caption: "Repairs made and confirmed",
            icon: CheckCheck,
            color: "blue",
          },
          {
            title: "Past deadline",
            value: counts.overdue,
            caption: "Need a little extra attention",
            icon: TriangleAlert,
            color: "rose",
          },
        ].map((stat) => (
          <div className="stat" key={stat.title}>
            <div className="stat-label">
              {stat.title}
              <span className={`stat-icon ${stat.color}`}>
                <stat.icon size={18} aria-hidden="true" />
              </span>
            </div>
            <strong>{stat.value.toString().padStart(2, "0")}</strong>
            <span>{stat.caption}</span>
          </div>
        ))}
      </div>
      <div className="dashboard-columns">
        <section className="panel recent-panel">
          <div className="panel-heading">
            <div>
              <h2>
                {manager
                  ? "Recent reports"
                  : user.role === "TECHNICIAN"
                    ? "Your latest work orders"
                    : "Your recent reports"}
              </h2>
              <p>A quick look at the latest updates.</p>
            </div>
            <Link href="/app/tickets" className="text-link">
              View all
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <TicketTable tickets={recent} compact />
          {!recent.length && (
            <Empty
              href={reporter ? "/app/report" : undefined}
              action="Report an issue"
            />
          )}
        </section>
        <section className="panel activity-panel">
          <div className="panel-heading">
            <div>
              <h2>Latest activity</h2>
              <p>Every step, kept in view.</p>
            </div>
            <span className="live-indicator">
              <span />
              LIVE
            </span>
          </div>
          <div className="activity-feed">
            {activity.slice(0, 5).map((item) => (
              <Link
                href={`/app/tickets/${item.ticket_id}`}
                className="activity-item"
                key={item.audit_id}
              >
                <span
                  className={`activity-icon ${item.event_code.includes("COMPLET") ? "green" : ""}`}
                >
                  {item.event_code.includes("ASSIGN") ? (
                    <Wrench size={15} aria-hidden="true" />
                  ) : item.event_code.includes("COMPLET") ? (
                    <CheckCheck size={15} aria-hidden="true" />
                  ) : (
                    <ClipboardList size={15} aria-hidden="true" />
                  )}
                </span>
                <div>
                  <strong>{label(item.event_code)}</strong>
                  <p>
                    {item.ticket_id} · {item.full_name ?? "CampusFix"}
                  </p>
                  <small>{formatDate(item.created_at)}</small>
                </div>
              </Link>
            ))}
            {!activity.length && (
              <p className="muted">Your report updates will appear here.</p>
            )}
          </div>
        </section>
      </div>
      <div className="dashboard-bottom">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>What needs care</h2>
              <p>Active reports by issue type.</p>
            </div>
            <SlidersHorizontal size={18} aria-hidden="true" />
          </div>
          <div className="category-bars">
            {categories.length ? (
              categories.slice(0, 4).map((item) => (
                <div key={item.category_name}>
                  <span>{item.category_name}</span>
                  <div className="bar-track">
                    <div
                      style={{
                        width: `${Math.max(5, (item.count / Math.max(...categories.map((c) => c.count))) * 100)}%`,
                      }}
                    />
                  </div>
                  <strong>{item.count}</strong>
                </div>
              ))
            ) : (
              <p className="muted">There are no active reports.</p>
            )}
          </div>
        </section>
        <section className="how-it-works">
          <div className="section-eyebrow">
            <Leaf size={18} aria-hidden="true" />A SMALL ACTION. A REAL
            DIFFERENCE.
          </div>
          <h2>From reported to repaired.</h2>
          <div className="steps-inline">
            {["Report", "Review", "Repair", "Confirm"].map((step, i) => (
              <div key={step}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                {step}
                {i < 3 && <ArrowRight size={14} aria-hidden="true" />}
              </div>
            ))}
          </div>
          <Link href="/help" className="text-link">
            Learn how it works
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </section>
      </div>
    </>
  );
}
export function TicketTable({
  tickets,
  compact = false,
}: {
  tickets: Ticket[];
  compact?: boolean;
}) {
  const now = useClock();
  return (
    <div className="table-scroll">
      <table className="ticket-table">
        <thead>
          <tr>
            <th>Report</th>
            {!compact && <th>Location</th>}
            <th>Status</th>
            <th>Priority</th>
            {!compact && <th>Technician</th>}
            <th>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket.ticket_id}>
              <td>
                <Link
                  className="ticket-title"
                  href={`/app/tickets/${ticket.ticket_id}`}
                >
                  <span
                    className={`ticket-category-icon ${ticket.category_name === "Electrical" ? "electrical" : ""}`}
                  >
                    <Wrench size={17} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{ticket.title}</strong>
                    <small>
                      {ticket.ticket_id} <span>·</span>{" "}
                      {compact ? ticket.building_name : ticket.category_name}
                    </small>
                  </span>
                </Link>
              </td>
              {!compact && (
                <td>
                  <span className="table-main">{ticket.building_name}</span>
                  <small>{ticket.room_number}</small>
                </td>
              )}
              <td>
                <Badge value={ticket.status} />
              </td>
              <td>
                <Badge value={ticket.priority} priority />
              </td>
              {!compact && (
                <td>
                  <span className="table-main">
                    {ticket.technician_name ?? "Unassigned"}
                  </span>
                  {new Date(ticket.sla_deadline).getTime() < now &&
                    ["PENDING", "ASSIGNED", "IN_PROGRESS"].includes(
                      ticket.status,
                    ) && <small className="overdue-label">Past deadline</small>}
                </td>
              )}
              <td>
                <Link
                  className="row-open"
                  href={`/app/tickets/${ticket.ticket_id}`}
                  aria-label={`Open ${ticket.ticket_id}`}
                >
                  <ArrowUpRight size={17} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function TicketList({ user }: { user: User }) {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [query, setQuery] = useState(search);
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [faculty, setFaculty] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const params = new URLSearchParams({
    search: query,
    status,
    priority,
    faculty,
    page: String(page),
  });
  const resource = useResource<TicketListData>(
    `/api/tickets?${params}`,
    30_000,
  );
  return (
    <>
      <PageTitle
        eyebrow="REPORTS AND REPAIRS"
        title={
          isManager(user.role)
            ? "All reports"
            : user.role === "TECHNICIAN"
              ? "My work orders"
              : "My reports"
        }
        description={
          isManager(user.role)
            ? "Review, prioritise, and keep every repair moving."
            : "All the details. Every step of the way."
        }
      >
        {isReporter(user.role) && (
          <Button asChild>
            <Link href="/app/report">
              <Plus size={17} aria-hidden="true" />
              Report an issue
            </Link>
          </Button>
        )}
      </PageTitle>
      <div className="panel">
        <div className="list-toolbar">
          <div className="search-input">
            <Search size={17} aria-hidden="true" />
            <input
              aria-label="Search reports"
              placeholder="Search by report, ID, or building..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-controls">
            <select
              aria-label="Filter by status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {[
                "PENDING",
                "ASSIGNED",
                "IN_PROGRESS",
                "COMPLETED",
                "CLOSED",
                "DUPLICATE",
                "REJECTED",
              ].map((item) => (
                <option key={item} value={item}>
                  {label(item)}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by priority"
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All priorities</option>
              {["P1_CRITICAL", "P2_URGENT", "P3_ROUTINE"].map((item) => (
                <option key={item} value={item}>
                  {label(item)}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter by faculty"
              value={faculty}
              onChange={(e) => {
                setFaculty(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All faculties</option>
              {Object.entries(facultyLabel).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {resource.error ? (
          <Notice>{resource.error}</Notice>
        ) : !resource.data ? (
          <Loading />
        ) : resource.data.tickets.length ? (
          <TicketTable tickets={resource.data.tickets} />
        ) : (
          <Empty
            title="No matching reports"
            text="Try another search or filter."
          />
        )}
        <div className="table-footer">
          <span>
            {resource.data?.total ?? 0} report(s)
            <span className="muted"> · Page {page}</span>
          </span>
          <div>
            <Button
              variant="outline"
              size="sm"
              aria-label="Previous page"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={16} />
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="Next page"
              disabled={!resource.data || page * 25 >= resource.data.total}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </div>
      <div className="subtle-note">
        <ShieldCheck size={16} aria-hidden="true" />
        You can view only the reports allowed by your account.
      </div>
    </>
  );
}
function Team({ reference }: { reference: ReferenceData }) {
  return (
    <>
      <PageTitle
        eyebrow="PEOPLE BEHIND THE REPAIRS"
        title="Maintenance team"
        description="The right skills, ready to help."
      />
      <div className="team-grid">
        {reference.technicians.map((tech) => (
          <div className="panel team-card" key={tech.tech_id}>
            <span className="avatar avatar-large">
              {tech.full_name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </span>
            <h2>{tech.full_name}</h2>
            <p>{label(tech.trade_specialty)}</p>
            <span
              className={`availability ${tech.is_available && tech.is_active ? "available" : ""}`}
            >
              <span />
              {tech.is_available && tech.is_active
                ? "Available"
                : "Unavailable"}
            </span>
            <div className="team-workload">
              <strong>{tech.active_workload}</strong> active work order(s)
            </div>
          </div>
        ))}
      </div>
      <p className="subtle-note">
        Administrators can change technician availability from Accounts.
      </p>
    </>
  );
}
function Notifications({ refresh }: { refresh: () => void }) {
  const resource = useResource<Notification[]>("/api/notifications", 20_000);
  const [error, setError] = useState("");
  return (
    <>
      <PageTitle
        eyebrow="STAY IN THE LOOP"
        title="Notifications"
        description="The latest news about your reports."
      >
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await api("/api/notifications", { method: "PATCH" });
              resource.refresh();
              refresh();
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Could not mark notifications as read.",
              );
            }
          }}
        >
          <CheckCheck size={16} aria-hidden="true" />
          Mark all as read
        </Button>
      </PageTitle>
      {(error || resource.error) && <Notice>{error || resource.error}</Notice>}
      <section className="panel notifications-list">
        {!resource.data ? (
          <Loading />
        ) : resource.data.length ? (
          resource.data.map((item) => (
            <Link
              className={`notification-item ${!item.read_at ? "unread" : ""}`}
              href={`/app/tickets/${item.ticket_id}`}
              key={item.notification_id}
            >
              <span className="activity-icon">
                <Bell size={18} aria-hidden="true" />
              </span>
              <div>
                <h2>{item.title}</h2>
                <p>{item.body}</p>
                <small>
                  {item.ticket_id} · {formatDate(item.created_at)}
                </small>
              </div>
              {!item.read_at && <span className="unread-label">Unread</span>}
              <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          ))
        ) : (
          <Empty
            title="You are all caught up"
            text="New report updates will appear here when in-app notifications are on."
          />
        )}
      </section>
    </>
  );
}
