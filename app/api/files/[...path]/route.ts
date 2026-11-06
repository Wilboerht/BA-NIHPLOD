import fs from 'fs/promises';
import nodePath from 'path';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { resolveStorageFilePath } from '@/lib/storage';
import { isUuid } from '@/lib/validation';

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

const FILE_PATTERN = /^([0-9a-f-]{36})\.(png|jpe?g|gif|webp)$/i;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { response } = await requireAdmin(req);
    if (response) return response;

    const { path: segments } = await params;
    if (!segments || segments.length !== 2 || segments[0] !== 'complaints') {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 });
    }

    const fileName = segments[1];
    const match = FILE_PATTERN.exec(fileName);
    if (!match || !isUuid(match[1])) {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 });
    }

    const fullPath = resolveStorageFilePath('private', 'complaints', fileName);
    if (!fullPath) {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 });
    }

    let stat;
    try {
      stat = await fs.stat(fullPath);
    } catch {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 });
    }
    if (!stat.isFile()) {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 });
    }

    const ext = nodePath.extname(fileName).slice(1).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';
    const buffer = await fs.readFile(fullPath);
    const download = new URL(req.url).searchParams.get('download') === '1';

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(buffer.byteLength),
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${fileName}"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    console.error('[files] 读取证据失败:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: '文件读取失败' }, { status: 500 });
  }
}
