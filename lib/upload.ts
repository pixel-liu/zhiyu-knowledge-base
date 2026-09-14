// Client-side helpers for the R2-backed /api/upload route.

/** Upload a file and return its public URL. */
export const uploadFile = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    throw new Error("Failed to upload file");
  }

  const data = (await res.json()) as { url: string };
  return data.url;
};

/** Delete a previously uploaded file by its public URL. */
export const deleteFile = async (url: string): Promise<void> => {
  await fetch("/api/upload", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
};
