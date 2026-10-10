import { useState } from 'react';
import { Text, Switch, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { colors } from '@/constants/theme';
import { sportRules, validateSport, type SportDefinition, type SportRules } from '@/constants/sports';

export function SportEditor({ sport, onSave, onCancel }: {
  sport?: SportDefinition; onSave: (definition: SportDefinition, revision: number) => void; onCancel: () => void;
}) {
  const [value, setValue] = useState<SportDefinition>(sport ?? { id: '', label: '', icon: '🏅', color: '#22C55E', scoreSingular: 'ponto', scorePlural: 'pontos', hasGoalkeeper: false, suggestedTeamSize: 6, active: true });
  const [rules, setRules] = useState<SportRules>(sportRules(value));
  const [size, setSize] = useState(String(value.suggestedTeamSize));
  const [minutes, setMinutes] = useState(String(rules.periodMinutes));
  const [periods, setPeriods] = useState(String(rules.periods));
  const [target, setTarget] = useState(String(rules.targetPoints ?? 21));
  const [wins, setWins] = useState(String(rules.setsToWin ?? 2));
  const [increments, setIncrements] = useState(rules.scoreValues.join(','));
  const definition: SportDefinition = { ...value, suggestedTeamSize: Number(size), rules: { ...rules,
    periodMinutes: Number(minutes), periods: rules.mode === 'total' ? 1 : rules.mode === 'sets' ? 2 * Number(wins) - 1 : Number(periods),
    targetPoints: rules.mode === 'sets' ? Number(target) : null, setsToWin: rules.mode === 'sets' ? Number(wins) : null,
    winByTwo: rules.mode === 'sets' && rules.winByTwo, scoreValues: increments.split(',').map(s => Number(s.trim())),
  } };
  const copy = { color: colors.textMuted, fontSize: 12, lineHeight: 18 } as const;
  function field(key: 'id' | 'label' | 'icon' | 'color' | 'scoreSingular' | 'scorePlural', label: string) {
    return <TextField key={key} label={label} value={value[key]} editable={key !== 'id' || !sport} onChangeText={text => setValue(v => ({ ...v, [key]: text }))} autoCapitalize={key === 'id' || key === 'color' ? 'none' : 'sentences'} />;
  }
  return <Card>
    <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>{sport ? 'Editar esporte' : 'Novo esporte'}</Text>
    {field('label','Nome do esporte')}{field('id','Identificador único (ex.: beach-tennis)')}
    <Text style={copy}>O identificador não muda depois de criado: times, campos e históricos usam esse código.</Text>
    {field('icon','Ícone (emoji)')}{field('color','Cor de destaque (#RRGGBB)')}
    {field('scoreSingular','Pontuação singular (gol, ponto...)')}{field('scorePlural','Pontuação plural (gols, pontos...)')}
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={copy}>Utiliza goleiro no sorteio</Text><Switch value={value.hasGoalkeeper} onValueChange={hasGoalkeeper => setValue(v => ({ ...v, hasGoalkeeper }))} /></View>
    <TextField label="Jogadores por time (1 a 50)" value={size} onChangeText={setSize} keyboardType="number-pad" />
    <Text style={copy}>Formato do placar</Text><SegmentedControl<SportRules['mode']> value={rules.mode} onChange={mode => setRules(r => ({ ...r, mode }))} options={[{ value: 'total', label: 'Total' }, { value: 'sets', label: 'Sets' }, { value: 'periods', label: 'Períodos' }]} />
    <TextField label="Duração sugerida da rodada/período (min)" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" />
    {rules.mode === 'periods' && <TextField label="Número de períodos (1 a 15)" value={periods} onChangeText={setPeriods} keyboardType="number-pad" />}
    {rules.mode === 'sets' && <><TextField label="Pontos para encerrar set (1 a 200)" value={target} onChangeText={setTarget} keyboardType="number-pad" /><TextField label="Sets para vencer (1 a 8)" value={wins} onChangeText={setWins} keyboardType="number-pad" /><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={copy}>Exige vantagem de 2 pontos</Text><Switch value={rules.winByTwo} onValueChange={winByTwo => setRules(r => ({ ...r, winByTwo }))} /></View><Text style={copy}>Melhor de {definition.rules!.periods} sets. Todos os sets usam o alvo acima; set decisivo especial ainda não é suportado.</Text></>}
    <TextField label="Valores de pontuação (ex.: 1,2,3; sempre incluir 1)" value={increments} onChangeText={setIncrements} keyboardType="numbers-and-punctuation" />
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={copy}>Disponível para novos cadastros</Text><Switch value={value.active} onValueChange={active => setValue(v => ({ ...v, active }))} /></View>
    <Text style={copy}>Desativar não apaga histórico. Regras são copiadas para novos placares; eventos já iniciados não são reconfigurados.</Text>
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}><Button small variant="ghost" label="Cancelar edição" onPress={onCancel} /><Button small label="Revisar esporte" disabled={!validateSport(definition)} onPress={() => onSave(definition, sport?.revision ?? 0)} /></View>
  </Card>;
}
