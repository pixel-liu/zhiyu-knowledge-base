import { v } from "convex/values";
import { mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { slugify } from "../lib/slugify";

/**
 * Returns the signed-in identity only if it belongs to the site owner.
 *
 * The owner's email lives exclusively in the Convex deployment env
 * (`OWNER_EMAIL`) and is never exposed to the client. Since only Google OAuth
 * is enabled, the email claim is always provider-verified.
 */
const getOwnerIdentity = async (ctx: QueryCtx | MutationCtx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }

  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) {
    // Fail closed: refuse to grant ownership if the server isn't configured.
    throw new Error("OWNER_EMAIL is not configured on the Convex deployment");
  }

  if (identity.email !== ownerEmail || identity.emailVerified !== true) {
    return null;
  }

  return identity;
};

/** Throws unless the caller is the verified site owner. */
const requireOwner = async (ctx: QueryCtx | MutationCtx) => {
  const identity = await getOwnerIdentity(ctx);
  if (!identity) {
    throw new Error("Unauthorized");
  }
  return identity;
};

// Boolean the client can safely read to decide whether to show edit controls.
// The owner's email never crosses the wire — only this true/false.
export const isOwner = query({
  handler: async (ctx) => {
    return (await getOwnerIdentity(ctx)) !== null;
  },
});

export const archive = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    await requireOwner(ctx);

    const existingDocument = await ctx.db.get(args.id);

    if (!existingDocument) {
      throw new Error("Not found");
    }

    const recursiveArchive = async (documentId: Id<"documents">) => {
      const children = await ctx.db
        .query("documents")
        .withIndex("by_parent", (q) => q.eq("parentDocument", documentId))
        .collect();

      for (const child of children) {
        await ctx.db.patch(child._id, {
          isArchived: true,
        });

        await recursiveArchive(child._id);
      }
    };

    const document = await ctx.db.patch(args.id, {
      isArchived: true,
    });

    await recursiveArchive(args.id);

    return document;
  },
});

// Public: the sidebar tree is browsable by anyone.
export const getSidebar = query({
  args: {
    parentDocument: v.optional(v.id("documents")),
  },
  handler: async (ctx, args) => {
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_parent", (q) =>
        q.eq("parentDocument", args.parentDocument)
      )
      .filter((q) => q.eq(q.field("isArchived"), false))
      .collect();

    // Explicit drag order when set; otherwise fall back to creation time (so
    // never-reordered lists keep their original order and new pages append).
    documents.sort(
      (a, b) => (a.order ?? a._creationTime) - (b.order ?? b._creationTime)
    );

    return documents;
  },
});

// Owner-only: persist a new sibling order from a drag-and-drop reorder. The
// client sends the full ordered list of sibling ids; we store each one's index.
export const reorder = mutation({
  args: { documentIds: v.array(v.id("documents")) },
  handler: async (ctx, args) => {
    await requireOwner(ctx);

    await Promise.all(
      args.documentIds.map((id, index) =>
        ctx.db.patch(id, { order: index })
      )
    );
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    parentDocument: v.optional(v.id("documents")),
  },
  handler: async (ctx, args) => {
    const identity = await requireOwner(ctx);

    const document = await ctx.db.insert("documents", {
      title: args.title,
      parentDocument: args.parentDocument,
      userId: identity.subject,
      isArchived: false,
      isPublished: false,
    });

    return document;
  },
});

export const getTrash = query({
  handler: async (ctx) => {
    await requireOwner(ctx);

    const documents = await ctx.db
      .query("documents")
      .filter((q) => q.eq(q.field("isArchived"), true))
      .order("desc")
      .collect();

    return documents;
  },
});

