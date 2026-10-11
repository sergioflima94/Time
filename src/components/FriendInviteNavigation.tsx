import { useEffect } from 'react';
import { router, usePathname, useRootNavigationState } from 'expo-router';
import { useAuthStore } from '@/store/useAuthStore';
import { useFriendInviteStore } from '@/store/useFriendInviteStore';
export function FriendInviteNavigation(){
  const logged=useAuthStore(s=>s.isLoggedIn&&s.authReady),ready=useRootNavigationState()?.key,path=usePathname();
  const token=useFriendInviteStore(s=>s.token),at=useFriendInviteStore(s=>s.savedAt);
  useEffect(()=>{if(!logged||!ready||!token||path.startsWith('/amigo/'))return;if(Date.now()-at>7*86400000){useFriendInviteStore.getState().clear();return;}
    const timer=setTimeout(()=>router.push({pathname:'/amigo/[token]',params:{token}}),0);return()=>clearTimeout(timer);
  },[logged,ready,token,at,path]);return null;
}
