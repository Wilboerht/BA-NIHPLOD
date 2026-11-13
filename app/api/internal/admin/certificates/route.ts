import { NextResponse } from "next/server";
import {
  authenticateCertificateRequest,
  certificateErrorResponse,
} from "@/lib/internal-certificate-request";
import { readIdempotencyKey, runIdempotent } from "@/lib/internal-idempotency";
import {
  CertificateServiceError,
  createCertificate,
  listCertificates,
  type CertificateDraft,
} from "@/lib/certificate/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const path = "/api/internal/admin/certificates";
  const auth = await authenticateCertificateRequest(
    request,
    path,
    "GET",
    "ba.certificates.read",
  );
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  try {
    const result = await listCertificates({
      actor: auth.actor,
      page: Number(searchParams.get("page") || 1),
      pageSize: Number(searchParams.get("pageSize") || 20),
      status: searchParams.get("status") || "ALL",
      query: searchParams.get("q") || undefined,
      includeSensitive:
        searchParams.get("includeSensitive") === "true" &&
        auth.actor.capabilities.has("ba.certificates.sensitive"),
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return certificateErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const path = "/api/internal/admin/certificates";
  const auth = await authenticateCertificateRequest(
    request,
    path,
    "POST",
    "ba.certificates.submit",
  );
  if (!auth.ok) return auth.response;

  const mode = auth.body.mode === "issue" ? "issue" : "submit";
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
  if (
    mode === "issue" &&
    !auth.actor.capabilities.has("ba.certificates.issue")
  ) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "FORBIDDEN", message: "缺少证书核发权限" },
      },
      { status: 403 },
    );
  }

  try {
    const result = await runIdempotent(
      {
        key: readIdempotencyKey(request, auth.body.idempotencyKey),
        project: "ba",
        action: mode === "issue" ? "certificate.issue" : "certificate.submit",
        actorExternalId: auth.actor.externalAdminId,
        request: { path, method: "POST", body: auth.body },
      },
      async () => ({
        status: 200,
        body: {
          success: true,
          data: await createCertificate({
            actor: auth.actor,
            draft,
            issue: mode === "issue",
            request,
          }),
        },
      }),
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof CertificateServiceError)
      return certificateErrorResponse(error);
    return certificateErrorResponse(error);
  }
}
