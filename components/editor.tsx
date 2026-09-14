"use client";

import {
  BlockNoteSchema,
  defaultBlockSpecs,
  filterSuggestionItems,
  PartialBlock,
} from "@blocknote/core";
import {
  createReactBlockSpec,
  DefaultReactSuggestionItem,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { uploadFile } from "@/lib/upload";
import { usePagePicker } from "@/hooks/use-page-picker";

// Renders a linked page as a Notion-style card: the linked note's live icon +
// title, clickable to open it.
const PageLinkRender = ({ documentId }: { documentId: string }) => {
  const router = useRouter();
  const document = useQuery(
    api.documents.getById,
    documentId ? { documentId: documentId as Id<"documents"> } : "skip"
  );

  return (
    <div
      contentEditable={false}
      onClick={() => documentId && router.push(`/documents/${documentId}`)}
      className="group/page flex items-center gap-x-2 my-1 w-full cursor-pointer rounded-md border bg-muted/40 px-2 py-1.5 transition hover:bg-muted"
    >
      <span className="text-lg leading-none">{document?.icon ?? "📄"}</span>
      <span className="truncate text-sm font-medium underline-offset-2 group-hover/page:underline">
        {document === undefined
          ? "Loading…"
          : document === null
            ? "Untitled"
            : document.title}
      </span>
    </div>
  );
};

// Void custom block storing just the linked document id.
const pageLinkSpec = createReactBlockSpec(
  {
    type: "pageLink",
    propSchema: { documentId: { default: "" } },
    content: "none",
  },
  {
    render: ({ block }) => (
      <PageLinkRender documentId={block.props.documentId as string} />
    ),
  }
)();

const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    pageLink: pageLinkSpec,
  },
});

interface EditorProps {
  onChange: (value: string) => void;
  initialContent?: string;
  editable?: boolean;
  documentId?: Id<"documents">;
}

const Editor = ({
  onChange,
  initialContent,
  editable,
  documentId,
}: EditorProps) => {
  const { resolvedTheme } = useTheme();
  const create = useMutation(api.documents.create);
  const openPicker = usePagePicker((store) => store.open);

  const editor = useCreateBlockNote({
    schema,
    initialContent: initialContent
      ? (JSON.parse(initialContent) as PartialBlock<typeof schema.blockSchema>[])
      : undefined,
    uploadFile,
  });

  // Replaces the "/" block with a page-link card. We capture the reference block
  // up-front (in the slash item click) so insertion still works after a focus
  // change (e.g. the picker modal stealing focus).
  const insertPageLinkAt = (
    linkedId: string,
    referenceBlock: Parameters<typeof editor.replaceBlocks>[0][number]
  ) => {
    editor.replaceBlocks(
      [referenceBlock],
      [{ type: "pageLink", props: { documentId: linkedId } }]
    );
  };

  const getSlashItems = async (
    query: string
  ): Promise<DefaultReactSuggestionItem[]> => {
    const pageItems: DefaultReactSuggestionItem[] = [
      {
        title: "New subpage",
        subtext: "Create a page nested inside this one",
        group: "Pages",
        icon: <FileText size={18} />,
        onItemClick: () => {
          const ref = editor.getTextCursorPosition().block;
          create({ title: "Untitled", parentDocument: documentId }).then(
            (newId) => insertPageLinkAt(newId, ref)
          );
        },
      },
      {
        title: "Link to page",
        subtext: "Link an existing page",
        group: "Pages",
        icon: <FileText size={18} />,
        onItemClick: () => {
          const ref = editor.getTextCursorPosition().block;
          openPicker((linkedId) => insertPageLinkAt(linkedId, ref));
        },
      },
    ];

    return filterSuggestionItems(
      [...getDefaultReactSlashMenuItems(editor), ...pageItems],
      query
    );
  };

  return (
    <div className="pt-4">
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        slashMenu={false}
        onChange={() => {
          onChange(JSON.stringify(editor.document, null, 2));
        }}
      >
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={getSlashItems}
        />
      </BlockNoteView>
    </div>
  );
};

export default Editor;
