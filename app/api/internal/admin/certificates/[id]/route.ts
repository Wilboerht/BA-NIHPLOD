import { NextResponse } from "next/server";
import {
  authenticateCertificateRequest,
  certificateErrorResponse,
} from "@/lib/internal-certificate-request";
import { readIdempotencyKey, runIdempotent } from "@/lib/internal-idempotency";
import {
  getCertificate,
  updatePendingCertificate,
  type CertificateDraft,
} from "@/lib/certificate/service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const path = `/api/internal/admin/certificates/${id}`;
  const auth = await authenticateCertificateRequest(
    request,
    path,
    "GET",
    "ba.certificates.read",
  );
  if (!auth.ok) return auth.response;
  try {
    const result = await getCertificate({
      actor: auth.actor,
      id,
      includeSensitive: auth.actor.capabilities.has(
        "ba.certificates.sensitive",
      ),
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return certificateErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const path = `/api/internal/admin/certificates/${id}`;
  const auth = await authenticateCertificateRequest(
    request,
    path,
    "PATCH",
    "ba.certificates.update",
  );
  if (!auth.ok) return auth.response;
  const draft = auth.body.draft as CertificateDraft | undefined;
  if (!draft || typeof draft !== "object") {
    return NextResponse.json(
      {
        success: false,
        error: { code: "INVALID_DRAFT", message: "证书数据无效" },
      },
      { status: 400 },
    );
  }
  try {
    const result = await runIdempotent(
      {
        key: readIdempotencyKey(request, auth.body.idempotencyKey),
        project: "ba",
        action: "certificate.update",
        actorExternalId: auth.actor.externalAdminId,
        request: { path, method: "PATCH", body: auth.body },
      },
      async () => ({
        status: 200,
        body: {
          success: true,
          data: await updatePendingCertificate({
            actor: auth.actor,
            id,
            draft,
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
