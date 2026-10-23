#!/usr/bin/env node
/**
 * Narrow generator for the CodingMon-50 client mirror. This is deliberately
 * not a general bundler: only the named data regions are writable.
 *
 * Geschrieben wird in die QUELLTEILE (`assets/client/`), nicht in `client.js`:
 * das Bundle ist generiert (`scripts/build-client.mjs`) und ein Lauf dieses
 * Skripts wuerde sonst beim naechsten `build-client` ueberschrieben. Welcher
 * Teil eine Region traegt, wird gesucht, nicht verdrahtet (`findBlockFile`).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBlockFile, writeBlockBody } from '../lib/embed-blocks.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const DATA_FILE = join(ROOT, 'packages', 'codingmon', 'assets', 'data', 'codingmon-50.json');
const PARTS_DIR = join(ROOT, 'packages', 'codingmon', 'assets', 'client');
const LF = String.fromCharCode(10);
const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
function validate(d) {
  const ids=d.species.map(s=>s.id), idSet=new Set(ids), moveIds=d.abilities.map(a=>a.id), moveSet=new Set(moveIds);
  if(ids.length!==50||idSet.size!==50) throw new Error('Quelle muss 50 eindeutige Spezies enthalten');
  if(moveIds.length!==101||new Set(moveIds).size!==101) throw new Error('Quelle muss 101 eindeutige Fähigkeiten enthalten');
  if(Object.keys(d.lineage).length!==50) throw new Error('Linientabelle muss 50 IDs enthalten');
  for(const s of d.species){
    if(!d.lineage[s.id]||d.lineage[s.id].depth!==s.lineageDepth||d.lineage[s.id].ancestor!==(s.ancestor??null)) throw new Error('Linien-/Tiefenkonflikt: '+s.id);
    for(const id of [...(s.abilityIds??[]),...(s.inheritedAbilityIds??[])]) if(!moveSet.has(id)) throw new Error('Fehlender Zug '+s.id+' -> '+id);
    for(const child of s.children??[]) if(!idSet.has(child)||d.lineage[child].ancestor!==s.id) throw new Error('Fehlender Nachkomme '+s.id+' -> '+child);
  }
  for(const [id,line] of Object.entries(d.lineage)){const seen=new Set([id]);let p=line.ancestor??null;while(p!==null){if(!d.lineage[p]||seen.has(p))throw new Error('Zyklus/fehlende Linie: '+id);seen.add(p);p=d.lineage[p].ancestor??null;}}
  for(const a of d.abilities)if(a.species!==null&&!idSet.has(a.species))throw new Error('Fähigkeit mit unbekannter Art: '+a.id);
  if(d.lootTable.reduce((n,x)=>n+x.weight,0)!==10000)throw new Error('Loot-Gewichte müssen 10000 ergeben');
  return {species:ids.length,abilities:moveIds.length};
}
const counts=validate(data);
const species=Object.fromEntries(data.species.map(s=>[s.id,{
 id:s.id,label:s.name,name:s.name,family:s.family,hue:s.hue,hp:s.stats.hp,atk:s.stats.atk,def:s.stats.def,agi:s.stats.agi,int:s.stats.int,
 ancestor:s.ancestor??null,lineageDepth:s.lineageDepth,depth:s.lineageDepth,abilityIds:s.abilityIds??[],inheritedAbilityIds:s.inheritedAbilityIds??[],
 traits:s.traits??[],role:s.role,rarity:s.rarity,description:s.description,children:s.children??[],unlock:s.unlock??null,lineageBranch:s.lineageBranch??null
}]));
const lineage=Object.fromEntries(Object.entries(data.lineage).map(([id,l])=>[id,{ancestor:l.ancestor??null,depth:l.depth,generation:l.depth,inherits:[...(l.inherits??[])]}]));
const elements=Object.fromEntries(Object.entries(data.metadata.elements).map(([id,e])=>[id,{label:e.label,beats:e.matchup_beats,losesTo:e.loses_to}]));
const buffs=data.buffs.map(b=>({id:b.id,label:b.label,factor:b.factor,test:b.trigger==='inherited'?'inherited':b.trigger==='hp < 25%'?'low-hp':b.trigger==='hp >= 90%'?'full-hp':null}));
const loot=data.lootTable.map(v=>({...v}));
const regions=[
 ['generated-codingmon-catalog',`    const SPECIES = ${JSON.stringify(species)};\n    const SPECIES_IDS = Object.keys(SPECIES);\n    const ABILITIES = ${JSON.stringify(data.abilities)};`],
 ['generated-codingmon-lineage',`    const LINEAGE = ${JSON.stringify(lineage)};`],
 ['generated-codingmon-elements',`    const ELEMENTS = ${JSON.stringify(elements)};\n    const ELEMENT_WIN = 1.5;\n    const ELEMENT_LOSS = 0.75;\n    const ELEMENT_CHART = ${JSON.stringify(data.elementChart)};`],
 ['generated-codingmon-buffs',`    const BUFFS = ${JSON.stringify(buffs)};`],
 ['generated-codingmon-loot',`    const LOOT_TABLE = ${JSON.stringify(loot)};\n    const LOOT_TOTAL = LOOT_TABLE.reduce((sum, entry) => sum + entry.weight, 0);`],
];
function update(source,region,body){return writeBlockBody(source,region,body);}
const check=process.argv.includes('--check'), write=process.argv.includes('--write');
if(check===write)throw new Error('Nutzung: build-codingmon.mjs --write | --check');
let changed=0;
for(const [name,body] of regions){
 const file=findBlockFile(PARTS_DIR,name);
 const actual=readFileSync(file,'utf8'), expected=update(actual,name,body);
 if(expected===actual)continue;
 if(check)throw new Error('Client-Spiegel ist veraltet ('+name+'); node scripts/assets/build-codingmon.mjs --write ausführen');
 writeFileSync(file,expected); changed+=1;
}
console.log('OK CodingMon-Datenregionen '+(check?'deckungsgleich':'geschrieben ('+changed+' Region(en) geändert)')+' ('+counts.species+' Arten, '+counts.abilities+' Fähigkeiten)');
