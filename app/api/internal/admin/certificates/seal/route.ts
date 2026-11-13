import crypto from "crypto";
import { NextResponse } from "next/server";
import {
  authenticateCertificateRequest,
  certificateErrorResponse,
} from "@/lib/internal-certificate-request";
import { uploadFile, getPublicUrl, validateFileMagic } from "@/lib/storage";
import { writeAudit } from "@/lib/audit";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const CONTENT_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function POST(request: Request) {
  const path = "/api/internal/admin/certificates/seal";
  const auth = await authenticateCertificateRequest(
    request,
    path,
    "POST",
    "ba.certificates.issue",
    MAX_BYTES * 2,
  );
  if (!auth.ok) return auth.response;

  try {
    const contentType = String(auth.body.contentType || "");
    const extension = CONTENT_TYPES[contentType];
    if (!extension) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_TYPE", message: "签章仅支持 PNG/JPEG/WebP" },
        },
        { status: 400 },
      );
    }
    const base64 = String(auth.body.dataBase64 || "");
    if (!base64 || base64.length > Math.ceil((MAX_BYTES * 4) / 3) + 8) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_SIZE", message: "签章文件过大或为空" },
        },
        { status: 400 },
      );
    }
    const buffer = Buffer.from(base64, "base64");
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_SIZE", message: "签章文件过大或为空" },
        },
        { status: 400 },
      );
    }
    if (!validateFileMagic(buffer, contentType)) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_FILE", message: "签章文件类型与声明不符" },
        },
        { status: 400 },
      );
    }

    const fileName = `${crypto.randomUUID()}.${extension}`;
    const uploaded = await uploadFile(
      "certificates",
      fileName,
      buffer,
      contentType,
      "public",
    );
    if (uploaded.error) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "UPLOAD_FAILED", message: "签章上传失败" },
        },
        { status: 500 },
      );
    }
    const url = getPublicUrl("certificates", uploaded.path);
    await writeAudit(sql, {
      actor: {
        id: auth.actor.profileId,
        role: auth.actor.role,
        name: auth.actor.name,
        source: "main",
        externalId: auth.actor.externalAdminId,
      },
      action: "UPLOAD_CERTIFICATE_SEAL",
      targetType: "file",
      targetRef: url,
      comment: "主站上传证书签章",
      after: { url, contentType, size: buffer.byteLength },
      request,
    }).catch(() => {});
    return NextResponse.json({ success: true, data: { url } });
  } catch (error) {
    return certificateErrorResponse(error);
  }
}
