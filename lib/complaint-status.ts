export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["INVESTIGATING", "RESOLVED", "REJECTED"],
  INVESTIGATING: ["RESOLVED", "REJECTED"],
  RESOLVED: [],
  REJECTED: [],
};

export function canTransitionComplaintStatus(from: string, to: string): boolean {
  return (VALID_STATUS_TRANSITIONS[from] || []).includes(to);
}
