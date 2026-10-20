/**
 * huelle.mjs — die TEXTE der beiden Installationshuellen.
 *
 * Warum diese Datei getrennt von `payload.mjs` ist: die Nutzlast ist der
 * INHALT (Code, Abhaengigkeiten, Laufzeit, Starter), die Huelle ist das
 * drumherum (control-File, postinst, Menueeintrag, PATH-Starter auf Debian;
 * Installation und Deinstallation auf Windows). Zwei Eigentuemer, zwei
 * Dateien — und eine Datei, die nicht an der Klassengrenze reisst.
 *
 * Alle Texte sind FUNCTIONS, keine Konstanten: sie tragen den Pfad des
 * Installats (`/opt/shinon-forge`) bzw. den Zielordner des Windows-Wegs
 * hinein. So steht kein Pfad zweimal im Baum, und der Test kann sie pruefen,
 * ohne ein Paket zu bauen (ein Bau braucht dpkg-deb, npm und Netz).
 *
 * WAS DIESE TEXTE ENTSCHEIDEN:
 *
 *   - `debControl` nennt KEINE `Depends: nodejs`. Die Laufzeit liegt im Paket;
 *     ein Zwang auf ein System-Node war der Grund, warum Mint (Node 18 in der
 *     Regel) das Paket nicht nehmen konnte.
 *   - `debPostinst` installiert NICHTS nach. Kein `npm ci`, kein Netz: ein
 *     Paket, das beim Installieren erst seinen Inhalt laedt, ist kein Paket.
 *     Der postinst prueft nur, ob die mitgelieferte Laufzeit laeuft.
 *   - `installPs1` laedt nichts nach und legt Verknuepfungen an — alles mit
 *     dem, was Windows ohnehin kann (PowerShell, COM-Shell).
 *
 * Aufrufer: `scripts/deb-build.mjs`, `scripts/win-build.mjs` und der
 * Gate-Test `scripts/gate/tests/packaging.test.mjs`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Das control-File des Pakets. */
export function debControl({ version, architecture, sizeKb, installRoot }) {
  return [
    'Package: shinon-forge',
    `Version: ${version}`,
    'Section: devel',
    'Priority: optional',
    'Architecture: ' + architecture,
    'Maintainer: Shinon Forge <noreply@shinon.invalid>',
    `Installed-Size: ${sizeKb}`,
    'Description: Shinon Forge - DSH-Shell mit eigenem Profil',
    ' Ein Overlay aus Cordis-Bundles (@shinon/*) mit eigenem Profil, Gate-Engine',
    ' und Startskripten. Der Code liegt unter ' + installRoot + ', die mitgelieferte',
    ' Node-Laufzeit darunter, Nutzerdaten unter XDG (config/data/state/cache).',
    '',
  ].join('\n');
}

/** Der postinst: prueft die mitgelieferte Laufzeit, installiert nichts nach. */
export function debPostinst({ installRoot }) {
  return `#!/bin/sh
set -e
NODE="${installRoot}/runtime/node/bin/node"
if [ ! -x "$NODE" ]; then
  echo "Shinon Forge: die mitgelieferte Laufzeit fehlt unter $NODE — das Paket ist unbrauchbar." >&2
  exit 1
fi
echo "Shinon Forge: mitgelieferte Laufzeit $("$NODE" --version)"
exit 0
`;
}

/** Der Starter im PATH: ein echtes Skript, kein Symlink (siehe deb-build.mjs). */
export function debPathStarter({ installRoot }) {
  return `#!/bin/sh
# Von Shinon Forge erzeugt (scripts/deb-build.mjs). Ein Aufruf, ein Pfad.
exec "${installRoot}/shinon" "$@"
`;
}

