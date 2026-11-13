import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { PDFDocument } from "pdf-lib";
import {
  CERTIFICATE_TEMPLATE_VERSION,
  renderCertificatePng,
  type CertificateRenderInput,
  type CertificateVariant,
} from "./render";

export type CertificateFormat = "png" | "pdf";

export interface StoredCertificateArtifact {
  storageKey: string;
  sha256: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  buffer: Buffer;
  templateSha256: string;
  sealSha256: string | null;
}

function artifactRoot(): string {
  const configured = process.env.CERTIFICATE_ARTIFACT_ROOT;
  return configured
    ? path.resolve(configured)
    : path.join(process.cwd(), "private", "certificates");
}

function ensureInside(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(target);
  return (
    resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep)
  );
}

export function certificateVariantForStatus(
  status: string,
): CertificateVariant {
  switch (status) {
    case "REVOKED":
      return "REVOKED";
    case "EXPIRED":
      return "EXPIRED";
    case "PENDING":
    case "REJECTED":
      return "PREVIEW";
    default:
      return "ISSUED";
  }
}

export function certificateArtifactStorageKey(
  certificateId: string,
  variant: CertificateVariant,
  format: CertificateFormat,
  templateVersion: string = CERTIFICATE_TEMPLATE_VERSION,
): string {
  return `${certificateId}/${variant}/${templateVersion}/${format}`;
}

async function buildPdf(png: Buffer): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const image = await pdf.embedPng(png);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const page = pdf.addPage([pageWidth, pageHeight]);
  const maxWidth = pageWidth - 28;
  const maxHeight = pageHeight - 28;
  const ratio = Math.min(maxWidth / image.width, maxHeight / image.height);
  const width = image.width * ratio;
  const height = image.height * ratio;
  page.drawImage(image, {
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height,
  });
  pdf.setTitle("NIHPLOD 品牌授权证书");
  pdf.setAuthor("NIHPLOD");
  pdf.setSubject("Brand authorization certificate");
  pdf.setCreationDate(new Date("2000-01-01T00:00:00.000Z"));
  pdf.setModificationDate(new Date("2000-01-01T00:00:00.000Z"));
  return Buffer.from(await pdf.save());
}

export async function renderAndStoreArtifact(
  certificateId: string,
  input: CertificateRenderInput,
  format: CertificateFormat,
): Promise<StoredCertificateArtifact> {
  const png = await renderCertificatePng(input);
  const buffer = format === "png" ? png.buffer : await buildPdf(png.buffer);
  const storageKey = certificateArtifactStorageKey(
    certificateId,
    input.variant,
    format,
    CERTIFICATE_TEMPLATE_VERSION,
  );
  const fullPath = path.join(artifactRoot(), storageKey);
  if (!ensureInside(artifactRoot(), fullPath)) {
    throw new Error("INVALID_ARTIFACT_PATH");
  }
  await fs.mkdir(path.dirname(fullPath), { recursive: true, mode: 0o700 });
  const tempPath = `${fullPath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, buffer, { mode: 0o600 });
  await fs.rename(tempPath, fullPath);
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  return {
    storageKey,
    sha256,
    byteSize: buffer.byteLength,
    width: format === "png" ? png.width : null,
    height: format === "png" ? png.height : null,
    buffer,
    templateSha256: png.templateSha256,
    sealSha256: png.sealSha256,
  };
}

export async function readArtifact(storageKey: string): Promise<Buffer> {
  const fullPath = path.join(artifactRoot(), storageKey);
  if (!ensureInside(artifactRoot(), fullPath)) {
    throw new Error("INVALID_ARTIFACT_PATH");
  }
  return fs.readFile(fullPath);
}

export async function deleteArtifact(storageKey: string): Promise<void> {
  const fullPath = path.join(artifactRoot(), storageKey);
  if (!ensureInside(artifactRoot(), fullPath)) return;
  await fs.unlink(fullPath).catch(() => {});
}

export function contentTypeForFormat(format: CertificateFormat): string {
  return format === "pdf" ? "application/pdf" : "image/png";
}
