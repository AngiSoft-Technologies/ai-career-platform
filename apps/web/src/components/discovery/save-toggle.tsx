"use client";

import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button, cx, useToast } from "@/components/ui";
import { api } from "@/lib/api";

/**
 * Optimistic wish-list control shared by the catalogue, the saved list and
 * the role detail page.
 *
 * The API is the source of truth; the button moves first so the interface does
 * not wait on a network round trip. A failed write puts the previous state
 * back — a save button that lies is worse than one that takes a moment.
 */
export function SaveToggle({
  opportunityId,
  saved,
  onChange,
  label,
  className,
}: {
  opportunityId: string;
  saved: boolean;
  onChange?: (saved: boolean) => void;
  label?: string;
  className?: string;
}) {
  const [optimistic, setOptimistic] = useState(saved);
  const [pending, setPending] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setOptimistic(saved);
  }, [saved]);

  const update = async (event: React.MouseEvent<HTMLButtonElement>) => {
    // Rows are links as well; a save click must never navigate.
    event.preventDefault();
    event.stopPropagation();
    if (pending) return;

    const previous = optimistic;
    const next = !previous;
    setOptimistic(next);
    onChange?.(next);
    setPending(true);

    try {
      await api.post("/feed/state", { opportunityId, saved: next });
      toast.push(next ? "Added to your wish list" : "Removed from your wish list", "success");
    } catch (caught) {
      setOptimistic(previous);
      onChange?.(previous);
      toast.push(
        caught instanceof Error ? caught.message : "Could not update your wish list",
        "danger",
      );
    } finally {
      setPending(false);
    }
  };

  const text = label ?? (optimistic ? "Saved" : "Save");

  return (
    <Button
      type="button"
      size="sm"
      variant={optimistic ? "outline" : "ghost"}
      aria-pressed={optimistic}
      aria-label={
        optimistic
          ? `Remove ${text.toLowerCase()} role from your wish list`
          : "Add role to your wish list"
      }
      disabled={pending}
      onClick={(event) => void update(event)}
      icon={optimistic ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
      className={cx(
        optimistic
          ? "border-app-accent/40 bg-app-accent-soft text-app-accent"
          : "text-app-muted hover:text-app-text",
        className,
      )}
    >
      {text}
    </Button>
  );
}
