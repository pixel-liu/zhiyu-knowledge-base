"use client";

import { useState } from "react";
import { Check, Copy, Globe } from "lucide-react";
import { useMutation } from "convex/react";
import { toast } from "sonner";

import { Doc } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { useOrigin } from "@/hooks/use-origin";
import { slugify } from "@/lib/slugify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface SeoLinkProps {
  initialData: Doc<"documents">;
}

export const SeoLink = ({ initialData }: SeoLinkProps) => {
  const origin = useOrigin();
  const setSlug = useMutation(api.documents.setSlug);
  const removeSlug = useMutation(api.documents.removeSlug);

  const [slug, setSlugValue] = useState(
    initialData.slug ?? slugify(initialData.title)
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = initialData.slug ? `${origin}/notes/${initialData.slug}` : "";

  const onSubmit = () => {
    setIsSubmitting(true);

    const promise = setSlug({ id: initialData._id, slug }).finally(() =>
      setIsSubmitting(false)
    );

    toast.promise(promise, {
      loading: "Saving SEO link...",
      success: "SEO link is live and added to the sitemap!",
      error: (e) => (e instanceof Error ? e.message : "Failed to save link."),
    });
  };

  const onUnpublish = () => {
    setIsSubmitting(true);

    const promise = removeSlug({ id: initialData._id }).finally(() =>
      setIsSubmitting(false)
    );

    toast.promise(promise, {
      loading: "Unpublishing...",
      success: "Unpublished — removed from the sitemap.",
      error: "Failed to unpublish.",
    });
  };

  const onCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost">
          {initialData.slug ? "SEO link" : "Generate SEO-ready link"}
          <Globe className="h-4 w-4 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end" alignOffset={8} forceMount>
        <div className="space-y-3">
          {initialData.slug && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Live & indexable
              </p>
              <div className="flex items-center gap-x-1">
                <input
                  readOnly
                  value={url}
                  className="flex-1 truncate rounded-l-md border bg-muted px-2 text-xs h-8"
                />
                <Button onClick={onCopy} size="sm" className="h-8 rounded-l-none">
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              {origin}/notes/
            </p>
            <Input
              value={slug}
              onChange={(e) => setSlugValue(e.target.value)}
              placeholder="my-note"
              className="h-8 text-xs"
            />
          </div>

          <Button
            disabled={isSubmitting || !slug.trim()}
            onClick={onSubmit}
            className="w-full text-xs"
            size="sm"
          >
            {initialData.slug ? "Update link" : "Generate link"}
          </Button>

          {initialData.slug && (
            <Button
              disabled={isSubmitting}
              onClick={onUnpublish}
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground hover:text-destructive"
            >
              Unpublish (remove from sitemap)
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
