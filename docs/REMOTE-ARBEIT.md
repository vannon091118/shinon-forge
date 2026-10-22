# Remote arbeiten und lokale Worktrees

> Lokaler Zustand ist kein Projektvertrag. Ein Klon soll auf einem anderen
> Rechner funktionieren, ohne die private Metadaten-Schublade des ersten Rechners.

## Frischer Rechner oder Remote-Entwicklungsumgebung

Der Repo-Start braucht weder `.freebuff/` noch eine bestimmte Home-Verzeichnis-
Struktur:

```bash
git clone https://github.com/vannon091118/shinon-forge.git
cd shinon-forge
npm ci
npm run profile:links
npm test
```

Für den Host danach `npm run dev`. Modell-Zugangsdaten kommen lokal in `.env`
(Vorlage `.env.example`) und werden nicht übertragen. Das Repo enthält alle
reproduzierbaren Skripte und Projektregeln; persönliche Credentials,
Sitzungsdaten und Freebuff-Metadaten bleiben auf dem jeweiligen Rechner.

## `.freebuff/`

`.freebuff/` ist bereits in `.gitignore` ausgeschlossen. Es enthält nur die
lokale Freebuff-Projektzuordnung, nicht die Quelle für Shinons Regeln oder
Aufgaben. Der Gate-Test
[`local-state-hygiene.test.mjs`](../scripts/gate/tests/local-state-hygiene.test.mjs)
prüft, dass der Pfad ignoriert wird und keine Datei daraus im Git-Index liegt.
Ein Remote-Klon erzeugt seine eigene Zuordnung, falls die dortige Umgebung sie
benötigt; Shinon-Skripte referenzieren diese ID nicht.

Bitte weder `.freebuff/project-id` noch `.git/worktrees/*` kopieren oder
commiten. Git verwaltet Worktree-Metadaten im gemeinsamen Repository-Verzeichnis.
Der zweite Worktree braucht denselben Git-Verlauf, aber einen eigenen Checkout.

## Parallele Aufgaben mit `git worktree`

[`scripts/remote-worktree.mjs`](../scripts/remote-worktree.mjs) legt neue
Task-Worktrees außerhalb des Klons an. Standardmäßig verwendet es
`~/.local/state/shinon-forge/worktrees`; mit `SHINON_WORKTREE_HOME` lässt sich
der Ablageort pro Rechner setzen.

```bash
# Im Hauptklon: neuer Branch work/readme-faq und separater Checkout
npm run worktree -- create readme-faq

# Liste der verknüpften Checkouts
npm run worktree -- list

# Änderungen im Task-Checkout committen und zum Remote übertragen
cd ~/.local/state/shinon-forge/worktrees/readme-faq
git status
git push -u origin work/readme-faq

# Nach Merge und sauberem Arbeitsbaum den Worktree entfernen
cd /pfad/zum/hauptklon
npm run worktree -- remove ~/.local/state/shinon-forge/worktrees/readme-faq
```

Der Remove-Befehl nutzt Git ohne `--force`; Änderungen oder ungetrackte Dateien
verhindern das Entfernen. Ein alternativer Ablageort, etwa ein bereits
verwendeter Freebuff-Worktree-Bereich, bleibt außerhalb von GitHub:

```bash
export SHINON_WORKTREE_HOME="$HOME/.freebuff/worktrees/shinon-forge"
npm run worktree -- create ci-audit
```

Nur neue Branches werden erstellt. Für einen vorhandenen Remote-Branch zuerst
`git fetch origin`, dann den Branch mit Git selbst als Worktree auschecken:

```bash
git worktree add /pfad/ausserhalb/des/klons --track -b task-name origin/task-name
```

## Übergabe an einen anderen Rechner

1. Änderungen committen und pushen; private lokale Dateien bleiben außen vor.
2. Auf dem Zielrechner `git fetch` und den Branch auschecken oder den Task-Worktree
   dort neu anlegen.
3. `npm ci`, `npm run profile:links` und die für die Aufgabe passenden gezielten
   Checks ausführen.
4. Ergebnisse und noch offene Belege in `docs/CLEANREPO-AUDIT.md` oder der
   zuständigen Roadmap-Aufgabe festhalten. Nicht in `.freebuff/`.

Weitere Vorgaben liegen in [`AGENTS.md`](../AGENTS.md); Installationsdetails in
[`SETUP.md`](SETUP.md).
