import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uploadDirectory = path.join(process.cwd(), "public", "uploads");
const maxFileSize = 15 * 1024 * 1024;

const extensionFor = (file: File) => {
  const extension = path.extname(file.name).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : ".bin";
};

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ message: "未提供文件" }, { status: 400 });
  if (!file.type.startsWith("image/")) return NextResponse.json({ message: "只支持图片文件" }, { status: 415 });
  if (file.size > maxFileSize) return NextResponse.json({ message: "图片不能超过 15 MB" }, { status: 413 });

  await mkdir(uploadDirectory, { recursive: true });
  const filename = `${randomUUID()}${extensionFor(file)}`;
  await writeFile(path.join(uploadDirectory, filename), Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ url: `/uploads/${filename}` });
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({})) as { url?: string };
  if (!body.url) return NextResponse.json({ message: "无效的文件地址" }, { status: 400 });
  let pathname: string;
  try { pathname = new URL(body.url, request.url).pathname; } catch { return NextResponse.json({ message: "无效的文件地址" }, { status: 400 }); }
  if (!pathname.startsWith("/uploads/") || path.basename(pathname) !== pathname.slice("/uploads/".length)) {
    return NextResponse.json({ message: "无效的文件地址" }, { status: 400 });
  }
  await unlink(path.join(uploadDirectory, path.basename(pathname))).catch(() => undefined);
  return new NextResponse(null, { status: 204 });
}
