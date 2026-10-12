import {useLocalSearchParams} from 'expo-router';
import {AcademyScreen} from '@/components/AcademyScreen';
export default function Aula(){const {id}=useLocalSearchParams<{id:string}>();return <AcademyScreen sessionId={id}/>;}
