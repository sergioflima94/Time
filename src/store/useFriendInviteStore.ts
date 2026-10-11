import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { validFriendToken } from '@/lib/friendDiscoveryRules';
interface InviteState {token:string|null;savedAt:number;save:(token:string)=>void;clear:()=>void}
export const useFriendInviteStore=create<InviteState>()(persist((set)=>({
  token:null,savedAt:0,save:token=>{if(validFriendToken(token))set({token,savedAt:Date.now()});},clear:()=>set({token:null,savedAt:0}),
}),{name:'marcoujogou-pending-friend-invite',storage:createJSONStorage(()=>AsyncStorage),partialize:s=>({token:s.token,savedAt:s.savedAt})}));
