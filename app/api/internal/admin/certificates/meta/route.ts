import { NextResponse } from "next/server";
import {
  authenticateCertificateRequest,
  certificateErrorResponse,
} from "@/lib/internal-certificate-request";
import { getCertificateMeta } from "@/lib/certificate/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const path = "/api/internal/admin/certificates/meta";
  const auth = await authenticateCertificateRequest(
    request,
    path,
    "GET",
    "ba.certificates.read",
  );
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ success: true, data: getCertificateMeta() });
  } catch (error) {
    return certificateErrorResponse(error);
  }
}
