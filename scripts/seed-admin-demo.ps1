param(
  [ValidateSet('Inspect', 'Apply')][string]$Action = 'Inspect',
  [ValidatePattern('^[a-z]{20}$')][string]$ProjectRef = 'oyhbmbstsiagwljatawq',
  [ValidatePattern('^[^\s@]+@[^\s@]+\.[^\s@]+$')][string]$Email = 'sergioferreiralima09@gmail.com',
  [guid]$ExpectedAuthId = '45358119-561e-4d66-b7aa-71bbc5e7b20a'
)
$ErrorActionPreference = 'Stop'
# Credential stays in memory. Never embed a service-role key in the app/SQL.
if (-not ('MarcouJogouDemoCredential' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class MarcouJogouDemoCredential {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct CREDENTIAL {
  public uint Flags; public uint Type; public string TargetName; public string Comment;
  public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public uint CredentialBlobSize;
  public IntPtr CredentialBlob; public uint Persist; public uint AttributeCount;
  public IntPtr Attributes; public string TargetAlias; public string UserName;
 }
 [DllImport("advapi32.dll",EntryPoint="CredReadW",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool Read(string target,uint type,uint flags,out IntPtr ptr);
 [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr ptr);
}
'@
}
$credentialPointer = [IntPtr]::Zero
$authToken = $env:SUPABASE_ACCESS_TOKEN
$stage = 'credential'
try {
  if (-not $authToken) {
    if (-not [MarcouJogouDemoCredential]::Read('Supabase CLI:supabase',1,0,[ref]$credentialPointer)) { throw 'Faça login no Supabase CLI.' }
    $credential = [Runtime.InteropServices.Marshal]::PtrToStructure($credentialPointer,[type][MarcouJogouDemoCredential+CREDENTIAL])
    $credentialBytes = New-Object byte[] $credential.CredentialBlobSize
    [Runtime.InteropServices.Marshal]::Copy($credential.CredentialBlob,$credentialBytes,0,$credentialBytes.Length)
    $authToken = if ($credentialBytes -contains 0) { [Text.Encoding]::Unicode.GetString($credentialBytes).TrimEnd([char]0) } else { [Text.Encoding]::UTF8.GetString($credentialBytes) }
  }
  $endpoint = "https://api.supabase.com/v1/projects/$ProjectRef/database/query"
  $headers = @{ Authorization = "Bearer $authToken" }
  function Invoke-DemoQuery([string]$Query, [bool]$ReadOnly) {
    $payload = @{ query = $Query; read_only = $ReadOnly } | ConvertTo-Json -Compress
    $result = Invoke-RestMethod -Method Post -Uri $endpoint -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($payload)) -TimeoutSec 60
    foreach ($row in $result) { Write-Output $row }
  }
  $safeEmail = $Email.Replace("'", "''")
  $inspectionSql = @"
select u.email, u.id as auth_id, p.id as player_id, a.role, a.active,
  not coalesce(c.suspended,false) as account_allowed,
  (select count(*) from public.sport_catalog where id in ('futebol','volei','basquete','handebol','futvolei') and (definition->>'active')::boolean) as active_sports,
  (select jsonb_build_object('id',t.id,'name',t.name,'owner',t.created_by=p.id,
    'members',(select count(*) from public.pelada_memberships m where m.pelada_id=t.id and m.active),
    'admin',(select coalesce(bool_or(m.role='admin' and m.active),false) from public.pelada_memberships m where m.pelada_id=t.id and m.player_id=p.id))
    from public.peladas t where t.id=md5('marcoujogou:demo-admin:v1:' || p.id::text || ':team')::uuid) as team,
  (select jsonb_build_object('id',e.id,'name',e.name,'owner',e.owner_player_id=p.id,
    'payout',e.payout_method,'whatsappOptIn',e.whatsapp_opt_in,
    'fields',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'sports',f.sport_ids) order by f.name),'[]'::jsonb) from public.fields f where f.establishment_id=e.id))
    from public.establishments e where e.id=md5('marcoujogou:demo-admin:v1:' || p.id::text || ':venue')::uuid) as venue
from auth.users u join public.players p on p.auth_user_id=u.id
left join public.platform_admin_accounts a on a.auth_user_id=u.id
left join public.platform_account_controls c on c.player_id=p.id
where lower(u.email)=lower('$safeEmail') and u.id='$ExpectedAuthId'::uuid and not p.is_guest;
"@
  $stage = 'inspect-account'
  $before = @(Invoke-DemoQuery $inspectionSql $true)
  if ($before.Count -ne 1 -or -not $before[0].active -or -not $before[0].account_allowed -or $before[0].role -notin @('owner','admin')) { throw 'A conta admin ativa não corresponde à identidade esperada.' }
  if ($Action -eq 'Apply') {
    if ($before[0].active_sports -ne 5) { throw 'Ative as cinco modalidades antes de continuar.' }
    $linkedProject = [IO.File]::ReadAllText((Join-Path $PSScriptRoot '../supabase/.temp/project-ref')).Trim()
    if ($linkedProject -ne $ProjectRef) { throw 'O projeto informado não corresponde ao projeto vinculado pelo CLI.' }
    $seed = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'demo-admin-data.sql'))
    $stage = 'seed-transaction'
    $null = Invoke-DemoQuery "begin; select set_config('marcoujogou.demo_email','$safeEmail',true), set_config('marcoujogou.demo_auth_id','$ExpectedAuthId',true); $seed commit;" $false
    $stage = 'verify-records'
    $after = @(Invoke-DemoQuery $inspectionSql $true)
    if ($after.Count -ne 1 -or -not $after[0].team.owner -or -not $after[0].team.admin -or -not $after[0].venue.owner -or @($after[0].venue.fields).Count -lt 5 -or $after[0].team.members -lt 12) { throw 'A releitura não confirmou os vínculos esperados.' }
  } else { $after = $before }
  [pscustomobject]@{ project = $ProjectRef; action = $Action; account = $after[0] } | ConvertTo-Json -Depth 8
} catch {
  # Never surface HTTP request headers, raw error bodies or database credentials.
  $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
  Write-Error "Demonstração não confirmada na etapa $stage (HTTP $status). Use Inspect antes de repetir Apply; credenciais não foram registradas."
  exit 1
} finally {
  if ($credentialPointer -ne [IntPtr]::Zero) { [MarcouJogouDemoCredential]::CredFree($credentialPointer) }
  if ($credentialBytes) { [Array]::Clear($credentialBytes, 0, $credentialBytes.Length) }
  $authToken = $null; $headers = $null
}
