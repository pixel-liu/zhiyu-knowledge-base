"use client";

import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FileIcon, GripVertical } from "lucide-react";
import { Item } from "./item";
import { cn } from "@/lib/utils";
import { useIsOwner } from "@/hooks/use-is-owner";

interface DocumentListProps {
  parentDocumentId?: Id<"documents">;
  level?: number;
}

// A draggable wrapper around a sidebar Item. The whole row is the drag handle;
// a small distance threshold (see PointerSensor) keeps plain clicks navigating.
const SortableDoc = ({
  id,
  level,
  disabled,
  children,
}: {
  id: string;
  level: number;
  disabled: boolean;
  children: ReactNode;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group/drag relative", isDragging && "z-[99999] opacity-60")}
      {...(disabled ? {} : attributes)}
      {...(disabled ? {} : listeners)}
    >
      {!disabled && (
        <GripVertical
          style={{ left: `${level * 12}px` }}
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50 opacity-0 transition group-hover/drag:opacity-100"
        />
      )}
      {children}
    </div>
  );
};

export const DocumentList = ({
  parentDocumentId,
  level = 0,
}: DocumentListProps) => {
  const params = useParams();
  const router = useRouter();
  const isOwner = useIsOwner();
  const reorder = useMutation(api.documents.reorder);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const documents = useQuery(api.documents.getSidebar, {
    parentDocument: parentDocumentId,
  });

  // Local optimistic copy so a drag reflects instantly; resynced from the
  // reactive query (which re-sorts by the persisted order) whenever it changes.
  const [ordered, setOrdered] = useState<Doc<"documents">[] | null>(null);
  useEffect(() => {
    if (documents) setOrdered(documents);
  }, [documents]);
  const list = ordered ?? documents ?? [];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const onExpand = (documentId: string) => {
    setExpanded((prev) => ({ ...prev, [documentId]: !prev[documentId] }));
  };

  const onRedirect = (documentId: string) => {
    router.push(`/documents/${documentId}`);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = list.findIndex((d) => d._id === active.id);
    const newIndex = list.findIndex((d) => d._id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(list, oldIndex, newIndex);
    setOrdered(next);
    reorder({ documentIds: next.map((d) => d._id) });
  };

  if (documents === undefined) {
    return (
      <>
        <Item.Skeleton level={level} />
        {level === 0 && (
          <>
            <Item.Skeleton level={level} />
            <Item.Skeleton level={level} />
          </>
        )}
      </>
    );
  }

  return (
    <>
      <p
        style={{ paddingLeft: level ? `${level * 12 + 25}px` : undefined }}
        className={cn(
          "hidden text-sm font-medium text-muted-foreground/80",
          expanded && "last:block",
          level === 0 && "hidden"
        )}
      >
        No pages inside
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={list.map((d) => d._id)}
          strategy={verticalListSortingStrategy}
        >
          {list.map((document) => (
            <div key={document._id}>
              <SortableDoc id={document._id} level={level} disabled={!isOwner}>
                <Item
                  id={document._id}
                  onClick={() => onRedirect(document._id)}
                  label={document.title}
                  icon={FileIcon}
                  documentIcon={document.icon}
                  active={params.documentId === document._id}
                  level={level}
                  onExpand={() => onExpand(document._id)}
                  expanded={expanded[document._id]}
                />
              </SortableDoc>
              {expanded[document._id] && (
                <DocumentList
                  parentDocumentId={document._id}
                  level={level + 1}
                />
              )}
            </div>
          ))}
        </SortableContext>
      </DndContext>
    </>
  );
};
