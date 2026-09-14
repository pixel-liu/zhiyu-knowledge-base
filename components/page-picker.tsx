"use client";

import { File } from "lucide-react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { usePagePicker } from "@/hooks/use-page-picker";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

// Command-palette modal for picking an existing page to link to.
// Driven by the use-page-picker store so the editor can open it with a callback.
export const PagePicker = () => {
  const { isOpen, onSelect, close } = usePagePicker();
  const documents = useQuery(api.documents.getSearch);

  const handleSelect = (documentId: string) => {
    try {
      onSelect?.(documentId);
    } finally {
      close();
    }
  };

  return (
    <CommandDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <CommandInput placeholder="Link to a page..." />
      <CommandList>
        <CommandEmpty>No pages found.</CommandEmpty>
        <CommandGroup heading="Pages">
          {documents?.map((document) => (
            <CommandItem
              key={document._id}
              value={`${document._id}-${document.title}`}
              title={document.title}
              onSelect={() => handleSelect(document._id)}
            >
              {document.icon ? (
                <p className="mr-2 text-[18px]">{document.icon}</p>
              ) : (
                <File className="mr-2 h-4 w-4" />
              )}
              {document.title}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};
