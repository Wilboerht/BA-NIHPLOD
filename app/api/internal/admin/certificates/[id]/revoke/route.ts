import { NextResponse } from "next/server";
import {
  authenticateCertificateRequest,
  certificateErrorResponse,
} from "@/lib/internal-certificate-request";
import { readIdempotencyKey, runIdempotent } from "@/lib/internal-idempotency";
import { revokeCertificate } from "@/lib/certificate/service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const path = `/api/internal/admin/certificates/${id}/revoke`;
  const auth = await authenticateCertificateRequest(
    request,
    path,
    "POST",
    "ba.certificates.revoke",
  );
  if (!auth.ok) return auth.response;
  try {
    const result = await runIdempotent(
      {
        key: readIdempotencyKey(request, auth.body.idempotencyKey),
        project: "ba",
        action: "certificate.revoke",
        actorExternalId: auth.actor.externalAdminId,
        request: { path, method: "POST", body: auth.body },
      },
      async () => ({
        status: 200,
        body: {
          success: true,
          data: await revokeCertificate({
            actor: auth.actor,
            id,
            reason: String(auth.body.reason ?? ""),
            request,
          }),
        },
      }),
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return certificateErrorResponse(error);
  }
}
