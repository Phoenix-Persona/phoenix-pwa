/**
 * PersonaActionsMenu — Edit + Delete affordances for a single persona.
 *
 * Two variants:
 *   - `iconOnly`  : a 3-dot overflow button that opens a small
 *                   dropdown with Edit / Delete. Used on persona
 *                   cards where space is tight.
 *   - `inline`    : explicit Edit + Delete buttons rendered inline.
 *                   Used in the persona dashboard header next to
 *                   the "Profile" link.
 *
 * Both variants share the same delete-confirm AlertDialog flow so
 * the user gets a consistent destructive-action gate.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ExternalLink,
  MoreVertical,
  Pencil,
  Trash2,
  UserCog,
} from "lucide-react";
import type { NostrEvent } from "@nostrify/nostrify";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeletePersona } from "@/hooks/useDeletePersona";
import { useToast } from "@/hooks/useToast";
import { formatDeletePersonaWarnings } from "@/lib/personaDeleteWarnings";
import { cn } from "@/lib/utils";

interface PersonaActionsMenuProps {
  /** npub of the persona being acted on. */
  npub: string;
  /** The current kind 30078 backup event — needed to tombstone on delete. */
  backupEvent: NostrEvent;
  /** Persona pubkey (hex) — used for the kind 0 deletion lookup. */
  personaPubkey: string;
  /** Persona display name — used in the delete confirm copy. */
  personaName: string;
  /**
   * Variant — see file header. `iconOnly` for cards, `inline` for
   * page-level dashboards. Defaults to `iconOnly`.
   */
  variant?: "iconOnly" | "inline";
  /**
   * For the `inline` variant, optionally show a "Profile" link
   * (the public-facing persona page) alongside Edit / Delete.
   */
  publicFeedNpub?: string;
  /** Tone the inline buttons for a dark cover band. */
  inverse?: boolean;
  className?: string;
}

export function PersonaActionsMenu({
  npub,
  backupEvent,
  personaPubkey,
  personaName,
  variant = "iconOnly",
  publicFeedNpub,
  inverse = false,
  className,
}: PersonaActionsMenuProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deletePersona = useDeletePersona();
  const { toast } = useToast();

  const onConfirmDelete = () => {
    deletePersona.mutate(
      { backupEvent, personaPubkey, npub },
      {
        onSuccess: (result) => {
          const warning = formatDeletePersonaWarnings(result.warnings);
          setConfirmOpen(false);
          toast({
            title: "Persona deleted",
            description: warning ?? `${personaName} was removed from your personas.`,
          });
        },
        onError: (error) => {
          toast({
            title: "Delete failed",
            description: error.message,
            variant: "destructive",
          });
        },
      },
    );
  };

  const inverseBtnClass =
    "rounded-full border-imigongo-cream/30 text-imigongo-cream bg-transparent hover:bg-imigongo-cream/10 hover:text-imigongo-cream";
  const inverseDestructiveClass =
    "rounded-full border-destructive/40 text-destructive/90 bg-transparent hover:bg-destructive/10 hover:text-destructive";

  return (
    <>
      {variant === "iconOnly" ? (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className={cn(
                "size-8 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background border border-border/60",
                className
              )}
              aria-label={`Actions for ${personaName}`}
              onClick={(e) => {
                // Prevent click bubbling to a parent Link wrapper in
                // case the menu is rendered inside a navigation card.
                e.stopPropagation();
                e.preventDefault();
              }}
            >
              <MoreVertical className="size-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {publicFeedNpub && (
              <>
                <DropdownMenuItem asChild>
                  <Link
                    to={`/p/${publicFeedNpub}`}
                    className="cursor-pointer"
                  >
                    <ExternalLink className="mr-2 size-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem asChild>
              <Link
                to={`/dashboard/${npub}/edit`}
                className="cursor-pointer"
              >
                <Pencil className="mr-2 size-4" />
                Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                to={`/dashboard/${npub}`}
                className="cursor-pointer"
              >
                <UserCog className="mr-2 size-4" />
                Open dashboard
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setConfirmOpen(true);
              }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <div className={cn("flex items-center gap-2 flex-wrap", className)}>
          {publicFeedNpub && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className={inverse ? inverseBtnClass : undefined}
            >
              <Link to={`/p/${publicFeedNpub}`}>
                <ExternalLink className="mr-2 size-3.5" />
                Profile
              </Link>
            </Button>
          )}
          <Button
            asChild
            variant="outline"
            size="sm"
            className={inverse ? inverseBtnClass : undefined}
          >
            <Link to={`/dashboard/${npub}/edit`}>
              <Pencil className="mr-2 size-3.5" />
              Edit
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={deletePersona.isPending}
            className={
              inverse
                ? inverseDestructiveClass
                : "text-destructive border-destructive/30 hover:bg-destructive/5"
            }
          >
            <Trash2 className="mr-2 size-3.5" />
            Delete
          </Button>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {personaName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Zuka will publish a deletion request for this persona's
              encrypted backup. The persona keypair becomes inaccessible
              to you afterwards. Posts already published to relays will
              remain public — Nostr cannot retract them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete persona
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
