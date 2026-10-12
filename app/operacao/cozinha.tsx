import {useLocalSearchParams} from 'expo-router';
import {VenueKitchen} from '@/components/VenueKitchen';
export default function Page(){const {establishmentId}=useLocalSearchParams<{establishmentId?:string}>();return <VenueKitchen venue={establishmentId??null}/>;}
