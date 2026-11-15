import { CERTIFICATE_PERMISSIONS } from "./access.ts";

export const BA_STEP_UP_ACTIONS = {
  "ba.certificates.issue": CERTIFICATE_PERMISSIONS.issue,
  "ba.certificates.revoke": CERTIFICATE_PERMISSIONS.revoke,
  "ba.certificates.delete": CERTIFICATE_PERMISSIONS.delete,
} as const;

export type BaStepUpAction = keyof typeof BA_STEP_UP_ACTIONS;

export const BA_STEP_UP_ACTION_LABELS: Record<BaStepUpAction, string> = {
  "ba.certificates.issue": "证书核发",
  "ba.certificates.revoke": "证书吊销",
  "ba.certificates.delete": "证书删除",
};

export function isBaStepUpAction(value: string): value is BaStepUpAction {
  return value in BA_STEP_UP_ACTIONS;
}

export function stepUpAuditTarget(resourceId: string): {
  targetId: string | null;
  targetRef: string;
} {
  return {
    targetId: resourceId === "new" ? null : resourceId,
    targetRef: resourceId,
  };
}
