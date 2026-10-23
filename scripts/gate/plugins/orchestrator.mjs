/**
 * orchestrator — der Turn-Vertrag (`shinon.turn/v1`) gegen den Baum.
 *
 * Geprüft wird die statische Seite: Reihenfolge der Pflicht-Teilnehmer im
 * aufgelösten Profil, Eigentum der exklusiven und geteilten Kanäle, die
 * entschiedene Profil-Config und die Form des Vertrags. Der Lauf selbst bleibt
 * beim Profiltest (`dsh --profile shinon --dump-config`).
 *
 * Die Arbeit liegt in `scripts/lib/turn-contract.mjs`: der Gate-Test fährt
 * dieselbe Implementierung auf einem Miniatur-Baum, damit Plugin und Test nicht
 * zwei Regelsätze werden.
 */
import { turnContractIssues } from '../../lib/turn-contract.mjs';

export const id = 'orchestrator';

export function check(ctx) {
  return turnContractIssues(ctx);
}