export const restore = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    await requireOwner(ctx);

    const existingDocument = await ctx.db.get(args.id);

    if (!existingDocument) {
      throw new Error("Not found");
    }

    const recursiveRestore = async (documentId: Id<"documents">) => {
      const children = await ctx.db
        .query("documents")
        .withIndex("by_parent", (q) => q.eq("parentDocument", documentId))
        .collect();

      for (const child of children) {
        await ctx.db.patch(child._id, {
          isArchived: false,
        });

        await recursiveRestore(child._id);
      }
    };

    const options: Partial<Doc<"documents">> = {
      isArchived: false,
    };

    if (existingDocument.parentDocument) {
      const parent = await ctx.db.get(existingDocument.parentDocument);
      if (parent?.isArchived) {
        options.parentDocument = undefined;
      }
    }

    const document = await ctx.db.patch(args.id, options);

    await recursiveRestore(args.id);

    return document;
  },
});

export const remove = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    await requireOwner(ctx);

    const existingDocument = await ctx.db.get(args.id);

    if (!existingDocument) {
      throw new Error("Not found");
    }

    const document = await ctx.db.delete(args.id);

    return document;
  },
});

// Public: anyone can search the notes.
export const getSearch = query({
  handler: async (ctx) => {
    const documents = await ctx.db
      .query("documents")
      .filter((q) => q.eq(q.field("isArchived"), false))
      .order("desc")
      .collect();

    return documents;
  },
});

// Public: anyone can read any non-archived note.
export const getById = query({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.documentId);

    if (!document || document.isArchived) {
      return null;
    }

    return document;
  },
});

export const update = mutation({
  args: {
    id: v.id("documents"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    coverImage: v.optional(v.string()),
    icon: v.optional(v.string()),
    isPublished: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);

    const { id, ...rest } = args;

    const existingDocument = await ctx.db.get(id);

    if (!existingDocument) {
      throw new Error("Not found");
    }

    const document = await ctx.db.patch(id, { ...rest, updatedAt: Date.now() });

    return document;
  },
});

// Assigns an SEO-friendly slug to a note (owner only). The slug is normalized and
// must be unique across notes. Setting a slug is what makes a note appear in the
// sitemap and at /notes/[slug].
export const setSlug = mutation({
  args: {
    id: v.id("documents"),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);

    const existingDocument = await ctx.db.get(args.id);
    if (!existingDocument) {
      throw new Error("Not found");
    }

    const slug = slugify(args.slug);
    if (!slug) {
      throw new Error("Slug cannot be empty");
    }

    const conflict = await ctx.db
      .query("documents")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();

    if (conflict && conflict._id !== args.id) {
      throw new Error("That slug is already taken — pick another");
    }

    await ctx.db.patch(args.id, { slug, updatedAt: Date.now() });

    return slug;
  },
});

// Unpublishes a note's SEO link (owner only): clears the slug, which removes it
// from sitemap.xml and makes /notes/[slug] return 404.
export const removeSlug = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    await requireOwner(ctx);

    const existingDocument = await ctx.db.get(args.id);
    if (!existingDocument) {
      throw new Error("Not found");
    }

    await ctx.db.patch(args.id, { slug: undefined, updatedAt: Date.now() });
  },
});

// Public: read a note by its slug (for the server-rendered /notes/[slug] page).
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const document = await ctx.db
      .query("documents")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (!document || document.isArchived) {
      return null;
    }

    return document;
  },
});

// Public: the set of indexable notes, used to build sitemap.xml.
export const getPublishedSlugs = query({
  handler: async (ctx) => {
    const documents = await ctx.db
      .query("documents")
      .filter((q) =>
        q.and(
          q.eq(q.field("isArchived"), false),
          q.neq(q.field("slug"), undefined)
        )
      )
      .collect();

    return documents.map((doc) => ({
      slug: doc.slug as string,
      updatedAt: doc.updatedAt,
      creationTime: doc._creationTime,
    }));
  },
});

export const removeIcon = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    await requireOwner(ctx);

    const existingDocument = await ctx.db.get(args.id);

    if (!existingDocument) {
      throw new Error("Not found");
    }

    const document = await ctx.db.patch(args.id, { icon: undefined });

    return document;
  },
});

export const removeCoverImage = mutation({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    await requireOwner(ctx);

    const existingDocument = await ctx.db.get(args.id);

    if (!existingDocument) {
      throw new Error("Not found");
    }

    const document = await ctx.db.patch(args.id, { coverImage: undefined });

    return document;
  },
});
