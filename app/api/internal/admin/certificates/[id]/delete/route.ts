import { NextResponse } from "next/server";
import {
  authenticateCertificateRequest,
  certificateErrorResponse,
} from "@/lib/internal-certificate-request";
import { readIdempotencyKey, runIdempotent } from "@/lib/internal-idempotency";
import { deleteCertificate } from "@/lib/certificate/service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const path = `/api/internal/admin/certificates/${id}/delete`;
  const auth = await authenticateCertificateRequest(
    request,
    path,
    "POST",
    "ba.certificates.delete",
  );
  if (!auth.ok) return auth.response;
  try {
    const result = await runIdempotent(
      {
        key: readIdempotencyKey(request, auth.body.idempotencyKey),
        project: "ba",
        action: "certificate.delete",
        actorExternalId: auth.actor.externalAdminId,
        request: { path, method: "POST", body: auth.body },
      },
      async () => {
        await deleteCertificate({
          actor: auth.actor,
          id,
          reason: String(auth.body.reason ?? ""),
          request,
        });
        return { status: 200, body: { success: true } };
      },
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return certificateErrorResponse(error);
  }
}
