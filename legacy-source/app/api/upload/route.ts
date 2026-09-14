import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

import { r2, R2_BUCKET, keyFromUrl, publicUrl } from "@/lib/r2";

// Only the verified site owner may upload or delete images. The owner's email
// lives in the OWNER_EMAIL server env var and is never exposed to the client.
const isOwner = async () => {
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) {
    // Fail closed if the server isn't configured.
    return false;
  }
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  return !!email && email === ownerEmail;
};

// Uploads an image to Cloudflare R2 and returns its public URL.
export async function POST(req: Request) {
  if (!(await isOwner())) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return new NextResponse("No file provided", { status: 400 });
  }

  const ext = file.name.includes(".") ? `.${file.name.split(".").pop()}` : "";
  const key = `notes/${crypto.randomUUID()}${ext}`;
  const body = Buffer.from(await file.arrayBuffer());

  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: file.type || "application/octet-stream",
    })
  );

  return NextResponse.json({ url: publicUrl(key) });
}

// Deletes an image from R2 given its public URL.
export async function DELETE(req: Request) {
  if (!(await isOwner())) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { url } = (await req.json()) as { url?: string };
  const key = url ? keyFromUrl(url) : null;

  if (!key) {
    return new NextResponse("Invalid url", { status: 400 });
  }

  await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));

  return new NextResponse(null, { status: 204 });
}
