import type { Category, Location, Technician, Ticket } from "@/lib/domain";
export interface ReferenceData {
  categories: Category[];
  locations: Location[];
  technicians: Technician[];
  storageDriver: string;
  demoMode: boolean;
}
export interface Activity {
  audit_id: string;
  event_code: string;
  details: string;
  ticket_id: string;
  created_at: string;
  full_name: string | null;
}
export interface DashboardData {
  counts: {
    total: number;
    active: number;
    pending: number;
    completed: number;
    overdue: number;
    critical: number;
  };
  recent: Ticket[];
  activity: Activity[];
  categories: { category_name: string; count: number }[];
  unread: number;
}
export interface TicketListData {
  tickets: Ticket[];
  total: number;
  page: number;
  pageSize: number;
}
export interface Notification {
  notification_id: string;
  ticket_id: string;
  event_code: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}
