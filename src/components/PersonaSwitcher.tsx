/**
 * PersonaSwitcher — quick-jump dropdown for the user's personas.
 *
 * Lives in the app header next to the LoginArea. Visible only when:
 *   - the user is signed in, AND
 *   - they have at least one persona.
 *
 * The dropdown lists all personas (newest revision per d-tag, sorted
 * by event timestamp), and clicking one navigates to that persona's
 * dashboard. A "New persona" item lives at the bottom.
 */

import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, Plus, Sparkles } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuthor } from "@/hooks/useAuthor";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useMyPersonas } from "@/hooks/usePersona";

interface PersonaRowProps {
  pubkey: string;
  name: string;
  npub: string;
}

function PersonaRow({ pubkey, name, npub }: PersonaRowProps) {
  const author = useAuthor(pubkey);
  const picture = author.data?.metadata?.picture;
  const navigate = useNavigate();

  return (
    <DropdownMenuItem
      onSelect={() => navigate(`/dashboard/${npub}`)}
      className="flex items-center gap-2 cursor-pointer p-2 rounded-md"
    >
      <Avatar className="w-7 h-7">
        <AvatarImage src={picture} alt="" />
        <AvatarFallback className="text-[11px] font-medium bg-rw-sky/15 text-rw-sky">
          {name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="text-sm font-medium truncate flex-1">{name}</span>
    </DropdownMenuItem>
  );
}

export function PersonaSwitcher() {
  const { user } = useCurrentUser();
  const personas = useMyPersonas();

  if (!user) return null;
  if (personas.isLoading) return null;
  if (!personas.data || personas.data.length === 0) return null;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-imigongo-clay/20 bg-card hover:bg-muted transition-colors text-sm font-medium"
          aria-label="Switch persona"
        >
          <Sparkles className="size-3.5 text-imigongo-clay" aria-hidden="true" />
          <span>Personas</span>
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56 p-2 animate-scale-in" align="end">
        <DropdownMenuLabel className="text-xs uppercase tracking-[0.14em] text-muted-foreground font-semibold">
          Switch persona
        </DropdownMenuLabel>
        {personas.data.map(({ event, envelope, npub }) => (
          <PersonaRow
            key={event.id}
            pubkey={envelope.persona.pubkey}
            name={envelope.persona.name}
            npub={npub}
          />
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            to="/onboard"
            className="flex items-center gap-2 cursor-pointer p-2 rounded-md"
          >
            <Plus className="w-4 h-4" />
            <span>New persona</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
