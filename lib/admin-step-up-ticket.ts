import { getAdminSsoConfig } from "@/lib/admin-sso";
import {
  verifyAdminStepUpTicketWithConfig,
  type AdminStepUpClaims as Claims,
  type AdminStepUpVerifyConfig as VerifyConfig,
} from "./admin-step-up-ticket-core";

export {
  AdminStepUpTicketError,
  stepUpClaimMismatch,
  type AdminStepUpClaims,
  type AdminStepUpVerifyConfig,
  type StepUpClaimMismatch,
  type StepUpRequestBinding,
} from "./admin-step-up-ticket-core";

export const ADMIN_STEP_UP_AUDIENCE =
  process.env.ADMIN_STEP_UP_AUDIENCE?.trim() || "ba-admin-stepup";

export async function verifyAdminStepUpTicket(
  ticket: string,
  config: VerifyConfig = getAdminSsoConfig(),
  audience: string = ADMIN_STEP_UP_AUDIENCE
): Promise<Claims> {
  return verifyAdminStepUpTicketWithConfig(ticket, config, audience);
}
