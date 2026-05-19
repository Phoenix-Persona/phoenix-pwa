import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, Home, LogOut, PlusCircle, Settings, Users } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar.tsx';
import { useLoggedInAccounts, type Account } from '@/hooks/useLoggedInAccounts';
import { useLoginActions } from '@/hooks/useLoginActions';
import { genUserName } from '@/lib/genUserName';
import { sanitizeHttpsUrl } from '@/lib/url';

export function AccountSwitcher() {
  const { currentUser } = useLoggedInAccounts();
  const { logout } = useLoginActions();
  const navigate = useNavigate();

  if (!currentUser) return null;

  const getDisplayName = (account: Account): string => {
    return account.metadata.name ?? genUserName(account.pubkey);
  };

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" className='flex items-center gap-2 h-10 p-1 pr-2.5 rounded-full hover:bg-accent transition-all text-foreground'>
          <Avatar className='w-8 h-8'>
            <AvatarImage
              src={sanitizeHttpsUrl(currentUser.metadata.picture) ?? undefined}
              alt={getDisplayName(currentUser)}
              crossOrigin="anonymous"
            />
            <AvatarFallback>{getDisplayName(currentUser).charAt(0)}</AvatarFallback>
          </Avatar>
          <ChevronDown className='w-4 h-4 text-muted-foreground' />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className='w-56 p-2 animate-scale-in'>
        <DropdownMenuItem asChild>
          <Link
            to="/"
            className='flex items-center gap-2 cursor-pointer p-2 rounded-md'
          >
            <Home className='w-4 h-4' />
            <span>Home</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            to="/my-personas"
            className='flex items-center gap-2 cursor-pointer p-2 rounded-md'
          >
            <Users className='w-4 h-4' />
            <span>My personas</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            to="/onboard"
            className='flex items-center gap-2 cursor-pointer p-2 rounded-md'
          >
            <PlusCircle className='w-4 h-4' />
            <span>New persona</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            to="/settings"
            className='flex items-center gap-2 cursor-pointer p-2 rounded-md'
          >
            <Settings className='w-4 h-4' />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => void handleLogout()}
          className='flex items-center gap-2 cursor-pointer p-2 rounded-md text-red-500'
        >
          <LogOut className='w-4 h-4' />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
