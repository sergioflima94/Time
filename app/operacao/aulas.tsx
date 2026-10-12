import {useLocalSearchParams} from 'expo-router';
import {AcademyScreen} from '@/components/AcademyScreen';
export default function Aulas(){const {establishmentId}=useLocalSearchParams<{establishmentId?:string}>();return <AcademyScreen venue={establishmentId??null}/>;}
