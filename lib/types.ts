export type Priority = "critical" | "urgent" | "normal";

export type IncidentStatus =
  | "reported"
  | "classified"
  | "acknowledged"
  | "resolved"
  | "cancelled";

export type ResponderRole = "medical" | "security" | "warden" | "admin";

export interface Campus {
  id: string;
  name: string;
  code: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

export interface CampusLocation {
  id: string;
  campus_id: string;
  block: string | null;
  floor: string | null;
  label: string;
  lat: number | null;
  lng: number | null;
}

export interface Incident {
  id: string;
  campus_id: string | null;
  location_id: string | null;
  reporter_name: string | null;
  reporter_phone: string | null;
  is_anonymous: boolean;
  emergency_type: string;
  description: string | null;
  ai_priority: Priority | null;
  rule_priority: Priority | null;
  final_priority: Priority | null;
  ai_reasoning: string | null;
  status: IncidentStatus;
  reporter_lat: number | null;
  reporter_lng: number | null;
  created_at: string;
  classified_at: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  acknowledged_by: string | null;

  // Added in migration 0002
  photo_url: string | null;
  /** Set when this report duplicates an earlier one; null means it is primary. */
  duplicate_of: string | null;
  responder_lat: number | null;
  responder_lng: number | null;
  responder_eta_seconds: number | null;
  responder_name: string | null;
  on_my_way_at: string | null;
}

export type SafeWalkStatus =
  | "walking"
  | "safe"
  | "overdue"
  | "escalated"
  | "cancelled";

export interface SafeWalk {
  id: string;
  campus_id: string | null;
  person_name: string | null;
  person_phone: string | null;
  from_label: string | null;
  to_label: string | null;
  expected_minutes: number;
  started_at: string;
  due_at: string;
  checked_in_at: string | null;
  status: SafeWalkStatus;
  last_lat: number | null;
  last_lng: number | null;
  incident_id: string | null;
}

export interface IncidentEvent {
  id: string;
  incident_id: string;
  event_type: string;
  actor: string | null;
  note: string | null;
  created_at: string;
}

/** Emergency categories offered on the report screen. */
export const EMERGENCY_TYPES = [
  { value: "medical", label: "Medical", icon: "heart-pulse" },
  { value: "fire", label: "Fire", icon: "flame" },
  { value: "security", label: "Security", icon: "shield-alert" },
  { value: "accident", label: "Accident", icon: "car-front" },
  { value: "harassment", label: "Harassment", icon: "user-x" },
  { value: "other", label: "Other", icon: "circle-help" },
] as const;

export type EmergencyType = (typeof EMERGENCY_TYPES)[number]["value"];

/** Ordering used to combine the rule engine and the AI verdict. */
const PRIORITY_RANK: Record<Priority, number> = {
  normal: 0,
  urgent: 1,
  critical: 2,
};

/** Returns whichever priority is more severe. Never downgrades a rule hit. */
export function maxPriority(a: Priority | null, b: Priority | null): Priority {
  const left = a ?? "normal";
  const right = b ?? "normal";
  return PRIORITY_RANK[left] >= PRIORITY_RANK[right] ? left : right;
}

export const PRIORITY_STYLES: Record<
  Priority,
  { label: string; badge: string; dot: string; emoji: string }
> = {
  critical: {
    label: "CRITICAL",
    badge: "bg-red-600 text-white",
    dot: "bg-red-600",
    emoji: "🔴",
  },
  urgent: {
    label: "URGENT",
    badge: "bg-amber-500 text-white",
    dot: "bg-amber-500",
    emoji: "🟠",
  },
  normal: {
    label: "NORMAL",
    badge: "bg-green-600 text-white",
    dot: "bg-green-600",
    emoji: "🟢",
  },
};

export const STATUS_LABELS: Record<IncidentStatus, string> = {
  reported: "Reported",
  classified: "Dispatching",
  acknowledged: "Responder on the way",
  resolved: "Resolved",
  cancelled: "Cancelled",
};
