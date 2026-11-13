import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { sql } from "@/lib/db";
import { certificateErrorResponse } from "@/lib/internal-certificate-request";
import { ensureCertificateArtifact } from "@/lib/certificate/service";
import type { ResolvedInternalActor } from "@/lib/internal-actor";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { user, response } = await requireAdmin(request);
  if (response || !user) return response!;
  const { id } = await params;
  const format =
    new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "png";

  const actor: ResolvedInternalActor = {
    profileId: user.id,
    externalAdminId: user.external_admin_id || user.id,
    email: user.username || null,
    name: user.full_name || null,
    role: user.role,
    capabilities: new Set(["ba.certificates.download"]),
  };

  try {
    const result = await ensureCertificateArtifact({
      actor,
      id,
      format,
      request,
    });
    await writeAudit(sql, {
      actor: {
        id: user.id,
        role: user.role,
        name: user.full_name || null,
        source: "ba",
        externalId: user.external_admin_id || null,
      },
      action: "DOWNLOAD_CERTIFICATE",
      targetType: "certificate",
      targetId: id,
      certificateId: id,
      certificateRef: id,
      comment: `下载证书文件 ${format}`,
      after: { format, storageKey: result.storageKey },
      request,
    }).catch(() => {});

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Length": String(result.buffer.byteLength),
        "Content-Disposition": `attachment; filename="${id}.${format}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return certificateErrorResponse(error);
  }
}
