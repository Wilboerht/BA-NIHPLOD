import { NextResponse } from "next/server";
import {
  authenticateCertificateRequest,
  certificateErrorResponse,
} from "@/lib/internal-certificate-request";
import { ensureCertificateArtifact } from "@/lib/certificate/service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const path = `/api/internal/admin/certificates/${id}/artifact`;
  const auth = await authenticateCertificateRequest(
    request,
    path,
    "GET",
    "ba.certificates.download",
  );
  if (!auth.ok) return auth.response;
  const format =
    new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "png";
  try {
    const result = await ensureCertificateArtifact({
      actor: auth.actor,
      id,
      format,
      request,
    });
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
