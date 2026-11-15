import { NextResponse } from "next/server";
import {
  InternalActorError,
  readInternalActorFromRequest,
  resolveInternalActor,
  type ResolvedInternalActor,
} from "@/lib/internal-actor";

export type RequestActorResult =
  | { ok: true; actor: ResolvedInternalActor }
  | { ok: false; response: NextResponse };

export async function resolveRequestActor(
  request: Request,
  requiredCapability?: string
): Promise<RequestActorResult> {
  try {
    const actor = await resolveInternalActor(
      readInternalActorFromRequest(request),
      requiredCapability
    );
    return { ok: true, actor };
  } catch (error) {
    if (error instanceof InternalActorError) {
      return {
        ok: false,
        response: NextResponse.json(
          { success: false, error: { code: error.code, message: error.message } },
          { status: error.status, headers: { "Cache-Control": "no-store" } }
        ),
      };
    }
    throw error;
  }
}
