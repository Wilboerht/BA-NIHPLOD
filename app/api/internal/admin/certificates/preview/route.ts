import { NextResponse } from "next/server";
import {
  authenticateCertificateRequest,
  certificateErrorResponse,
} from "@/lib/internal-certificate-request";
import {
  previewCertificate,
  type CertificateDraft,
} from "@/lib/certificate/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const path = "/api/internal/admin/certificates/preview";
  const auth = await authenticateCertificateRequest(
    request,
    path,
    "POST",
    "ba.certificates.read",
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
    const result = await previewCertificate({ actor: auth.actor, draft });
    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Length": String(result.buffer.byteLength),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return certificateErrorResponse(error);
  }
}
