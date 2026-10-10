param(
  [ValidateSet('Inspect', 'Apply', 'Verify')][string]$Action = 'Inspect',
  [ValidatePattern('^[a-z]{20}$')][string]$ProjectRef = 'oyhbmbstsiagwljatawq'
)
$ErrorActionPreference = 'Stop'
# Management token is read from the existing CLI credential, never printed or saved.
if (-not ('BoraAuthCredential' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class BoraAuthCredential {
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
    if (-not [BoraAuthCredential]::Read('Supabase CLI:supabase',1,0,[ref]$credentialPointer)) { throw 'Faça login no Supabase CLI antes de configurar.' }
    $credential = [Runtime.InteropServices.Marshal]::PtrToStructure($credentialPointer,[type][BoraAuthCredential+CREDENTIAL])
    $credentialBytes = New-Object byte[] $credential.CredentialBlobSize
    [Runtime.InteropServices.Marshal]::Copy($credential.CredentialBlob,$credentialBytes,0,$credentialBytes.Length)
    $authToken = if ($credentialBytes -contains 0) { [Text.Encoding]::Unicode.GetString($credentialBytes).TrimEnd([char]0) } else { [Text.Encoding]::UTF8.GetString($credentialBytes) }
  }
  $endpoint = "https://api.supabase.com/v1/projects/$ProjectRef/config/auth"
  $headers = @{ Authorization = "Bearer $authToken" }
  $stage = 'read-config'
  $before = Invoke-RestMethod -Uri $endpoint -Headers $headers
  $stage = 'validate-template'
  $template = [IO.File]::ReadAllText((Join-Path $PSScriptRoot '../config/mobile-auth/confirmation.html'))
  if ($template -match 'localhost|127\.0\.0\.1' -or $template -notmatch 'href="{{ \.ConfirmationURL }}"' -or $template -notmatch '{{ \.Token }}') { throw 'Modelo inválido: preserve a verificação e o código do Supabase.' }
  $subject = 'Confirme seu e-mail — BoraJogo'
  $mobileUrl = 'pelada://auth/callback'
  if ($Action -eq 'Apply') {
    if ($before.mailer_autoconfirm) { throw 'A confirmação está desligada no servidor. Revise antes de aplicar.' }
    # Preserve existing production/web redirects. Remove only loopback addresses.
    $allowList = @($before.uri_allow_list -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -notmatch '^https?://(localhost|127\.0\.0\.1)([:/]|$)' })
    $allowList = @($allowList + $mobileUrl | Select-Object -Unique)
    $patch = @{ site_url = $mobileUrl; uri_allow_list = ($allowList -join ','); mailer_subjects_confirmation = $subject; mailer_templates_confirmation_content = $template }
    $stage = 'publish-template'
    # Deliberately do not send SMTP credentials, rates, MFA, OTP length or autoconfirm.
    $null = Invoke-RestMethod -Method Patch -Uri $endpoint -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes(($patch | ConvertTo-Json -Compress)))
  }
  $stage = 'verify-config'
  $after = if ($Action -eq 'Apply') { Invoke-RestMethod -Uri $endpoint -Headers $headers } else { $before }
  if ($Action -ne 'Inspect') {
    if ($after.site_url -ne $mobileUrl -or @($after.uri_allow_list -split ',') -notcontains $mobileUrl -or $after.mailer_subjects_confirmation -ne $subject -or $after.mailer_templates_confirmation_content.Trim() -ne $template.Trim() -or $after.mailer_autoconfirm) { throw 'O servidor não confirmou a configuração esperada.' }
    foreach ($key in @('mailer_autoconfirm', 'mailer_otp_length', 'mailer_otp_exp', 'smtp_host', 'smtp_sender_name', 'rate_limit_email_sent', 'rate_limit_verify', 'mfa_max_enrolled_factors')) {
      if ($before.$key -ne $after.$key) { throw "Alteração inesperada na propriedade $key." }
    }
  }
  [pscustomobject]@{
    project = $ProjectRef; action = $Action; site_url = $after.site_url;
    redirects = $after.uri_allow_list; subject = $after.mailer_subjects_confirmation;
    template_matches = ($after.mailer_templates_confirmation_content.Trim() -eq $template.Trim());
    template_has_localhost = ($after.mailer_templates_confirmation_content -match 'localhost|127\.0\.0\.1');
    otp_length = $after.mailer_otp_length; confirmation_required = (-not $after.mailer_autoconfirm);
    custom_smtp_configured = [bool]$after.smtp_host
  } | ConvertTo-Json
} catch {
  # HTTP exceptions can include request details; never forward a raw exception.
  $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
  if ($status -eq 400 -and $_.ErrorDetails.Message) {
    try {
      $validation = $_.ErrorDetails.Message | ConvertFrom-Json
      # Only validation error text, not request/response configuration or headers.
      $details = ($validation.message | ConvertTo-Json -Compress -Depth 4)
      if ($details -and $details -notmatch 'sbp_|Bearer|smtp_pass|access_token|refresh_token') { Write-Host "Validação: $details" }
    } catch { }
  }
  Write-Error "A configuração não foi confirmada na etapa $stage (HTTP $status). Nenhuma credencial foi registrada."
  exit 1
} finally {
  if ($credentialPointer -ne [IntPtr]::Zero) { [BoraAuthCredential]::CredFree($credentialPointer) }
  if ($credentialBytes) { [Array]::Clear($credentialBytes, 0, $credentialBytes.Length) }
  $authToken = $null; $headers = $null; $before = $null; $after = $null
}
