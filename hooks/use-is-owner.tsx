"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * Whether the current visitor is the verified site owner.
 *
 * Returns `false` while loading and for everyone who isn't the owner. The
 * owner's email is compared server-side in Convex; only this boolean is sent to
 * the client, so the email is never exposed. This drives edit-control
 * visibility only — actual enforcement lives in the Convex mutations and the
 * upload route.
 */
export const useIsOwner = (): boolean => {
  return useQuery(api.documents.isOwner) ?? false;
};