/** Der Menueeintrag des Pakets. */
export function debDesktopEntry({ installRoot }) {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Shinon Forge',
    'GenericName=Shinon Forge DSH-Shell',
    'Comment=Startet Shinon Forge (aktives Profil, UI im Browser)',
    'Exec=/usr/bin/shinon',
    `Path=${installRoot}`,
    'Terminal=false',
    'StartupNotify=true',
    `Icon=${installRoot}/assets/banner.svg`,
    'Categories=Development;IDE;',
    'Keywords=shinon;dsh;agent;',
    '',
  ].join('\n');
}

/**
 * Der Windows-Installationsweg: kopieren, PATH, Startmenue, Deinstallation.
 * Bewusst PowerShell und keine Fremdbibliothek — die Datei muss auf einem
 * frischen Windows verstehen, ohne dass etwas installiert wurde.
 */
export function installPs1() {
  return `# install.ps1 - Shinon Forge fuer Windows (von scripts/lib/huelle.mjs erzeugt).
#
# WAS DIESER WEG MACHT: kopiert die mitgelieferte Nutzlast (Code, Abhaengigkeiten
# und Node-Laufzeit) an einen Ort im Benutzerprofil, traegt ihn in den
# Benutzer-PATH ein und legt zwei Verknuepfungen im Startmenue an: einen Start
# und eine Deinstallation. Es wird NICHTS heruntergeladen - alles liegt bereits
# im Archiv, in dem diese Datei steht.
[CmdletBinding()]
param(
  [string]$TargetDir = (Join-Path $env:LOCALAPPDATA 'Programs\\shinon-forge'),
  [string]$StartMenu = (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'),
  [switch]$NoPath,
  [switch]$NoShortcut
)
$ErrorActionPreference = 'Stop'
$Source = Split-Path -Parent $MyInvocation.MyCommand.Path

function Say([string]$Text) { Write-Host $Text }

# 1. Die Nutzlast pruefen: ohne mitgelieferte Laufzeit und ohne Einstieg gibt
#    es nichts zu installieren, und das wird hier gesagt statt spaeter.
$NodeExe = Join-Path $Source 'runtime\\node\\node.exe'
$Entry = Join-Path $Source 'bin\\shinon.mjs'
if (-not (Test-Path $NodeExe)) { Say "FEHLT: mitgelieferte Laufzeit ($NodeExe) - Archiv unvollstaendig."; exit 1 }
if (-not (Test-Path $Entry)) { Say "FEHLT: Einstieg ($Entry) - Archiv unvollstaendig."; exit 1 }
$NodeVersion = (& $NodeExe --version) 2>$null
Say "Laufzeit: $NodeVersion (mitgeliefert)"

# 2. Kopieren. Liegt das Archiv schon am Ziel, wird es nicht kopiert (portabler
#    Betrieb). Der Vergleich geht auf den ZIELORDNER selbst, nicht auf dessen
#    Eltern: sonst kopierte das Archiv in sich selbst, wenn der Benutzer es
#    direkt in den Zielordner entpackt hat.
$SourcePath = (Resolve-Path $Source).Path
$TargetPath = $null
if (Test-Path $TargetDir) { $TargetPath = (Resolve-Path $TargetDir).Path }
if ($TargetPath -and ($TargetPath.TrimEnd('\') -eq $SourcePath.TrimEnd('\'))) {
  Say "Ziel ist das Archiv selbst - kein Kopieren noetig."
} else {
  Say "Kopiere nach $TargetDir ..."
  New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
  Copy-Item -Path (Join-Path $Source '*') -Destination $TargetDir -Recurse -Force
}

# 3. PATH (Benutzerebene, ohne Adminrechte).
if (-not $NoPath) {
  $UserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  if ($null -eq $UserPath) { $UserPath = '' }
  $parts = $UserPath -split ';' | Where-Object { $_ -ne '' }
  if ($parts -notcontains $TargetDir) {
    [Environment]::SetEnvironmentVariable('Path', (($parts + $TargetDir) -join ';'), 'User')
    Say "PATH (Benutzer) ergaenzt: $TargetDir"
  } else {
    Say "PATH (Benutzer) traegt $TargetDir schon."
  }
}

# 4. Startmenue: Start und Deinstallation.
if (-not $NoShortcut) {
  New-Item -ItemType Directory -Force -Path $StartMenu | Out-Null
  $Shell = New-Object -ComObject WScript.Shell
  $Start = $Shell.CreateShortcut((Join-Path $StartMenu 'Shinon Forge.lnk'))
  $Start.TargetPath = Join-Path $TargetDir 'shinon.cmd'
  $Start.WorkingDirectory = $TargetDir
  $Start.Description = 'Shinon Forge starten (Profil shinon, UI im Browser)'
  $Start.Save()
  $Remove = $Shell.CreateShortcut((Join-Path $StartMenu 'Shinon Forge deinstallieren.lnk'))
  $Remove.TargetPath = 'powershell.exe'
  $Remove.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $TargetDir 'uninstall.ps1') + '"'
  $Remove.WorkingDirectory = $TargetDir
  $Remove.Save()
  Say "Startmenue: $StartMenu"
}

Say "Fertig. Start: shinon (im neuen Terminal) oder 'Shinon Forge' im Startmenue."
Say "Zurueck: 'Shinon Forge deinstallieren' im Startmenue."
exit 0
`;
}

