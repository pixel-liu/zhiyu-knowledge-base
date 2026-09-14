"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { PlusCircleIcon } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useIsOwner } from "@/hooks/use-is-owner";

const DocumentsPage = () => {
  const router = useRouter();
  const isOwner = useIsOwner();
  const create = useMutation(api.documents.create);

  const onCreate = () => {
    const promise = create({
      title: "Untitled",
    }).then((documentId) => router.push(`/documents/${documentId}`));

    toast.promise(promise, {
      loading: "Creating a new note...",
      success: "New note created!",
      error: "Failed to create a new note.",
    });
  };

  return (
    <div className="h-full flex flex-col items-center justify-center space-y-4">
      <Image
        src="/empty.png"
        height="300"
        width="300"
        alt="Empty"
        className="dark:hidden"
      />
      <Image
        src="/empty-dark.png"
        height="300"
        width="300"
        alt="Empty"
        className="hidden dark:block"
      />
      {isOwner ? (
        <>
          <h2 className="text-lg font-medium">Welcome back</h2>
          <Button onClick={onCreate}>
            <PlusCircleIcon className="h-4 w-4 mr-2" /> Create a note
          </Button>
        </>
      ) : (
        <h2 className="text-lg font-medium text-muted-foreground">
          Pick a note from the sidebar to start reading.
        </h2>
      )}
    </div>
  );
};

export default DocumentsPage;
