import { download, request } from "./client";
import type {
  AppNotification,
  Availability,
  Drive,
  DriveInput,
  Interview,
  OpenSlotsReport,
  Participants,
  RescheduleRequest,
  RescheduleResult,
  ReschedulePreview,
  Room,
  ScheduleReport,
  TimeWindow,
  User,
} from "./types";
import type { Role } from "../auth/roles";

const json = <T>(method: "POST" | "PUT", body?: unknown) => ({ method, body }) as { method: "POST" | "PUT"; body: T };

/** The only place that knows the backend's URLs. Everything else calls these functions. */
export const api = {
  auth: {
    login: (email: string, password: string, role: Role) =>
      request<{ token: string; user: User }>("/auth/login", json("POST", { email, password, role })),
    signup: (input: { name: string; email: string; password: string; role: Role; accessCode?: string }) =>
      request<{ token: string; user: User }>("/auth/signup", json("POST", input)),
    me: () => request<User>("/auth/me"),
    updateProfile: (input: { name?: string; phone?: string | null; skills?: string[] }) =>
      request<User>("/auth/me", json("PUT", input)),
  },

  drives: {
    list: () => request<Drive[]>("/drives"),
    get: (id: string) => request<Drive>(`/drives/${id}`),
    create: (input: DriveInput) => request<Drive>("/drives", json("POST", input)),
    update: (id: string, input: DriveInput) => request<Drive>(`/drives/${id}`, json("PUT", input)),
    remove: (id: string) => request<void>(`/drives/${id}`, { method: "DELETE" }),
    publish: (id: string) => request<Drive>(`/drives/${id}/publish`, json("POST")),
    unpublish: (id: string) => request<Drive>(`/drives/${id}/unpublish`, json("POST")),
    participants: (id: string) => request<Participants>(`/drives/${id}/participants`),
    join: (id: string) => request<void>(`/drives/${id}/join`, json("POST")),
    leave: (id: string) => request<void>(`/drives/${id}/join`, { method: "DELETE" }),
    getAvailability: (id: string) => request<Availability>(`/drives/${id}/availability`),
    setAvailability: (id: string, input: { maxInterviews?: number | null; windows: TimeWindow[] }) =>
      request<Availability>(`/drives/${id}/availability`, json("PUT", input)),
    generateSchedule: (id: string) => request<ScheduleReport>(`/drives/${id}/schedule`, json("POST")),
    latestRun: (id: string) => request<ScheduleReport | null>(`/drives/${id}/schedule/latest`),
    openSlots: (id: string) => request<OpenSlotsReport>(`/drives/${id}/open-slots`, json("POST")),
    eligibleSlots: (id: string) => request<Interview[]>(`/drives/${id}/slots`),
    previewReschedule: (id: string, input: RescheduleRequest) =>
      request<ReschedulePreview>(`/drives/${id}/reschedule/preview`, json("POST", input)),
    applyReschedule: (id: string, input: RescheduleRequest) =>
      request<RescheduleResult>(`/drives/${id}/reschedule/apply`, json("POST", input)),
  },

  interviews: {
    list: (driveId?: string) => request<Interview[]>(`/interviews${driveId ? `?driveId=${driveId}` : ""}`),
    /** One Idempotency-Key per click: a retried request can never book twice. */
    book: (id: string) =>
      request<Interview>(`/interviews/${id}/book`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
      }),
    cancelBooking: (id: string) => request<Interview>(`/interviews/${id}/cancel-booking`, json("POST")),
    downloadCalendar: (id: string) => download(`/interviews/${id}/calendar.ics`, "interview.ics"),
    downloadMyCalendar: () => download("/me/calendar.ics", "my-interviews.ics"),
  },

  rooms: {
    list: () => request<Room[]>("/rooms"),
    create: (input: { name: string; capacity: number }) => request<Room>("/rooms", json("POST", input)),
    update: (id: string, input: { name: string; capacity: number }) => request<Room>(`/rooms/${id}`, json("PUT", input)),
    remove: (id: string) => request<void>(`/rooms/${id}`, { method: "DELETE" }),
  },

  notifications: {
    list: () => request<{ items: AppNotification[]; unreadCount: number }>("/notifications"),
    markRead: (id: string) => request<void>(`/notifications/${id}/read`, json("POST")),
    markAllRead: () => request<void>("/notifications/read-all", json("POST")),
  },
};

export { ApiError, errorMessage, setUnauthorizedHandler } from "./client";
export type * from "./types";
