import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import QRCode from "qrcode";
import {
  createCanvas,
  GlobalFonts,
  loadImage,
  type Image,
  type SKRSContext2D,
} from "@napi-rs/canvas";

export const CERTIFICATE_TEMPLATE_VERSION = "2026-11-13.1";

export type CertificateVariant = "ISSUED" | "REVOKED" | "EXPIRED" | "PREVIEW";

export interface CertificateRenderInput {
  certNumber: string;
  companyName: string;
  shopName: string;
  scopeText: string;
  startDate: string;
  endDate: string;
  authorizer: string;
  sealImage?: string | null;
  variant: CertificateVariant;
  includeQrCode?: boolean;
}

export interface CertificateRenderResult {
  buffer: Buffer;
  width: number;
  height: number;
  templateSha256: string;
  sealSha256: string | null;
}

let fontsRegistered = false;

function registerFontsOnce(): void {
  if (fontsRegistered) return;
  const root = process.cwd();
  GlobalFonts.registerFromPath(
    path.join(root, "assets", "fonts", "NotoSerifSC-Regular.otf"),
    "Noto Serif SC",
  );
  GlobalFonts.registerFromPath(
    path.join(root, "assets", "fonts", "NotoSerifSC-Bold.otf"),
    "Noto Serif SC",
  );
  fontsRegistered = true;
}

function ensureInside(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(target);
  return (
    resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep)
  );
}

async function resolveAssetSource(
  source: string | null | undefined,
): Promise<string | null> {
  if (!source || source === "undefined") return null;
  if (source.startsWith("data:")) return source;
  if (/^https?:\/\//i.test(source)) {
    try {
      source = new URL(source).pathname;
    } catch {
      return null;
    }
  }
  if (source === "/default-seal.png") {
    return path.join(process.cwd(), "public", "default-seal.png");
  }
  if (source === "/cert-template.webp") {
    return path.join(process.cwd(), "public", "cert-template.webp");
  }
  if (source.startsWith("/uploads/")) {
    const root =
      process.env.PUBLIC_UPLOAD_ROOT ||
      path.join(process.cwd(), "public", "uploads");
    const full = path.join(root, source.slice("/uploads/".length));
    return ensureInside(root, full) ? full : null;
  }
  return null;
}

async function loadOptionalImage(
  source: string | null | undefined,
): Promise<Image | null> {
  const resolved = await resolveAssetSource(source);
  if (!resolved) return null;
  try {
    return await loadImage(resolved);
  } catch {
    return null;
  }
}

async function hashFile(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function formatDate(value: string): string {
  const normalized = value.replace(/\./g, "-");
  const [year, month, day] = normalized.split("-");
  return year && month && day ? `${year}年${month}月${day}日` : value;
}

function wrapText(
  ctx: SKRSContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let current = "";
  for (const char of text.split("")) {
    const next = current + char;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = char;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function parseMarkdownBold(
  line: string,
): Array<{ text: string; bold: boolean }> {
  const parts: Array<{ text: string; bold: boolean }> = [];
  const regex = /\*\*(.*?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: line.slice(lastIndex, match.index), bold: false });
    }
    parts.push({ text: match[1], bold: true });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < line.length) {
    parts.push({ text: line.slice(lastIndex), bold: false });
  }
  return parts.length > 0 ? parts : [{ text: line, bold: false }];
}

