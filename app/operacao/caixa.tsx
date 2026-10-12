import {useLocalSearchParams} from 'expo-router';
import {VenueCash} from '@/components/VenueCash';
export default function Page(){const {establishmentId}=useLocalSearchParams<{establishmentId?:string}>();return <VenueCash venue={establishmentId??null}/>;}
