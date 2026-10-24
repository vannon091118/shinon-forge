/**
 * memory-proposal-seam.js — die Naht des Lernpruefers in das Nutzer-Gedaechtnis.
 *
 * Eigentuemer-Grenze (SH-LEARN-04): der Reviewer schlaegt VOR, die Persona
 * entscheidet. Diese Datei besitzt den Dienst, den er dafuer braucht — genau
 * eine Faehigkeit (`propose`), kein Lesen, kein Loeschen, kein direktes
 * Schreiben in `shinon.persona-memory/v1`. Der Eintrag ruft nur `install`.
 *
 * Warum die Datei existiert: die Naht hat eine eigene Regel (ein Vertrag, ein
 * Dienst, eine Faehigkeit), und der Host-Eintrag hat eine harte Zeilengrenze.
 * Der Vertragsname steht in `@shinon/seams`; hier wird er nur angeboten — die
 * Gleichheit beider Seiten pinnt `test/memory-proposal.test.mjs`.
 */
import { PERSONA_MEMORY_PROPOSAL_CONTRACT, PERSONA_MEMORY_PROPOSAL_SERVICE } from '@shinon/seams/core';

export { PERSONA_MEMORY_PROPOSAL_CONTRACT, PERSONA_MEMORY_PROPOSAL_SERVICE };

/**
 * Den Dienst bereitstellen und den Disposer zurueckgeben.
 *
 * `runtime.propose` prueft selbst (Vertrag, Groesse, Duplikat, Geheimnis,
 * Kapazitaet, Workspace) — der Dienst ist die Weiterleitung, keine zweite
 * Pruefung. Ein Profil ohne Lernpruefung bekommt den Dienst trotzdem: ob
 * geschrieben wird, entscheidet der Aufrufer, nicht die Persona.
 */
export function installMemoryProposalSeam({ bus, runtime }) {
  return bus.provide(PERSONA_MEMORY_PROPOSAL_SERVICE, {
    contract: PERSONA_MEMORY_PROPOSAL_CONTRACT,
    propose: (payload) => runtime.propose(payload),
  });
}
