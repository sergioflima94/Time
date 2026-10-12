import {useLocalSearchParams} from 'expo-router';
import {VenuePdv} from '@/components/VenuePdv';
export default function Comandas(){const {establishmentId}=useLocalSearchParams<{establishmentId?:string}>();return <VenuePdv venue={establishmentId??null}/>;}