/** Der Windows-Weg zurueck: Verknuepfungen, PATH und der Zielordner. */
export function uninstallPs1() {
  return `# uninstall.ps1 - Shinon Forge fuer Windows (von scripts/lib/huelle.mjs erzeugt).
[CmdletBinding()]
param(
  [string]$TargetDir = (Join-Path $env:LOCALAPPDATA 'Programs\\shinon-forge'),
  [string]$StartMenu = (Join-Path $env:APPDATA 'Microsoft\\Windows\\Start Menu\\Programs'),
  [switch]$KeepPayload
)
$ErrorActionPreference = 'Stop'
function Say([string]$Text) { Write-Host $Text }

# 1. Startmenue-Eintraege entfernen.
foreach ($Name in @('Shinon Forge.lnk', 'Shinon Forge deinstallieren.lnk')) {
  $Path = Join-Path $StartMenu $Name
  if (Test-Path $Path) { Remove-Item $Path -Force; Say "Entfernt: $Path" }
}

# 2. PATH (Benutzerebene) wieder um den Zielordner verkuerzen.
$UserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($null -ne $UserPath) {
  $parts = $UserPath -split ';' | Where-Object { $_ -ne '' -and $_ -ne $TargetDir }
  [Environment]::SetEnvironmentVariable('Path', ($parts -join ';'), 'User')
  Say "PATH (Benutzer) bereinigt."
}

# 3. Der Zielordner. Nutzerdaten (XDG/AppData) bleiben unberuehrt: sie liegen
#    nicht im Installat, das ist die Zusage aus scripts/lib/paths.mjs.
if ($KeepPayload) {
  Say "Dateien bleiben liegen: $TargetDir"
} elseif (Test-Path $TargetDir) {
  Remove-Item $TargetDir -Recurse -Force
  Say "Entfernt: $TargetDir"
}
Say "Nutzerdaten (Konfiguration, Daten, Zustand) bleiben unberuehrt."
exit 0
`;
}

/**
 * Die Windows-Helfer in die Nutzlast legen.
 *
 * Sie gehoeren zum INHALT des Archivs (der Benutzer entpackt sie und ruft
 * sie auf), werden aber von der HUELLE erzeugt — deshalb hier und nicht im
 * Nutzlast-Bau. Der Aufrufer (der Windows-Bauer) entscheidet, ob er sie
 * braucht; der Test prueft dieselbe Funktion.
 * @param {{stage: string}} options
 * @returns {string[]} die gelegten Dateinamen
 */
export function writeWindowsHelpers({ stage }) {
  const files = {
    'install.ps1': installPs1(),
    'uninstall.ps1': uninstallPs1(),
  };
  mkdirSync(stage, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(stage, name), content, 'utf8');
  }
  return Object.keys(files);
}
