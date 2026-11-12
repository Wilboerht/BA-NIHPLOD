import fs from "fs/promises";
import nodePath from "path";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { verifyEvidenceToken } from "@/lib/evidence-token";
import { resolveStorageFilePath } from "@/lib/storage";
import { isUuid } from "@/lib/validation";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

const FILE_PATTERN = /^([0-9a-f-]{36})\.(png|jpe?g|gif|webp)$/i;

function extractFileName(url: string): string | null {
  const pathname = (() => {
    try {
      return new URL(url, "https://ba.nihplod.cn").pathname;
    } catch {
      return url;
    }
  })();
  const marker = "/api/files/complaints/";
  if (pathname.startsWith(marker)) return pathname.slice(marker.length);
  const base = nodePath.basename(pathname);
  return base || null;
}

// GET /api/evidence/complaints/[id]/[index]?exp=&token=
// 主站管理员通过短时签名 URL 直接加载举报证据图片。
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; index: string }> }
) {
  const { id, index: indexRaw } = await params;
  const index = Number(indexRaw);
  const { searchParams } = new URL(request.url);
  const exp = Number(searchParams.get("exp") || 0);
  const token = searchParams.get("token") || "";

  if (!isUuid(id) || !Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!verifyEvidenceToken(id, index, exp, token)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const rows = await sql`
      SELECT evidence_image_urls, evidence_image_url
      FROM complaints
      WHERE id = ${id} AND deleted_at IS NULL
      LIMIT 1
    `;
    if (rows.length === 0) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const urls = Array.isArray(rows[0].evidence_image_urls)
      ? (rows[0].evidence_image_urls as unknown[]).filter(
          (item): item is string => typeof item === "string" && item.length > 0
        )
      : [];
    const legacy =
      typeof rows[0].evidence_image_url === "string" && rows[0].evidence_image_url
        ? rows[0].evidence_image_url
        : null;

    const rawUrl = index < urls.length ? urls[index] : index === urls.length ? legacy : null;
    const fileName = rawUrl ? extractFileName(rawUrl) : null;
    if (!fileName || !FILE_PATTERN.test(fileName)) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const fullPath = resolveStorageFilePath("private", "complaints", fileName);
    if (!fullPath) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(fullPath);
    } catch {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const ext = nodePath.extname(fileName).slice(1).toLowerCase();
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "cross-origin",
      },
    });
  } catch (error) {
    logger.error("[Evidence] read failed", { error: String(error) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