export async function renderCertificatePng(
  input: CertificateRenderInput,
): Promise<CertificateRenderResult> {
  registerFontsOnce();

  const scale = 2;
  const width = 800 * scale;
  const height = 1131 * scale;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const templatePath = path.join(process.cwd(), "public", "cert-template.webp");
  const templateSha256 = await hashFile(templatePath);
  const [background, seal] = await Promise.all([
    loadOptionalImage("/cert-template.webp").catch(() => null),
    input.sealImage
      ? loadOptionalImage(input.sealImage)
      : loadOptionalImage("/default-seal.png"),
  ]);
  const sealPath = await resolveAssetSource(
    input.sealImage || "/default-seal.png",
  );
  const sealSha256 =
    sealPath && !sealPath.startsWith("data:") ? await hashFile(sealPath) : null;

  if (background) {
    ctx.drawImage(background, 0, 0, width, height);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }

  const textPrimary = "#334155";
  const leftMargin = 225 * scale;
  const maxTextWidth = width - leftMargin - 75 * scale;
  const serif = (size: number, weight: "400" | "500" | "bold") =>
    `${weight === "bold" ? "bold" : weight} ${size * scale}px "Noto Serif SC", serif`;

  let currentY = 515 * scale;
  const hasShop = Boolean(input.shopName);
  const hasCompany = Boolean(input.companyName);
  const shopLineH = 40 * scale;
  const companyLineH = hasCompany ? 40 * scale : 36 * scale;
  const totalNameBlockH = shopLineH + companyLineH;
  const nameBaseY = currentY;

  ctx.font = serif(22, "bold");
  ctx.fillStyle = "#1e293b";
  let shopY = nameBaseY;
  if (hasShop && !hasCompany) {
    shopY = nameBaseY + totalNameBlockH / 2 - shopLineH / 2 + 4 * scale;
  }
  let shopLineCount = 0;
  if (input.shopName) {
    const lines = wrapText(ctx, input.shopName, maxTextWidth);
    shopLineCount = lines.length;
    for (const line of lines) {
      ctx.fillText(line, leftMargin, shopY);
      shopY += shopLineH;
    }
  }
  currentY += Math.max(shopLineCount, 1) * shopLineH;

  let companyY = currentY;
  if (!hasShop && hasCompany) {
    companyY = nameBaseY + totalNameBlockH / 2 - companyLineH / 2 + 4 * scale;
  }
  let companyLineCount = 0;
  if (input.companyName) {
    const lines = wrapText(ctx, input.companyName, maxTextWidth);
    companyLineCount = lines.length;
    for (const line of lines) {
      ctx.fillText(line, leftMargin, companyY);
      companyY += companyLineH;
    }
  }
  currentY += Math.max(companyLineCount, 1) * companyLineH + 14 * scale;

  ctx.font = serif(15, "400");
  ctx.fillStyle = textPrimary;
  const scopeLines = (input.scopeText || "").split("\n");
  scopeLines.forEach((line, lineIndex) => {
    const trimmed = line.trim();
    if (!trimmed) {
      currentY += 22 * scale;
      return;
    }
    const parts = parseMarkdownBold(trimmed);
    const plainWidth = ctx.measureText(
      parts.map((part) => part.text).join(""),
    ).width;
    if (plainWidth <= maxTextWidth) {
      if (parts.some((part) => part.bold)) {
        let currentX = leftMargin;
        for (const part of parts) {
          ctx.font = serif(15, part.bold ? "bold" : "400");
          ctx.fillText(part.text, currentX, currentY);
          currentX += ctx.measureText(part.text).width;
        }
      } else {
        ctx.fillText(trimmed, leftMargin, currentY);
      }
      currentY += 32 * scale;
    } else {
      const chars: Array<{ text: string; bold: boolean }> = [];
      for (const part of parts) {
        for (const char of part.text)
          chars.push({ text: char, bold: part.bold });
      }
      const wrapped: Array<Array<{ text: string; bold: boolean }>> = [];
      let currentLine: Array<{ text: string; bold: boolean }> = [];
      let currentWidth = 0;
      for (const item of chars) {
        ctx.font = serif(15, item.bold ? "bold" : "400");
        const itemWidth = ctx.measureText(item.text).width;
        if (currentWidth + itemWidth > maxTextWidth && currentLine.length > 0) {
          wrapped.push(currentLine);
          currentLine = [item];
          currentWidth = itemWidth;
        } else {
          currentLine.push(item);
          currentWidth += itemWidth;
        }
      }
      if (currentLine.length > 0) wrapped.push(currentLine);
      for (const wrappedLine of wrapped) {
        let currentX = leftMargin;
        let index = 0;
        while (index < wrappedLine.length) {
          const isBold = wrappedLine[index].bold;
          let segment = "";
          while (
            index < wrappedLine.length &&
            wrappedLine[index].bold === isBold
          ) {
            segment += wrappedLine[index].text;
            index += 1;
          }
          ctx.font = serif(15, isBold ? "bold" : "400");
          ctx.fillText(segment, currentX, currentY);
          currentX += ctx.measureText(segment).width;
        }
        currentY += 32 * scale;
      }
    }
    if (lineIndex === 1) currentY += 22 * scale;
  });

  ctx.textAlign = "left";
  ctx.font = serif(15, "400");
  ctx.fillText(
    `授权有效期：${formatDate(input.startDate)} 至 ${formatDate(input.endDate)}`,
    leftMargin,
    currentY + 25 * scale,
  );
  currentY += 46 * scale;

  let sealCenterX = width - 260 * scale;
  let sealDrawWidth = 160 * scale;
  let sealDrawHeight = 160 * scale;
  if (seal) {
    const maxSealSize = 160 * scale;
    const aspect = seal.width / seal.height;
    sealDrawWidth = aspect > 1 ? maxSealSize : maxSealSize * aspect;
    sealDrawHeight = aspect > 1 ? maxSealSize / aspect : maxSealSize;
    sealCenterX = width - 210 * scale - sealDrawWidth / 2;
  }

  const qrSize = 100 * scale;
  const bottomAlignY = Math.min(currentY + 125 * scale, height - 30 * scale);

  ctx.textAlign = "right";
  ctx.font = serif(12, "400");
  ctx.fillStyle = "#666666";
  ctx.fillText(
    `证书号：${input.certNumber}`,
    width - 40 * scale,
    height - 30 * scale,
  );

  if (seal) {
    ctx.save();
    ctx.translate(sealCenterX, bottomAlignY - sealDrawHeight / 2 + 20 * scale);
    ctx.rotate(-0.06);
    ctx.globalAlpha = 0.88;
    ctx.drawImage(
      seal,
      -sealDrawWidth / 2,
      -sealDrawHeight / 2,
      sealDrawWidth,
      sealDrawHeight,
    );
    ctx.restore();
  }

  ctx.textAlign = "center";
  ctx.font = serif(14, "500");
  ctx.fillStyle = textPrimary;
  ctx.fillText(
    input.authorizer || "",
    sealCenterX,
    bottomAlignY - sealDrawHeight / 2 + 48 * scale,
  );

  if (input.includeQrCode !== false) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://ba.nihplod.cn";
    const qrBuffer = await QRCode.toBuffer(
      `${baseUrl}/verify?cert=${encodeURIComponent(input.certNumber)}`,
      {
        type: "png",
        width: 80,
        margin: 1,
        color: { dark: "#000000", light: "#ffffff" },
        errorCorrectionLevel: "M",
      },
    );
    const qrImage = await loadImage(qrBuffer);
    const qrX = leftMargin;
    const qrY = bottomAlignY - qrSize - 12 * scale;
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);
    ctx.font = serif(11, "500");
    ctx.fillStyle = "#666666";
    ctx.textAlign = "center";
    ctx.fillText("官方扫码验证", qrX + qrSize / 2, qrY + qrSize + 16 * scale);
  }

  if (input.variant !== "ISSUED") {
    const text =
      input.variant === "PREVIEW"
        ? "审核中 · 未核发"
        : input.variant === "REVOKED"
          ? "已作废"
          : "已失效";
    const color =
      input.variant === "PREVIEW"
        ? "rgba(217, 119, 6, 0.18)"
        : input.variant === "REVOKED"
          ? "rgba(220, 38, 38, 0.25)"
          : "rgba(100, 116, 139, 0.18)";
    ctx.save();
    ctx.rotate(-Math.PI / 4);
    ctx.textAlign = "center";
    ctx.font = serif(18, "bold");
    ctx.fillStyle = color;
    const stepX = 220 * scale;
    const stepY = 160 * scale;
    for (let x = -width; x < width * 2; x += stepX) {
      for (let y = -height; y < height * 2; y += stepY) {
        ctx.fillText(text, x, y);
      }
    }
    ctx.restore();
  }

  return {
    buffer: canvas.toBuffer("image/png"),
    width,
    height,
    templateSha256,
    sealSha256,
  };
}
