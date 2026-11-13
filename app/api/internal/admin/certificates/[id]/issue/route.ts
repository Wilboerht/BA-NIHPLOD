import { NextResponse } from "next/server";
import {
  authenticateCertificateRequest,
  certificateErrorResponse,
} from "@/lib/internal-certificate-request";
import { readIdempotencyKey, runIdempotent } from "@/lib/internal-idempotency";
import {
  issuePendingCertificate,
  type CertificateDraft,
} from "@/lib/certificate/service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const path = `/api/internal/admin/certificates/${id}/issue`;
  const auth = await authenticateCertificateRequest(
    request,
    path,
    "POST",
    "ba.certificates.issue",
  );
  if (!auth.ok) return auth.response;
  const draft = auth.body.draft as CertificateDraft | undefined;
  try {
    const result = await runIdempotent(
      {
        key: readIdempotencyKey(request, auth.body.idempotencyKey),
        project: "ba",
        action: "certificate.issue",
        actorExternalId: auth.actor.externalAdminId,
        request: { path, method: "POST", body: auth.body },
      },
      async () => ({
        status: 200,
        body: {
          success: true,
          data: await issuePendingCertificate({
            actor: auth.actor,
            id,
            draft: draft && typeof draft === "object" ? draft : undefined,
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
