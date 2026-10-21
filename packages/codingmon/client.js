/**
 * @shinon/codingmon — Client-Hälfte (Codemons + Arena).
 *
 * Die Marken-Slots von Sidebar und Hero haelt @shinon/core; dieser Client gibt
 * allein den ZUSTAND heraus (ueber `window.__codingmon`, dasselbe Muster wie
 * `window.__mk` bei @shinon/markers, damit Pakete referenzfrei bleiben).
 *
 * ZEHN CODEMONS: Werte, Faehigkeiten und Gegnerauswahl stehen in `SPECIES`,
 * `ABILITIES` und `arenaFor()` — gespiegelt aus der Host-Hälfte in index.js
 * (dieselbe Formel, dieselbe Tabelle, dieselbe Reihenfolge); zusaetzlich lebt
 * hier ZUSTAND (XP, HP, Runde) und Darstellung.
 *
 * KAMPF: rundenbasiert, ausgeloest durch Klick; der Gegner antwortet sofort mit
 * seiner Faehigkeit, wer zuerst schlaegt entscheidet die AGI (Gleichstand an
 * den Herausforderer). Jede Zahl im Log kommt aus einer reinen Funktion
 * (damage), nicht aus einer Animation.
 *
 * XP: Fortschritt kommt aus erfolgreichen Agent-Completions und Kampfsiegen.
 * Der Host zaehlt erfolgreiche `turn/end`-Ereignisse; der Client liest diesen
 * Zaehler und belohnt neue Completions. Tokenverbrauch hat keinen Einfluss auf XP.
 */
window.__ModuleLoader__.load({
  id: '@shinon/codingmon',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PLUGIN = '@shinon/codingmon';
    const PANEL_ID = 'shinon-codingmon';
    /** Speicher-Schluessel. Bleibt derselbe, damit alte Staende nicht verloren gehen. */
    const STORAGE_KEY = 'shinon.codingmon/v1';
    /** Stand der Ablage. v2 = Eskalation, Regelwerk, Loot, Sperre. */
    const STORE_VERSION = 3;
    /** XP-Basis der ersten Stufe, kumulativ und quadratisch. */
    const XP_BASE = 250;

    // ── Vertrag (Spiegel der Host-Hälfte in index.js) ───────────────────────
    // Bewusst dupliziert: Client- und Host-Bundle teilen keinen Code, und ein
    // Import quer ueber Pakete ist in diesem Repo nicht erlaubt.
    // >>> generated-codingmon-catalog — source: assets/data/codingmon-50.json
    const SPECIES = {"nullpointer":{"id":"nullpointer","label":"NullPointer","name":"NullPointer","family":"spark","hue":268,"hp":44,"atk":10,"def":6,"agi":9,"int":8,"ancestor":null,"lineageDepth":1,"depth":1,"abilityIds":["deref","null-access"],"inheritedAbilityIds":[],"traits":["Leere Referenz","Präzisionsangriff"],"role":"void-sprite","rarity":"original","description":"Ein kleiner Geist aus ungültigen Speicheradressen.","children":["racecondition","nullprism"],"unlock":{"type":"starter","requirement":"Startkonfiguration"},"lineageBranch":null},"stackoverflow":{"id":"stackoverflow","label":"StackOverflow","name":"StackOverflow","family":"byte","hue":10,"hp":40,"atk":8,"def":7,"agi":7,"int":12,"ancestor":null,"lineageDepth":1,"depth":1,"abilityIds":["recursion-dive","trace-back"],"inheritedAbilityIds":[],"traits":["Gedächtnis","Arkan"],"role":"stack-golem","rarity":"original","description":"Ein stapelnder Wächter, der Wissen Schicht um Schicht aufbaut.","children":["deadlock","stackwisp"],"unlock":{"type":"starter","requirement":"Startkonfiguration"},"lineageBranch":null},"memoryleak":{"id":"memoryleak","label":"MemoryLeak","name":"MemoryLeak","family":"feral","hue":96,"hp":58,"atk":9,"def":5,"agi":5,"int":9,"ancestor":null,"lineageDepth":1,"depth":1,"abilityIds":["page-fault","heap-flood"],"inheritedAbilityIds":[],"traits":["Ausdauer","Regeneration"],"role":"moss-beast","rarity":"original","description":"Ein moosiger Datenfresser, der Energie hortet.","children":["segfault","cachewraith"],"unlock":{"type":"starter","requirement":"Startkonfiguration"},"lineageBranch":null},"racecondition":{"id":"racecondition","label":"RaceCondition","name":"RaceCondition","family":"spark","hue":190,"hp":36,"atk":8,"def":6,"agi":14,"int":7,"ancestor":"nullpointer","lineageDepth":2,"depth":2,"abilityIds":["interleave","torn-read"],"inheritedAbilityIds":["null-access"],"traits":["Tempo","Doppeltakt"],"role":"speed-wisp","rarity":"original","description":"Ein flinker Funkenläufer, der vor dem eigenen Schatten angreift.","children":["offbyone","threadlet"],"unlock":{"type":"lineage","requirement":"Abstammung / Freischaltung"},"lineageBranch":null},"deadlock":{"id":"deadlock","label":"Deadlock","name":"Deadlock","family":"byte","hue":264,"hp":62,"atk":8,"def":12,"agi":3,"int":6,"ancestor":"stackoverflow","lineageDepth":2,"depth":2,"abilityIds":["barrier","starve"],"inheritedAbilityIds":["trace-back"],"traits":["Panzerung","Kontrolle"],"role":"iron-golem","rarity":"original","description":"Ein starrer Blockadegolem, der Gegner in Stellungskämpfe zwingt.","children":["heisenbug","mutexling"],"unlock":{"type":"lineage","requirement":"Abstammung / Freischaltung"},"lineageBranch":null},"segfault":{"id":"segfault","label":"SegFault","name":"SegFault","family":"feral","hue":0,"hp":46,"atk":13,"def":6,"agi":8,"int":4,"ancestor":"memoryleak","lineageDepth":2,"depth":2,"abilityIds":["dangling-pointer","core-dump"],"inheritedAbilityIds":["heap-flood"],"traits":["Durchbruch","Nahkampf"],"role":"claw-beast","rarity":"original","description":"Ein Krallenjäger, dessen Treffer jede Struktur aufreißen.","children":["bufferoverflow","faultling"],"unlock":{"type":"lineage","requirement":"Abstammung / Freischaltung"},"lineageBranch":null},"offbyone":{"id":"offbyone","label":"OffByOne","name":"OffByOne","family":"spark","hue":40,"hp":38,"atk":9,"def":7,"agi":11,"int":8,"ancestor":"racecondition","lineageDepth":3,"depth":3,"abilityIds":["nudge","boundary-slip"],"inheritedAbilityIds":["torn-read"],"traits":["Ausweichen","Grenztrick"],"role":"boundary-fox","rarity":"original","description":"Ein Grenzgänger, der jede Lücke um genau einen Schritt findet.","children":["recursion","indeximp"],"unlock":{"type":"lineage","requirement":"Abstammung / Freischaltung"},"lineageBranch":null},"bufferoverflow":{"id":"bufferoverflow","label":"BufferOverflow","name":"BufferOverflow","family":"feral","hue":320,"hp":54,"atk":12,"def":8,"agi":5,"int":5,"ancestor":"segfault","lineageDepth":3,"depth":3,"abilityIds":["smash","stack-smash"],"inheritedAbilityIds":["core-dump"],"traits":["Wucht","Überladung"],"role":"overflow-brute","rarity":"original","description":"Ein wuchtiger Brecher, dessen Kraft den eigenen Rahmen sprengt.","children":["bufferbug"],"unlock":{"type":"lineage","requirement":"Abstammung / Freischaltung"},"lineageBranch":null},"heisenbug":{"id":"heisenbug","label":"Heisenbug","name":"Heisenbug","family":"byte","hue":285,"hp":42,"atk":7,"def":6,"agi":10,"int":13,"ancestor":"deadlock","lineageDepth":3,"depth":3,"abilityIds":["obfuscate","observation-collapse"],"inheritedAbilityIds":["starve"],"traits":["Täuschung","Analyse"],"role":"phase-phantom","rarity":"original","description":"Ein Beobachtungsphantom, dessen Muster sich kaum festhalten lassen.","children":["phantomtrace"],"unlock":{"type":"lineage","requirement":"Abstammung / Freischaltung"},"lineageBranch":null},"recursion":{"id":"recursion","label":"Recursion","name":"Recursion","family":"spark","hue":150,"hp":50,"atk":10,"def":9,"agi":6,"int":9,"ancestor":"offbyone","lineageDepth":4,"depth":4,"abilityIds":["base-case","infinite-descent"],"inheritedAbilityIds":["boundary-slip"],"traits":["Kettenangriff","Zyklus"],"role":"loop-drake","rarity":"original","description":"Ein Schleifendrache, der aus jedem Ende einen neuen Anfang macht.","children":["basecase"],"unlock":{"type":"lineage","requirement":"Abstammung / Freischaltung"},"lineageBranch":null},"nullprism":{"id":"nullprism","label":"NullPrism","name":"NullPrism","family":"spark","hue":178,"hp":46,"atk":11,"def":6,"agi":10,"int":10,"ancestor":"nullpointer","lineageDepth":2,"depth":2,"abilityIds":["nullprism-pulse","nullprism-surge"],"inheritedAbilityIds":["null-access"],"traits":["Crystal Wisp","Erblinie NullPointer"],"role":"crystal-wisp","rarity":"lineage-2","description":"Ein Prismengeist, der ungültige Zeiger in klares Licht bricht.","children":["derefang"],"unlock":{"type":"lineage","requirement":"Abstammung von NullPointer"},"lineageBranch":"nullpointer"},"derefang":{"id":"derefang","label":"DereFang","name":"DereFang","family":"byte","hue":288,"hp":49,"atk":14,"def":6,"agi":11,"int":10,"ancestor":"nullprism","lineageDepth":3,"depth":3,"abilityIds":["derefang-pulse","derefang-surge"],"inheritedAbilityIds":["nullprism-surge"],"traits":["Void Wolf","Erblinie NullPrism"],"role":"void-wolf","rarity":"lineage-3","description":"Ein leiser Jäger, der Referenzen mit einem einzigen Biss auftrennt.","children":["voidseraph"],"unlock":{"type":"lineage","requirement":"Abstammung von NullPrism"},"lineageBranch":"nullpointer"},"voidseraph":{"id":"voidseraph","label":"VoidSeraph","name":"VoidSeraph","family":"spark","hue":168,"hp":50,"atk":14,"def":8,"agi":12,"int":13,"ancestor":"derefang","lineageDepth":4,"depth":4,"abilityIds":["voidseraph-pulse","voidseraph-surge"],"inheritedAbilityIds":["derefang-surge"],"traits":["Winged Void","Erblinie DereFang"],"role":"winged-void","rarity":"lineage-4","description":"Ein schwebender Wächter der Leere mit gefalteten Lichtflügeln.","children":["zerooracle"],"unlock":{"type":"lineage","requirement":"Abstammung von DereFang"},"lineageBranch":"nullpointer"},"zerooracle":{"id":"zerooracle","label":"ZeroOracle","name":"ZeroOracle","family":"feral","hue":104,"hp":54,"atk":15,"def":10,"agi":11,"int":17,"ancestor":"voidseraph","lineageDepth":5,"depth":5,"abilityIds":["zerooracle-pulse","zerooracle-surge"],"inheritedAbilityIds":["voidseraph-surge"],"traits":["Oracle Beast","Erblinie VoidSeraph"],"role":"oracle-beast","rarity":"lineage-5","description":"Ein Orakelwesen, das im Nichts verborgene Pfade erkennt.","children":[],"unlock":{"type":"lineage","requirement":"Abstammung von VoidSeraph"},"lineageBranch":"nullpointer"},"stackwisp":{"id":"stackwisp","label":"StackWisp","name":"StackWisp","family":"byte","hue":286,"hp":42,"atk":8,"def":8,"agi":9,"int":14,"ancestor":"stackoverflow","lineageDepth":2,"depth":2,"abilityIds":["stackwisp-pulse","stackwisp-surge"],"inheritedAbilityIds":["trace-back"],"traits":["Layer Ghost","Erblinie StackOverflow"],"role":"layer-ghost","rarity":"lineage-2","description":"Ein mehrschichtiger Funke, dessen Gedächtnis nie den Faden verliert.","children":["callstacker"],"unlock":{"type":"lineage","requirement":"Abstammung von StackOverflow"},"lineageBranch":"stackoverflow"},"callstacker":{"id":"callstacker","label":"CallStacker","name":"CallStacker","family":"spark","hue":166,"hp":46,"atk":10,"def":10,"agi":9,"int":15,"ancestor":"stackwisp","lineageDepth":3,"depth":3,"abilityIds":["callstacker-pulse","callstacker-surge"],"inheritedAbilityIds":["stackwisp-surge"],"traits":["Callstack Knight","Erblinie StackWisp"],"role":"callstack-knight","rarity":"lineage-3","description":"Ein Ritter, der jeden Aufruf in einer schwebenden Rune ablegt.","children":["overflowarchon"],"unlock":{"type":"lineage","requirement":"Abstammung von StackWisp"},"lineageBranch":"stackoverflow"},"overflowarchon":{"id":"overflowarchon","label":"OverflowArchon","name":"OverflowArchon","family":"byte","hue":276,"hp":49,"atk":11,"def":13,"agi":8,"int":19,"ancestor":"callstacker","lineageDepth":4,"depth":4,"abilityIds":["overflowarchon-pulse","overflowarchon-surge"],"inheritedAbilityIds":["callstacker-surge"],"traits":["Arcane Construct","Erblinie CallStacker"],"role":"arcane-construct","rarity":"lineage-4","description":"Ein arkaner Archon, der unendlich viele Schichten ordnet.","children":["stacktitan"],"unlock":{"type":"lineage","requirement":"Abstammung von CallStacker"},"lineageBranch":"stackoverflow"},"stacktitan":{"id":"stacktitan","label":"StackTitan","name":"StackTitan","family":"feral","hue":62,"hp":57,"atk":15,"def":17,"agi":6,"int":21,"ancestor":"overflowarchon","lineageDepth":5,"depth":5,"abilityIds":["stacktitan-pulse","stacktitan-surge"],"inheritedAbilityIds":["overflowarchon-surge"],"traits":["Tower Giant","Erblinie OverflowArchon"],"role":"tower-giant","rarity":"lineage-5","description":"Ein riesiger Stapeltitan mit steinernen Ebenen und glühendem Kern.","children":[],"unlock":{"type":"lineage","requirement":"Abstammung von OverflowArchon"},"lineageBranch":"stackoverflow"},"cachewraith":{"id":"cachewraith","label":"CacheWraith","name":"CacheWraith","family":"feral","hue":70,"hp":62,"atk":9,"def":5,"agi":5,"int":11,"ancestor":"memoryleak","lineageDepth":2,"depth":2,"abilityIds":["cachewraith-pulse","cachewraith-surge"],"inheritedAbilityIds":["heap-flood"],"traits":["Moss Ghost","Erblinie MemoryLeak"],"role":"moss-ghost","rarity":"lineage-2","description":"Ein gespeicherter Schatten, der Wärme und Erinnerungen sammelt.","children":["heapgolem"],"unlock":{"type":"lineage","requirement":"Abstammung von MemoryLeak"},"lineageBranch":"memoryleak"},"heapgolem":{"id":"heapgolem","label":"HeapGolem","name":"HeapGolem","family":"byte","hue":274,"hp":70,"atk":11,"def":9,"agi":3,"int":11,"ancestor":"cachewraith","lineageDepth":3,"depth":3,"abilityIds":["heapgolem-pulse","heapgolem-surge"],"inheritedAbilityIds":["cachewraith-surge"],"traits":["Heap Construct","Erblinie CacheWraith"],"role":"heap-construct","rarity":"lineage-3","description":"Ein schwerer Golem aus versiegelten Speicherblöcken.","children":["leakhydra"],"unlock":{"type":"lineage","requirement":"Abstammung von CacheWraith"},"lineageBranch":"memoryleak"},"leakhydra":{"id":"leakhydra","label":"LeakHydra","name":"LeakHydra","family":"feral","hue":130,"hp":76,"atk":15,"def":10,"agi":3,"int":12,"ancestor":"heapgolem","lineageDepth":4,"depth":4,"abilityIds":["leakhydra-pulse","leakhydra-surge"],"inheritedAbilityIds":["heapgolem-surge"],"traits":["Many Headed Beast","Erblinie HeapGolem"],"role":"many-headed-beast","rarity":"lineage-4","description":"Eine Hydra, bei der jeder verlorene Tropfen einen neuen Kopf formt.","children":["memoryphoenix"],"unlock":{"type":"lineage","requirement":"Abstammung von HeapGolem"},"lineageBranch":"memoryleak"},"memoryphoenix":{"id":"memoryphoenix","label":"MemoryPhoenix","name":"MemoryPhoenix","family":"spark","hue":184,"hp":79,"atk":18,"def":10,"agi":6,"int":17,"ancestor":"leakhydra","lineageDepth":5,"depth":5,"abilityIds":["memoryphoenix-pulse","memoryphoenix-surge"],"inheritedAbilityIds":["leakhydra-surge"],"traits":["Memory Bird","Erblinie LeakHydra"],"role":"memory-bird","rarity":"lineage-5","description":"Ein Phönix, der verlorene Erinnerungen aus glühender Asche zurückholt.","children":[],"unlock":{"type":"lineage","requirement":"Abstammung von LeakHydra"},"lineageBranch":"memoryleak"},"threadlet":{"id":"threadlet","label":"Threadlet","name":"Threadlet","family":"spark","hue":192,"hp":36,"atk":9,"def":6,"agi":17,"int":7,"ancestor":"racecondition","lineageDepth":3,"depth":3,"abilityIds":["threadlet-pulse","threadlet-surge"],"inheritedAbilityIds":["torn-read"],"traits":["Thread Sprite","Erblinie RaceCondition"],"role":"thread-sprite","rarity":"lineage-2","description":"Ein winziger Prozessgeist, der zwei Wege gleichzeitig einschlägt.","children":["raceweaver"],"unlock":{"type":"lineage","requirement":"Abstammung von RaceCondition"},"lineageBranch":"racecondition"},"raceweaver":{"id":"raceweaver","label":"RaceWeaver","name":"RaceWeaver","family":"feral","hue":128,"hp":38,"atk":11,"def":7,"agi":19,"int":8,"ancestor":"threadlet","lineageDepth":4,"depth":4,"abilityIds":["raceweaver-pulse","raceweaver-surge"],"inheritedAbilityIds":["threadlet-surge"],"traits":["Web Runner","Erblinie Threadlet"],"role":"web-runner","rarity":"lineage-3","description":"Ein schneller Weber, der Zeitlinien zu einem Netz verknüpft.","children":["temporlock"],"unlock":{"type":"lineage","requirement":"Abstammung von Threadlet"},"lineageBranch":"racecondition"},"temporlock":{"id":"temporlock","label":"TemporLock","name":"TemporLock","family":"spark","hue":182,"hp":42,"atk":12,"def":9,"agi":21,"int":11,"ancestor":"raceweaver","lineageDepth":5,"depth":5,"abilityIds":["temporlock-pulse","temporlock-surge"],"inheritedAbilityIds":["raceweaver-surge"],"traits":["Time Lock","Erblinie RaceWeaver"],"role":"time-lock","rarity":"lineage-4","description":"Ein zeitversetzter Läufer, der Momente wie Scharniere verriegelt.","children":["quantumracer"],"unlock":{"type":"lineage","requirement":"Abstammung von RaceWeaver"},"lineageBranch":"racecondition"},"quantumracer":{"id":"quantumracer","label":"QuantumRacer","name":"QuantumRacer","family":"byte","hue":292,"hp":44,"atk":16,"def":10,"agi":21,"int":15,"ancestor":"temporlock","lineageDepth":6,"depth":6,"abilityIds":["quantumracer-pulse","quantumracer-surge"],"inheritedAbilityIds":["temporlock-surge"],"traits":["Quantum Beast","Erblinie TemporLock"],"role":"quantum-beast","rarity":"lineage-5","description":"Ein Quantenrenner, der vor seiner eigenen Bewegung ankommt.","children":[],"unlock":{"type":"lineage","requirement":"Abstammung von TemporLock"},"lineageBranch":"racecondition"},"mutexling":{"id":"mutexling","label":"Mutexling","name":"Mutexling","family":"byte","hue":300,"hp":65,"atk":9,"def":14,"agi":3,"int":8,"ancestor":"deadlock","lineageDepth":3,"depth":3,"abilityIds":["mutexling-pulse","mutexling-surge"],"inheritedAbilityIds":["starve"],"traits":["Lockling","Erblinie Deadlock"],"role":"lockling","rarity":"lineage-2","description":"Ein kleiner Schlossgeist, der den Zugang zu jeder Tür bewacht.","children":["lockwarden"],"unlock":{"type":"lineage","requirement":"Abstammung von Deadlock"},"lineageBranch":"deadlock"},"lockwarden":{"id":"lockwarden","label":"LockWarden","name":"LockWarden","family":"feral","hue":86,"hp":70,"atk":11,"def":18,"agi":3,"int":10,"ancestor":"mutexling","lineageDepth":4,"depth":4,"abilityIds":["lockwarden-pulse","lockwarden-surge"],"inheritedAbilityIds":["mutexling-surge"],"traits":["Armored Warden","Erblinie Mutexling"],"role":"armored-warden","rarity":"lineage-3","description":"Ein gepanzerter Wächter, der gegnerische Züge einfriert.","children":["stalemateon"],"unlock":{"type":"lineage","requirement":"Abstammung von Mutexling"},"lineageBranch":"deadlock"},"stalemateon":{"id":"stalemateon","label":"Stalemateon","name":"Stalemateon","family":"byte","hue":290,"hp":74,"atk":14,"def":21,"agi":4,"int":13,"ancestor":"lockwarden","lineageDepth":5,"depth":5,"abilityIds":["stalemateon-pulse","stalemateon-surge"],"inheritedAbilityIds":["lockwarden-surge"],"traits":["Stalemate Knight","Erblinie LockWarden"],"role":"stalemate-knight","rarity":"lineage-4","description":"Ein Duellant, der jede Schlacht in ein Patt verwandelt.","children":["foreverwait"],"unlock":{"type":"lineage","requirement":"Abstammung von LockWarden"},"lineageBranch":"deadlock"},"foreverwait":{"id":"foreverwait","label":"ForeverWait","name":"ForeverWait","family":"spark","hue":170,"hp":77,"atk":15,"def":22,"agi":7,"int":18,"ancestor":"stalemateon","lineageDepth":6,"depth":6,"abilityIds":["foreverwait-pulse","foreverwait-surge"],"inheritedAbilityIds":["stalemateon-surge"],"traits":["Waiting Phantom","Erblinie Stalemateon"],"role":"waiting-phantom","rarity":"lineage-5","description":"Ein gespenstischer Zeitwächter, der Geduld zur Waffe macht.","children":[],"unlock":{"type":"lineage","requirement":"Abstammung von Stalemateon"},"lineageBranch":"deadlock"},"faultling":{"id":"faultling","label":"Faultling","name":"Faultling","family":"feral","hue":84,"hp":47,"atk":15,"def":6,"agi":9,"int":5,"ancestor":"segfault","lineageDepth":3,"depth":3,"abilityIds":["faultling-pulse","faultling-surge"],"inheritedAbilityIds":["core-dump"],"traits":["Fault Imp","Erblinie SegFault"],"role":"fault-imp","rarity":"lineage-2","description":"Ein scharfkantiger Imp, der Fehlerlinien erschnuppert.","children":["coremaw"],"unlock":{"type":"lineage","requirement":"Abstammung von SegFault"},"lineageBranch":"segfault"},"coremaw":{"id":"coremaw","label":"CoreMaw","name":"CoreMaw","family":"spark","hue":208,"hp":51,"atk":20,"def":8,"agi":9,"int":5,"ancestor":"faultling","lineageDepth":4,"depth":4,"abilityIds":["coremaw-pulse","coremaw-surge"],"inheritedAbilityIds":["faultling-surge"],"traits":["Core Beast","Erblinie Faultling"],"role":"core-beast","rarity":"lineage-3","description":"Ein Kernfresser mit leuchtendem Rachen und gesplitterten Schuppen.","children":["coredrake"],"unlock":{"type":"lineage","requirement":"Abstammung von Faultling"},"lineageBranch":"segfault"},"coredrake":{"id":"coredrake","label":"CoreDrake","name":"CoreDrake","family":"feral","hue":74,"hp":56,"atk":23,"def":10,"agi":10,"int":7,"ancestor":"coremaw","lineageDepth":5,"depth":5,"abilityIds":["coredrake-pulse","coredrake-surge"],"inheritedAbilityIds":["coremaw-surge"],"traits":["Core Dragon","Erblinie CoreMaw"],"role":"core-dragon","rarity":"lineage-4","description":"Ein Kerndrache, dessen Atem wie ein abstürzender Prozess lodert.","children":["crashcolossus"],"unlock":{"type":"lineage","requirement":"Abstammung von CoreMaw"},"lineageBranch":"segfault"},"crashcolossus":{"id":"crashcolossus","label":"CrashColossus","name":"CrashColossus","family":"byte","hue":278,"hp":66,"atk":23,"def":15,"agi":7,"int":9,"ancestor":"coredrake","lineageDepth":6,"depth":6,"abilityIds":["crashcolossus-pulse","crashcolossus-surge"],"inheritedAbilityIds":["coredrake-surge"],"traits":["Colossus","Erblinie CoreDrake"],"role":"colossus","rarity":"lineage-5","description":"Ein kolossaler Codewächter, der mit jedem Schritt den Boden erschüttert.","children":[],"unlock":{"type":"lineage","requirement":"Abstammung von CoreDrake"},"lineageBranch":"segfault"},"indeximp":{"id":"indeximp","label":"IndexImp","name":"IndexImp","family":"spark","hue":206,"hp":38,"atk":10,"def":7,"agi":14,"int":9,"ancestor":"offbyone","lineageDepth":4,"depth":4,"abilityIds":["indeximp-pulse","indeximp-surge"],"inheritedAbilityIds":["boundary-slip"],"traits":["Index Imp","Erblinie OffByOne"],"role":"index-imp","rarity":"lineage-2","description":"Ein kleiner Grenzimp, der immer genau einen Schritt zu weit springt.","children":["boundarybeast"],"unlock":{"type":"lineage","requirement":"Abstammung von OffByOne"},"lineageBranch":"offbyone"},"boundarybeast":{"id":"boundarybeast","label":"BoundaryBeast","name":"BoundaryBeast","family":"byte","hue":246,"hp":43,"atk":12,"def":10,"agi":14,"int":10,"ancestor":"indeximp","lineageDepth":5,"depth":5,"abilityIds":["boundarybeast-pulse","boundarybeast-surge"],"inheritedAbilityIds":["indeximp-surge"],"traits":["Boundary Bear","Erblinie IndexImp"],"role":"boundary-bear","rarity":"lineage-3","description":"Ein kräftiger Grenzbär mit einem Panzer aus geschlossenen Klammern.","children":["indexeater"],"unlock":{"type":"lineage","requirement":"Abstammung von IndexImp"},"lineageBranch":"offbyone"},"indexeater":{"id":"indexeater","label":"IndexEater","name":"IndexEater","family":"feral","hue":102,"hp":46,"atk":16,"def":11,"agi":16,"int":11,"ancestor":"boundarybeast","lineageDepth":6,"depth":6,"abilityIds":["indexeater-pulse","indexeater-surge"],"inheritedAbilityIds":["boundarybeast-surge"],"traits":["Index Eater","Erblinie BoundaryBeast"],"role":"index-eater","rarity":"lineage-4","description":"Ein gefräßiger Vierbeiner, der vergessene Indizes verschlingt.","children":["zerowyrm"],"unlock":{"type":"lineage","requirement":"Abstammung von BoundaryBeast"},"lineageBranch":"offbyone"},"zerowyrm":{"id":"zerowyrm","label":"ZeroWyrm","name":"ZeroWyrm","family":"spark","hue":156,"hp":48,"atk":18,"def":13,"agi":20,"int":15,"ancestor":"indexeater","lineageDepth":7,"depth":7,"abilityIds":["zerowyrm-pulse","zerowyrm-surge"],"inheritedAbilityIds":["indexeater-surge"],"traits":["Zero Wyrm","Erblinie IndexEater"],"role":"zero-wyrm","rarity":"lineage-5","description":"Ein Wyrm, der jedes Zählwerk zu seinem Anfang zurückführt.","children":[],"unlock":{"type":"lineage","requirement":"Abstammung von IndexEater"},"lineageBranch":"offbyone"},"bufferbug":{"id":"bufferbug","label":"BufferBug","name":"BufferBug","family":"feral","hue":70,"hp":57,"atk":13,"def":10,"agi":5,"int":6,"ancestor":"bufferoverflow","lineageDepth":4,"depth":4,"abilityIds":["bufferbug-pulse","bufferbug-surge"],"inheritedAbilityIds":["stack-smash"],"traits":["Buffer Beetle","Erblinie BufferOverflow"],"role":"buffer-beetle","rarity":"lineage-2","description":"Ein gedrungener Käfer mit einem Rückenpanzer aus Speicherzellen.","children":["overflowhorn"],"unlock":{"type":"lineage","requirement":"Abstammung von BufferOverflow"},"lineageBranch":"bufferoverflow"},"overflowhorn":{"id":"overflowhorn","label":"OverflowHorn","name":"OverflowHorn","family":"byte","hue":274,"hp":61,"atk":17,"def":11,"agi":6,"int":6,"ancestor":"bufferbug","lineageDepth":5,"depth":5,"abilityIds":["overflowhorn-pulse","overflowhorn-surge"],"inheritedAbilityIds":["bufferbug-surge"],"traits":["Horned Brute","Erblinie BufferBug"],"role":"horned-brute","rarity":"lineage-3","description":"Ein gehörntes Kraftpaket, das seine eigene Kapazität sprengt.","children":["stackravager"],"unlock":{"type":"lineage","requirement":"Abstammung von BufferBug"},"lineageBranch":"bufferoverflow"},"stackravager":{"id":"stackravager","label":"StackRavager","name":"StackRavager","family":"spark","hue":224,"hp":64,"atk":21,"def":13,"agi":8,"int":8,"ancestor":"overflowhorn","lineageDepth":6,"depth":6,"abilityIds":["stackravager-pulse","stackravager-surge"],"inheritedAbilityIds":["overflowhorn-surge"],"traits":["Stack Raider","Erblinie OverflowHorn"],"role":"stack-raider","rarity":"lineage-4","description":"Ein flinker Räuber, der fremde Stapel zu seiner Rüstung macht.","children":["bufferbehemoth"],"unlock":{"type":"lineage","requirement":"Abstammung von OverflowHorn"},"lineageBranch":"bufferoverflow"},"bufferbehemoth":{"id":"bufferbehemoth","label":"BufferBehemoth","name":"BufferBehemoth","family":"feral","hue":90,"hp":76,"atk":23,"def":18,"agi":6,"int":10,"ancestor":"stackravager","lineageDepth":7,"depth":7,"abilityIds":["bufferbehemoth-pulse","bufferbehemoth-surge"],"inheritedAbilityIds":["stackravager-surge"],"traits":["Behemoth","Erblinie StackRavager"],"role":"behemoth","rarity":"lineage-5","description":"Ein uralter Speicherbehemoth mit einem Herz aus verdichtetem Code.","children":[],"unlock":{"type":"lineage","requirement":"Abstammung von StackRavager"},"lineageBranch":"bufferoverflow"},"phantomtrace":{"id":"phantomtrace","label":"PhantomTrace","name":"PhantomTrace","family":"byte","hue":272,"hp":43,"atk":7,"def":7,"agi":13,"int":16,"ancestor":"heisenbug","lineageDepth":4,"depth":4,"abilityIds":["phantomtrace-pulse","phantomtrace-surge"],"inheritedAbilityIds":["observation-collapse"],"traits":["Trace Phantom","Erblinie Heisenbug"],"role":"trace-phantom","rarity":"lineage-2","description":"Ein kaum sichtbarer Spurenleser aus wechselnden Datenmustern.","children":["observoid"],"unlock":{"type":"lineage","requirement":"Abstammung von Heisenbug"},"lineageBranch":"heisenbug"},"observoid":{"id":"observoid","label":"ObserVoid","name":"ObserVoid","family":"spark","hue":222,"hp":45,"atk":9,"def":8,"agi":15,"int":20,"ancestor":"phantomtrace","lineageDepth":5,"depth":5,"abilityIds":["observoid-pulse","observoid-surge"],"inheritedAbilityIds":["phantomtrace-surge"],"traits":["Void Observer","Erblinie PhantomTrace"],"role":"void-observer","rarity":"lineage-3","description":"Ein Auge aus Licht, das erst durch Beobachtung Gestalt annimmt.","children":["heisenwisp"],"unlock":{"type":"lineage","requirement":"Abstammung von PhantomTrace"},"lineageBranch":"heisenbug"},"heisenwisp":{"id":"heisenwisp","label":"HeisenWisp","name":"HeisenWisp","family":"feral","hue":88,"hp":48,"atk":10,"def":10,"agi":18,"int":23,"ancestor":"observoid","lineageDepth":6,"depth":6,"abilityIds":["heisenwisp-pulse","heisenwisp-surge"],"inheritedAbilityIds":["observoid-surge"],"traits":["Uncertain Wisp","Erblinie ObserVoid"],"role":"uncertain-wisp","rarity":"lineage-4","description":"Ein unbeständiger Irrwisch, der zwischen mehreren Formen flackert.","children":["quantumdebug"],"unlock":{"type":"lineage","requirement":"Abstammung von ObserVoid"},"lineageBranch":"heisenbug"},"quantumdebug":{"id":"quantumdebug","label":"QuantumDebug","name":"QuantumDebug","family":"byte","hue":292,"hp":51,"atk":12,"def":12,"agi":19,"int":23,"ancestor":"heisenwisp","lineageDepth":7,"depth":7,"abilityIds":["quantumdebug-pulse","quantumdebug-surge"],"inheritedAbilityIds":["heisenwisp-surge"],"traits":["Quantum Owl","Erblinie HeisenWisp"],"role":"quantum-owl","rarity":"lineage-5","description":"Ein Quantenkundiger, der Fehlerzustände wie Sterne liest.","children":[],"unlock":{"type":"lineage","requirement":"Abstammung von HeisenWisp"},"lineageBranch":"heisenbug"},"basecase":{"id":"basecase","label":"BaseCase","name":"BaseCase","family":"spark","hue":220,"hp":54,"atk":10,"def":12,"agi":6,"int":12,"ancestor":"recursion","lineageDepth":5,"depth":5,"abilityIds":["basecase-pulse","basecase-surge"],"inheritedAbilityIds":["infinite-descent"],"traits":["Basecase Turtle","Erblinie Recursion"],"role":"basecase-turtle","rarity":"lineage-2","description":"Ein Schildkrötengeist, der jede Schleife mit dem richtigen Ende versieht.","children":["callwyrm"],"unlock":{"type":"lineage","requirement":"Abstammung von Recursion"},"lineageBranch":"recursion"},"callwyrm":{"id":"callwyrm","label":"CallWyrm","name":"CallWyrm","family":"byte","hue":260,"hp":58,"atk":13,"def":13,"agi":7,"int":16,"ancestor":"basecase","lineageDepth":6,"depth":6,"abilityIds":["callwyrm-pulse","callwyrm-surge"],"inheritedAbilityIds":["basecase-surge"],"traits":["Call Wyrm","Erblinie BaseCase"],"role":"call-wyrm","rarity":"lineage-3","description":"Ein langer Wyrm, dessen Schuppen verschachtelte Funktionsrufe tragen.","children":["recursaur"],"unlock":{"type":"lineage","requirement":"Abstammung von BaseCase"},"lineageBranch":"recursion"},"recursaur":{"id":"recursaur","label":"Recursaur","name":"Recursaur","family":"spark","hue":210,"hp":65,"atk":17,"def":16,"agi":8,"int":19,"ancestor":"callwyrm","lineageDepth":7,"depth":7,"abilityIds":["recursaur-pulse","recursaur-surge"],"inheritedAbilityIds":["callwyrm-surge"],"traits":["Recursive Saur","Erblinie CallWyrm"],"role":"recursive-saur","rarity":"lineage-4","description":"Ein Echsenkoloss, der aus jedem Angriff eine neue Runde erzeugt.","children":["infiniteancestor"],"unlock":{"type":"lineage","requirement":"Abstammung von CallWyrm"},"lineageBranch":"recursion"},"infiniteancestor":{"id":"infiniteancestor","label":"InfiniteAncestor","name":"InfiniteAncestor","family":"feral","hue":76,"hp":74,"atk":21,"def":20,"agi":8,"int":23,"ancestor":"recursaur","lineageDepth":8,"depth":8,"abilityIds":["infiniteancestor-pulse","infiniteancestor-surge"],"inheritedAbilityIds":["recursaur-surge"],"traits":["Infinite Elder","Erblinie Recursaur"],"role":"infinite-elder","rarity":"lineage-5","description":"Ein uralter Urahn, der Anfang und Ende seiner Linie zugleich kennt.","children":[],"unlock":{"type":"lineage","requirement":"Abstammung von Recursaur"},"lineageBranch":"recursion"}};
    const SPECIES_IDS = Object.keys(SPECIES);
    const ABILITIES = [{"id":"tackle","label":"Tackle","stat":"atk","power":12,"minLevel":1,"kind":"physisch","species":null},{"id":"deref","label":"Deref","stat":"atk","power":15,"minLevel":1,"kind":"physisch","species":"nullpointer"},{"id":"null-access","label":"Nullzugriff","stat":"int","power":18,"minLevel":4,"kind":"speziell","species":"nullpointer"},{"id":"recursion-dive","label":"Recursion Dive","stat":"int","power":16,"minLevel":1,"kind":"speziell","species":"stackoverflow"},{"id":"trace-back","label":"Trace Back","stat":"int","power":20,"minLevel":4,"kind":"speziell","species":"stackoverflow"},{"id":"page-fault","label":"Page Fault","stat":"atk","power":14,"minLevel":1,"kind":"physisch","species":"memoryleak"},{"id":"heap-flood","label":"Heap Flood","stat":"int","power":20,"minLevel":4,"kind":"speziell","species":"memoryleak"},{"id":"interleave","label":"Interleave","stat":"agi","power":16,"minLevel":1,"kind":"physisch","species":"racecondition"},{"id":"torn-read","label":"Torn Read","stat":"agi","power":20,"minLevel":4,"kind":"physisch","species":"racecondition"},{"id":"barrier","label":"Barriere","stat":"def","power":18,"minLevel":1,"kind":"physisch","species":"deadlock"},{"id":"starve","label":"Starve","stat":"int","power":16,"minLevel":4,"kind":"speziell","species":"deadlock"},{"id":"dangling-pointer","label":"Dangling Pointer","stat":"atk","power":17,"minLevel":1,"kind":"physisch","species":"segfault"},{"id":"core-dump","label":"Core Dump","stat":"atk","power":22,"minLevel":4,"kind":"physisch","species":"segfault"},{"id":"nudge","label":"Nudge","stat":"agi","power":14,"minLevel":1,"kind":"physisch","species":"offbyone"},{"id":"boundary-slip","label":"Boundary Slip","stat":"agi","power":18,"minLevel":4,"kind":"physisch","species":"offbyone"},{"id":"smash","label":"Smash","stat":"atk","power":18,"minLevel":1,"kind":"physisch","species":"bufferoverflow"},{"id":"stack-smash","label":"Stack Smash","stat":"atk","power":23,"minLevel":4,"kind":"physisch","species":"bufferoverflow"},{"id":"obfuscate","label":"Obfuscate","stat":"int","power":15,"minLevel":1,"kind":"speziell","species":"heisenbug"},{"id":"observation-collapse","label":"Observation Collapse","stat":"int","power":21,"minLevel":4,"kind":"speziell","species":"heisenbug"},{"id":"base-case","label":"Base Case","stat":"def","power":16,"minLevel":1,"kind":"physisch","species":"recursion"},{"id":"infinite-descent","label":"Infinite Descent","stat":"atk","power":21,"minLevel":4,"kind":"physisch","species":"recursion"},{"id":"nullprism-pulse","label":"Resonanzimpuls","stat":"agi","power":13,"minLevel":1,"kind":"physisch","species":"nullprism"},{"id":"nullprism-surge","label":"Endlosschlag","stat":"agi","power":18,"minLevel":4,"kind":"physisch","species":"nullprism"},{"id":"derefang-pulse","label":"Schattenstich","stat":"atk","power":14,"minLevel":1,"kind":"physisch","species":"derefang"},{"id":"derefang-surge","label":"Quantensturm","stat":"int","power":20,"minLevel":4,"kind":"speziell","species":"derefang"},{"id":"voidseraph-pulse","label":"Runenstoß","stat":"int","power":15,"minLevel":1,"kind":"speziell","species":"voidseraph"},{"id":"voidseraph-surge","label":"Grenzsprung","stat":"def","power":22,"minLevel":4,"kind":"physisch","species":"voidseraph"},{"id":"zerooracle-pulse","label":"Klammerwurf","stat":"atk","power":16,"minLevel":1,"kind":"physisch","species":"zerooracle"},{"id":"zerooracle-surge","label":"Ursprungsruf","stat":"atk","power":19,"minLevel":4,"kind":"physisch","species":"zerooracle"},{"id":"stackwisp-pulse","label":"Speicherzahn","stat":"agi","power":17,"minLevel":1,"kind":"physisch","species":"stackwisp"},{"id":"stackwisp-surge","label":"Endlosschlag","stat":"agi","power":22,"minLevel":4,"kind":"physisch","species":"stackwisp"},{"id":"callstacker-pulse","label":"Nullfunke","stat":"def","power":13,"minLevel":1,"kind":"physisch","species":"callstacker"},{"id":"callstacker-surge","label":"Quantensturm","stat":"int","power":21,"minLevel":4,"kind":"speziell","species":"callstacker"},{"id":"overflowarchon-pulse","label":"Resonanzimpuls","stat":"agi","power":14,"minLevel":1,"kind":"physisch","species":"overflowarchon"},{"id":"overflowarchon-surge","label":"Grenzsprung","stat":"agi","power":18,"minLevel":4,"kind":"physisch","species":"overflowarchon"},{"id":"stacktitan-pulse","label":"Kernhieb","stat":"int","power":15,"minLevel":1,"kind":"speziell","species":"stacktitan"},{"id":"stacktitan-surge","label":"Ursprungsruf","stat":"int","power":22,"minLevel":4,"kind":"speziell","species":"stacktitan"},{"id":"cachewraith-pulse","label":"Schattenstich","stat":"atk","power":16,"minLevel":1,"kind":"physisch","species":"cachewraith"},{"id":"cachewraith-surge","label":"Quantensturm","stat":"int","power":19,"minLevel":4,"kind":"speziell","species":"cachewraith"},{"id":"heapgolem-pulse","label":"Runenstoß","stat":"int","power":17,"minLevel":1,"kind":"speziell","species":"heapgolem"},{"id":"heapgolem-surge","label":"Endlosschlag","stat":"int","power":23,"minLevel":4,"kind":"speziell","species":"heapgolem"},{"id":"leakhydra-pulse","label":"Klammerwurf","stat":"atk","power":13,"minLevel":1,"kind":"physisch","species":"leakhydra"},{"id":"leakhydra-surge","label":"Ursprungsruf","stat":"atk","power":20,"minLevel":4,"kind":"physisch","species":"leakhydra"},{"id":"memoryphoenix-pulse","label":"Taktbruch","stat":"def","power":14,"minLevel":1,"kind":"physisch","species":"memoryphoenix"},{"id":"memoryphoenix-surge","label":"Ursprungsruf","stat":"def","power":23,"minLevel":4,"kind":"physisch","species":"memoryphoenix"},{"id":"threadlet-pulse","label":"Runenstoß","stat":"int","power":15,"minLevel":1,"kind":"speziell","species":"threadlet"},{"id":"threadlet-surge","label":"Grenzsprung","stat":"int","power":18,"minLevel":4,"kind":"speziell","species":"threadlet"},{"id":"raceweaver-pulse","label":"Klammerwurf","stat":"atk","power":16,"minLevel":1,"kind":"physisch","species":"raceweaver"},{"id":"raceweaver-surge","label":"Ursprungsruf","stat":"atk","power":19,"minLevel":4,"kind":"physisch","species":"raceweaver"},{"id":"temporlock-pulse","label":"Speicherzahn","stat":"agi","power":17,"minLevel":1,"kind":"physisch","species":"temporlock"},{"id":"temporlock-surge","label":"Endlosschlag","stat":"agi","power":20,"minLevel":4,"kind":"physisch","species":"temporlock"},{"id":"quantumracer-pulse","label":"Nullfunke","stat":"def","power":13,"minLevel":1,"kind":"physisch","species":"quantumracer"},{"id":"quantumracer-surge","label":"Quantensturm","stat":"int","power":21,"minLevel":4,"kind":"speziell","species":"quantumracer"},{"id":"mutexling-pulse","label":"Resonanzimpuls","stat":"agi","power":14,"minLevel":1,"kind":"physisch","species":"mutexling"},{"id":"mutexling-surge","label":"Endlosschlag","stat":"agi","power":22,"minLevel":4,"kind":"physisch","species":"mutexling"},{"id":"lockwarden-pulse","label":"Kernhieb","stat":"int","power":15,"minLevel":1,"kind":"speziell","species":"lockwarden"},{"id":"lockwarden-surge","label":"Quantensturm","stat":"int","power":23,"minLevel":4,"kind":"speziell","species":"lockwarden"},{"id":"stalemateon-pulse","label":"Schattenstich","stat":"atk","power":16,"minLevel":1,"kind":"physisch","species":"stalemateon"},{"id":"stalemateon-surge","label":"Grenzsprung","stat":"int","power":18,"minLevel":4,"kind":"speziell","species":"stalemateon"},{"id":"foreverwait-pulse","label":"Taktbruch","stat":"def","power":17,"minLevel":1,"kind":"physisch","species":"foreverwait"},{"id":"foreverwait-surge","label":"Ursprungsruf","stat":"def","power":19,"minLevel":4,"kind":"physisch","species":"foreverwait"},{"id":"faultling-pulse","label":"Runenstoß","stat":"int","power":13,"minLevel":1,"kind":"speziell","species":"faultling"},{"id":"faultling-surge","label":"Grenzsprung","stat":"def","power":20,"minLevel":4,"kind":"physisch","species":"faultling"},{"id":"coremaw-pulse","label":"Klammerwurf","stat":"atk","power":14,"minLevel":1,"kind":"physisch","species":"coremaw"},{"id":"coremaw-surge","label":"Ursprungsruf","stat":"int","power":21,"minLevel":4,"kind":"speziell","species":"coremaw"},{"id":"coredrake-pulse","label":"Speicherzahn","stat":"agi","power":15,"minLevel":1,"kind":"physisch","species":"coredrake"},{"id":"coredrake-surge","label":"Endlosschlag","stat":"agi","power":22,"minLevel":4,"kind":"physisch","species":"coredrake"},{"id":"crashcolossus-pulse","label":"Nullfunke","stat":"def","power":16,"minLevel":1,"kind":"physisch","species":"crashcolossus"},{"id":"crashcolossus-surge","label":"Quantensturm","stat":"def","power":23,"minLevel":4,"kind":"physisch","species":"crashcolossus"},{"id":"indeximp-pulse","label":"Resonanzimpuls","stat":"agi","power":17,"minLevel":1,"kind":"physisch","species":"indeximp"},{"id":"indeximp-surge","label":"Endlosschlag","stat":"int","power":18,"minLevel":4,"kind":"speziell","species":"indeximp"},{"id":"boundarybeast-pulse","label":"Kernhieb","stat":"int","power":13,"minLevel":1,"kind":"speziell","species":"boundarybeast"},{"id":"boundarybeast-surge","label":"Quantensturm","stat":"def","power":19,"minLevel":4,"kind":"physisch","species":"boundarybeast"},{"id":"indexeater-pulse","label":"Schattenstich","stat":"atk","power":14,"minLevel":1,"kind":"physisch","species":"indexeater"},{"id":"indexeater-surge","label":"Grenzsprung","stat":"atk","power":20,"minLevel":4,"kind":"physisch","species":"indexeater"},{"id":"zerowyrm-pulse","label":"Taktbruch","stat":"def","power":15,"minLevel":1,"kind":"physisch","species":"zerowyrm"},{"id":"zerowyrm-surge","label":"Ursprungsruf","stat":"int","power":21,"minLevel":4,"kind":"speziell","species":"zerowyrm"},{"id":"bufferbug-pulse","label":"Runenstoß","stat":"int","power":16,"minLevel":1,"kind":"speziell","species":"bufferbug"},{"id":"bufferbug-surge","label":"Grenzsprung","stat":"int","power":22,"minLevel":4,"kind":"speziell","species":"bufferbug"},{"id":"overflowhorn-pulse","label":"Klammerwurf","stat":"atk","power":17,"minLevel":1,"kind":"physisch","species":"overflowhorn"},{"id":"overflowhorn-surge","label":"Ursprungsruf","stat":"atk","power":23,"minLevel":4,"kind":"physisch","species":"overflowhorn"},{"id":"stackravager-pulse","label":"Speicherzahn","stat":"agi","power":13,"minLevel":1,"kind":"physisch","species":"stackravager"},{"id":"stackravager-surge","label":"Endlosschlag","stat":"int","power":18,"minLevel":4,"kind":"speziell","species":"stackravager"},{"id":"bufferbehemoth-pulse","label":"Nullfunke","stat":"def","power":14,"minLevel":1,"kind":"physisch","species":"bufferbehemoth"},{"id":"bufferbehemoth-surge","label":"Quantensturm","stat":"def","power":19,"minLevel":4,"kind":"physisch","species":"bufferbehemoth"},{"id":"phantomtrace-pulse","label":"Resonanzimpuls","stat":"agi","power":15,"minLevel":1,"kind":"physisch","species":"phantomtrace"},{"id":"phantomtrace-surge","label":"Endlosschlag","stat":"agi","power":20,"minLevel":4,"kind":"physisch","species":"phantomtrace"},{"id":"observoid-pulse","label":"Kernhieb","stat":"int","power":16,"minLevel":1,"kind":"speziell","species":"observoid"},{"id":"observoid-surge","label":"Quantensturm","stat":"int","power":21,"minLevel":4,"kind":"speziell","species":"observoid"},{"id":"heisenwisp-pulse","label":"Schattenstich","stat":"atk","power":17,"minLevel":1,"kind":"physisch","species":"heisenwisp"},{"id":"heisenwisp-surge","label":"Grenzsprung","stat":"atk","power":22,"minLevel":4,"kind":"physisch","species":"heisenwisp"},{"id":"quantumdebug-pulse","label":"Taktbruch","stat":"def","power":13,"minLevel":1,"kind":"physisch","species":"quantumdebug"},{"id":"quantumdebug-surge","label":"Ursprungsruf","stat":"def","power":23,"minLevel":4,"kind":"physisch","species":"quantumdebug"},{"id":"basecase-pulse","label":"Runenstoß","stat":"int","power":14,"minLevel":1,"kind":"speziell","species":"basecase"},{"id":"basecase-surge","label":"Grenzsprung","stat":"int","power":18,"minLevel":4,"kind":"speziell","species":"basecase"},{"id":"callwyrm-pulse","label":"Klammerwurf","stat":"atk","power":15,"minLevel":1,"kind":"physisch","species":"callwyrm"},{"id":"callwyrm-surge","label":"Ursprungsruf","stat":"atk","power":19,"minLevel":4,"kind":"physisch","species":"callwyrm"},{"id":"recursaur-pulse","label":"Speicherzahn","stat":"agi","power":16,"minLevel":1,"kind":"physisch","species":"recursaur"},{"id":"recursaur-surge","label":"Endlosschlag","stat":"agi","power":20,"minLevel":4,"kind":"physisch","species":"recursaur"},{"id":"infiniteancestor-pulse","label":"Nullfunke","stat":"def","power":17,"minLevel":1,"kind":"physisch","species":"infiniteancestor"},{"id":"infiniteancestor-surge","label":"Quantensturm","stat":"int","power":21,"minLevel":4,"kind":"speziell","species":"infiniteancestor"}];
    // <<< generated-codingmon-catalog

        const STAGES = [
      { at: 1, label: 'Basis', from: 1 },
      { at: 5, label: 'Entwickelt', from: 5 },
      { at: 10, label: 'Final', from: 10 },
    ];
    const stageIndex = (level) => {
      let index = 0;
      for (let i = 0; i < STAGES.length; i += 1) if (level >= STAGES[i].from) index = i;
      return index;
    };

    /**
     * Pixelart, 16x16, ein Zeichen je Pixel. Keine fremden Assets: die
     * Sprites sind hier als Daten authored, damit das Bundle vierteilig
     * bleibt, der Diff lesbar ist und keine Lizenzfrage entsteht.
     *
     * Die zehn Spezies teilen sich DREI Familien — die Form kommt aus der
     * Familie, die Identitaet aus Werten, Faehigkeiten und Farbton. Zehn eigene
     * Matrizen waeren 21 weitere handgezeichnete Sprites; sie werden nicht
     * erfunden, sondern benannt.
     *
     *   .  transparent        o  Outline
     *   a  hell               b  Koerper      c  Schatten
     *   w  Augenweiss         e  Pupille      y  Akzent (Blitz/Horn/Flamme)
     */
    const SPRITES = {
      spark: [
        [
          '................', '.......oo.......', '......oyyo......', '.......oo.......',
          '....ooooooo.....', '...oaaaaaaao....', '...oabbbbbao....', '...oaweeweao....',
          '...oaebbeaao....', '...oabbbbbao....', '....oabbbao.....', '....oabbbao.....',
          '.....ooboo......', '......o.o.......', '................', '................',
        ],
        [
          '................', '....o......o....', '...oyo....oyo...', '....oo....oo....',
          '...oooooooooo...', '..oaaaaaaaaaao..', '..oabbbbbbbbao..', '..oaweebbeewao..',
          '..oaebbbbbbeao..', '..oabbbbbbbbao..', '...oabbbbbbao...', '...oabbbbbbao...',
          '....oobbbboo....', '...oo..oo..oo...', '..oyy......yyo..', '................',
        ],
        [
          '......oyyo......', '.....oyxxyo.....', '....o.o..o.o....', '...ooyo..oyoo...',
          '..oooooooooooo..', '.oaaaaaaaaaaaaao', '.oabbbbbbbbbbbao', '.oaweebbbbeewao.',
          '.oaebbbbbbbbeao.', '.oabbbbbbbbbbbao', '..oabbbbbbbbao..', '..oabbbbbbbbao..',
          '...oobbbbbboo...', '..oo.oooooo.oo..', '.oyyo..oo..oyyo.', 'oyyo........oyyo',
        ],
      ],
      byte: [
        [
          '................', '................', '.....oooooo.....', '....obbbbbbo....',
          '....obbbaabo....', '....obweewbo....', '....obbeebbo....', '.....obbbbo.....',
          '.....ocbbco.....', '....oaabbaao....', '...oabbbbbbao...', '...oabbbbbbao...',
          '....oo....oo....', '...oyy....yyo...', '................', '................',
        ],
        [
          '......oooo......', '.....obbbbo.....', '.....obbbbo.....', '....obbbbbbo....',
          '....obweewebo...', '....obbeebbo....', '.....obbbbo.....', '...ooocbbcooo...',
          '..oaabbbbbbaao..', '..oabbbbbbbbao..', '..oabbbbbbbbao..', '..oabcbbbbcbao..',
          '...ooobbbbooo...', '....oo....oo....', '...oyyo..oyyo...', '................',
        ],
        [
          '...o...oo...o...', '..oyo.obbo.oyo..', '...o..obbo..o...', '..oooooooooooo..',
          '.oobbbbbbbbbboo.', '.obbbbbbbbbbbbo.', '.obwbbbbbbbbwbo.', '.obewbbbbbbwebo.',
          '.obbbbbbbbbbbbo.', '.obbbbcbbbcbbbo.', '.oabbbbbbbbbbao.', '.oabbbbbbbbbbao.',
          '..ooobbbbbbooo..', '...oo.oooo.oo...', '..oyyo....oyyo..', '.oyyo......oyyo.',
        ],
      ],
      feral: [
        [
          '................', '................', '...o........o...', '..oyo......oyo..',
          '..oo.oooooo.oo..', '...oobbbbbboo...', '...obwaaawbo....', '...obeeeeeebo...',
          '...obbbbbbbbo...', '....oobbbbboo...', '....oobbbboo....', '.....oo..oo.....',
          '....oyo..oyo....', '................', '................', '................',
        ],
        [
          '..o..........o..', '.oyo........oyo.', '.oo..oooooo..oo.', '..o.obbbbbbo.o..',
          '..oobbbbbbbboo..', '..obbbbbbbbbbo..', '..obwaabbaawbo..', '..obeebbbbeebo..',
          '..obbbbbbbbbbo..', '...obbbbbbbbo...', '...oabcbbcbao...', '....oo...oo.....',
          '...oyo...oyo....', '..oyyo...oyyo...', '................', '................',
        ],
        [
          '.o............o.', 'oyo..........oyo', 'oo...oooooo...oo', '.o.oobbbbbboo.o.', '..oobbbbbbbboo..',
          '.oobbbbbbbbbboo.', '.obbbbbbbbbbbbo.', '.obwaabbbbaawbo.', '.obeebbbbbbeebo.',
          '.obbbbbbbbbbbbo.', '.oabbbcbbbcbbao.', '.oabbbbbbbbbbao.', '..ooobbbbbbooo..',
          '...oo.oooo.oo...', '..oyyo....oyyo..', '.oyyo......oyyo.',
        ],
      ],
    };

    /** Palette je Farbton — dieselben Rollen fuer alle Sprites. */
    const paletteFor = (hue) => ({
      o: '#0B0F14',
      a: `hsl(${hue} 90% 76%)`,
      b: `hsl(${hue} 80% 58%)`,
      c: `hsl(${hue} 70% 40%)`,
      w: '#E0E7FF',
      e: '#0B0F14',
      y: `hsl(${(hue + 45) % 360} 95% 68%)`,
    });

    // Selbstpruefung der Matrizen: ein verrutschtes Zeichen wuerde sonst als
    // stiller Grafikfehler durchgehen. Meldet sich nur, wenn wirklich etwas fehlt.
    for (const [family, stages] of Object.entries(SPRITES)) {
      stages.forEach((rows, stage) => {
        const bad = rows.length !== 16 || rows.some((row) => row.length !== 16);
        if (bad) console.warn(`[shinon-codingmon] Sprite ${family}#${stage} ist nicht 16x16 (${rows.length} Zeilen)`);
      });
    }

    const spriteCache = new Map();
    /**
     * Matrix -> SVG. `shape-rendering: crispEdges` plus 1x1-Rects im 16er-
     * viewBox: die Pixel bleiben beim Skalieren scharf, es wird kein Bild
     * interpoliert. Ergebnis wird je Familie/Stufe/Groesse zwischengespeichert.
     */
    function spriteSvg(family, stage, size) {
      const key = `${family}:${stage}:${size}`;
      const cached = spriteCache.get(key);
      if (cached !== undefined) return cached;
      const rows = (SPRITES[family] ?? SPRITES.spark)[stage] ?? SPRITES.spark[0];
      const colors = paletteFor((SPECIES[speciesOfFamily(family)] ?? SPECIES[SPECIES_IDS[0]]).hue);
      let pixels = '';
      for (let y = 0; y < rows.length; y += 1) {
        const row = rows[y];
        for (let x = 0; x < row.length; x += 1) {
          const ch = row[x];
          if (ch === '.') continue;
          pixels += `<rect x="${x}" y="${y}" width="1" height="1" fill="${colors[ch] ?? colors.b}" />`;
        }
      }
      const svg = `<svg viewBox="0 0 16 16" width="${size}" height="${size}" `
        + `shape-rendering="crispEdges" class="__cm_pet" data-stage="${STAGES[stage].label}">${pixels}</svg>`;
      spriteCache.set(key, svg);
      return svg;
    }

    // >>> generated-sprites — Quelle: packages/codingmon/assets/sprites/*.grid (schreiben: `node scripts/assets/build-sprites.mjs --embed`; prueft: packages/codingmon/test/sprites.test.mjs)
    const SPRITE_GRIDS = {"bufferoverflow-back":"................................\n................................\n................................\n................................\n................................\n................................\n.............KKKKKKK............\n...........KKKPPPPPKKK..........\n..........KKPPPPPPPPPKK.........\n.........KKPPPPPPPPPPPKK........\n........KKPPPPPPPPPPPPPKK.......\n........KPPPPPPPPPPPPPPPK.......\n.......KKPPPPPPPPPPPPPPPKK......\n.......KPPPPPPPPPPPPPPPPPK......\n.......KPPPPPPPPPPPPPPPPPK......\n.......KPPPPPPPPPPPPPPPPPK......\n.......KPPPPPPPPPPPPPPPPPK......\n.......KPPPPPPPPPPPPPPPPPK......\n.......KKPPPPPPPPPPPPPPPKK......\n.......KKPPPPPPPPPPPPPPPK.......\n.......KKKPPPPPPPPPPPPPKK.......\n.......K.KKPPPPPPPPPPPKKK.......\n.......K..KKPPPPPPPPPKK.K.V.....\n.......K...KKKPPPPPKKK..KV......\n.......KPPPPPKKKKKKKPPPKK.......\n.......KPPPPPPPPPPPPPPPPK.......\n.......KPPPPPPPPPPPPPPPPK.......\n.......KKKKKKKKKKKKKKKKKK.......\n................................\n................................\n................................\n................................","bufferoverflow-front":"................................\n................................\n................................\n................................\n................................\n................................\n.............KKKKKKK............\n...........KKKVVVVVKKK..........\n..........KKVVVVVVVVVKK.........\n.........KKVVVVVVVVVVVKK........\n........KKVVVVVVVVVVVVVKK.......\n........KVVVVVVVVVVVVVVVK.......\n.......KKVVVVVVVVVVVVVVVKK......\n.......KVVVVKWKVVVKWKVVVVK......\n.......KVVVVWKWVVVWKWVVVVK......\n.......KVVVVKWKVVVKWKVVVVK......\n.......KVVVVVVVVVVVVVVVVVK......\n.......KVVVVVVVVVVVVVVVVVK......\n.....VVVVVVVVVVVVVVVVVVVKK......\n.....K.KKVVVVVVVVVVVVVVVVVV.....\n.......KKKVVVVVVVVVVVVVKK.K.....\n.......K.KKVVVVVVVVVVVKKK.......\n.......K..KKVVVVVVVVVKK.K.......\n.......K...KKKVVVVVKKK..K.......\n.......KPPPPPKKKKKKKPPPPK.......\n.......KPPPPPPPPPPPPPPPPK.......\n.......KPPPPPPPPPPPPPPPPK.......\n.......KKKKKKKKKKKKKKKKKK.......\n................................\n................................\n................................\n................................","deadlock-back":"................................\n................................\n................................\n................................\n................................\n..........V.....V....V..........\n..........K.....K....K..........\n........KKKKKKKKKKKKKKKK........\n........KPPPPPPPPPPPPPPK........\n........KPPPPPPPPPPPPPPK........\n........KPPPPPPPPPPPPPPK........\n........KPPPPPPPPPPPPPPK........\n........KPPPPPPPPPPPPPPK........\n........KPPPPPPPPPPPPPPK........\n........KPPPPPPPPPPPPPPK........\n........KKKKKKKKKKKKKKKK........\n........KKKKKKKKKKKKKKKK........\n........KKKKKKKKKKKKKKKK........\n........KKKKKKKKKKKKKKKK........\n........KPPPPPPPPPPPPPPK........\n........KPPPPPPPPPPPPPPK........\n........KPPPPPPPPPPPPPPK........\n........KPPPPPPPPPPPPPPK.V......\n........KPPPPPPPPPPPPPPKV.......\n........KPPPPPPPPPPPPPKK........\n........KPPPPPPPPPPPPPPK........\n........KKKKKKKKKKKKKKKK........\n................................\n................................\n................................\n................................\n................................","deadlock-front":"................................\n................................\n................................\n................................\n...........IIIIIIIIII...........\n...........IIIIIIIIII...........\n...........I........I...........\n........KKKKKKKKKKKKKKKK........\n........KPPPPPPPPPPPPPPK........\n........KPPPPPPPPPPPPPPK........\n........KPPPKWKPPPKWKPPK........\n........KPPPWKWPPPWKWPPK........\n........KPPPKWKPPPKWKPPK........\n........KPPPPPPPPPPPPPPK........\n........KPPPPPPPPPPPPPPK........\n........KKKKKKKKKKKKKKKK........\n........KKIIIIIIIIIIIIKK........\n........KKIIIIIIIIIIIIKK........\n........KKKKKKKKKKKKKKKK........\n........KPPPPPPPPPPPPPPK........\n........KPPPPPPPPPPPPPPK........\n........KPPPPPPPPPPPPPPK........\n........KPPPPPPPPPPPPPPK........\n........KPPPPPPPPPPPPPPK........\n........KPPPPPPPPPPPPPPK........\n........KPPPPPPPPPPPPPPK........\n........KKKKKKKKKKKKKKKK........\n................................\n................................\n................................\n................................\n................................","heisenbug-back":"................................\n................................\n................................\n................................\n................................\n................................\n...........V........V...........\n...........K........K...........\n..........K.K.K.K.K.K.K.........\n...........P.P.P.P.P.P..........\n.........KP.P.P.P.P.P.K.........\n...........P.P.P.P.P.P..........\n.........KP.P.P.P.P.P.K.........\n...........P.P.P.P.P.P..........\n.........KP.P.P.P.P.P.K.........\n...........P.P.P.P.P.P..........\n.........KP.P.P.P.P.P.K.........\n...........P.P.P.P.P.P..........\n.........KP.P.P.P.P.P.K.........\n...........P.P.P.P.P.P..........\n.........KP.P.P.P.P.P.K.V.......\n...........P.P.P.P.P.P.V........\n.........KP.P.P.P.P.PKK.........\n..........K.K.K.K.K.K.K.........\n................................\n................................\n................................\n................................\n................................\n................................\n................................\n................................","heisenbug-front":"................................\n................................\n................................\n................................\n................................\n................................\n................................\n................................\n..........K.K.K.K.K.K.K.........\n...........P.P.P.P.P.P..........\n.........KP.P.P.P.P.P.K.........\n...........P.P.P.P.P.P..........\n.........KP.P.P.P.P.P.K.........\n...........P.P.P.P.P.P..........\n.........KP.PWK.PWK.P.K.........\n...........P.KKP.KKP.P..........\n.........KP.P.P.P.P.P.K.........\n...........P.P.P.P.P.P..........\n.........KP.P.P.P.P.P.K.........\n...........P.P.P.P.P.P..........\n.........KP.P.P.P.P.P.K.........\n...........P.P.P.P.P.P..........\n.........KP.P.P.P.P.P.K.........\n..........K.K.K.K.K.K.K.........\n................................\n................................\n................................\n................................\n................................\n................................\n................................\n................................","memoryleak-back":"................................\n................................\n................................\n................................\n............V.......V...........\n............KKKKKKKKK...........\n...........KKKPPPPPKKK..........\n..........KKPPPPPPPPPKK.........\n.........KKPPPPPPPPPPPKK........\n........KKPPPPPPPPPPPPPKK.......\n........KPPPPPPPPPPPPPPPK.......\n.......KKPPPPPPPPPPPPPPPKK......\n.......KPPPPPPPPPPPPPPPPPK......\n.......KPPPPPPPPPPPPPPPPPK......\n.......KPPPPPPPPPPPPPPPPPK......\n.......KPPPPPPPPPPPPPPPPPK......\n.......KPPPPPPPPPPPPPPPPPK......\n.......KKPPPPPPPPPPPPPPPKK......\n........KPPPPPPPPPPPPPPPK.V.....\n........KKPPPPPPPPPPPPPKKV......\n.........KKPPPPPPPPPPPKKK.......\n..........KKPPPPPPPPPKK.........\n..........PKKKPPPPPKKKP.........\n..........P..KKKPKKK..P.........\n..........P.....P.....K.........\n..........K.....P...............\n................P...............\n................K...............\n................................\n................................\n................................\n................................","memoryleak-front":"................................\n................................\n................................\n................................\n................................\n.............KKKKKKK............\n...........KKKVVVVVKKK..........\n..........KKVVVVVVVVVKK.........\n.........KKVWVVVVVVVVVKK........\n........KKVWVVVVVVVVVVVKK.......\n........KVVVVVVVVVVVVVVVK.......\n.......KKVVVVVVVVVVVVVVVKK......\n.......KVVVVKWKVVVKWKVVVVK......\n.......KVVVVWKWVVVWKWVVVVK......\n.......KVVVVKWKVVVKWKVVVVK......\n.......KVVVVVVVVVVVVVVVVVK......\n.......KVVVVVVVVVVVVVVVVVK......\n.......KKVVVVVVVVVVVVVVVKK......\n........KVVVVVVVVVVVVVVVK.......\n........KKVVVVVVVVVVVVVKK.......\n.........KKVVVVVVVVVVVKK........\n..........KKVVVVVVVVVKK.........\n..........VKKKVVVVVKKKV.........\n..........V..KKKVKKK..V.........\n..........V.....V.....K.........\n..........K.....V...............\n................V...............\n................K...............\n................................\n................................\n................................\n................................","nullpointer-back":"................................\n................................\n................................\n................................\n................................\n..........V.....V.....V.........\n..........K.....K.....K.........\n...............KPK..............\n..............KPPPK.............\n.............KPPPPPK............\n............KPPPPPPPK...........\n...........KPPPPPPPPPK..........\n..........KPPPPPKPPPPPK.........\n.........KPPPPPKPKPPPPPK........\n........KPPPPPKPPPKPPPPPK.......\n.......KPPPPPKPPPPPKPPPPPK......\n......KPPPPPKPPPPPPPKPPPPPK.....\n.......KPPPPPKPPPPPKPPPPPK......\n........KPPPPPKPPPKPPPPPK.......\n.........KPPPPPKPKPPPPPK........\n..........KPPPPPKPPPPPK.........\n...........KPPPPPPPPPK..........\n............KPPPPPPPK......V....\n.............KPPPPPK......V.....\n..............KPPPK.....KK......\n...............KPK..............\n................K...............\n................................\n................................\n................................\n................................\n................................","nullpointer-front":"................................\n................................\n................................\n.............IIIIIII............\n................I...............\n...............I................\n................K...............\n...............KVK..............\n..............KVWVK.............\n.............KVVVVVK............\n............KVVVVVVVK...........\n...........KVVVVVVVVVK..........\n..........KVVVVVVVVVVVK.........\n.........KVVVVKKKKKVVVVK........\n........KVVVVKKVVVKKVVVVK.......\n.......KVVVVVKVVVVVKVVVVVK......\n......KVVVVVVKVVKVVKVVVVVVK.....\n.......KVVVVVKVVVVVKVVVVVK......\n........KVVVVKKVVVKKVVVVK.......\n.........KVVVVKKKKKVVVVK........\n..........KVVVVVVVVVVVK.........\n...........KVVVVVVVVVK..........\n............KVVVVVVVK...........\n.............KVVVVVK............\n..............KVWVK.............\n...............KVK..............\n................K...............\n................................\n................................\n................................\n................................\n................................","offbyone-back":"................................\n................................\n................................\n...............V................\n...............K................\n.............KKKKKK.............\n.............KPPPPK.............\n.............KPPPPK.............\n.............KPPPPK.............\n.............KPPPPK.............\n.............KPPPPK.............\n.............KPPPPK.............\n.............KPPPPKKKKK.........\n.............KPPPPKPPPK.........\n.............KPPPPKKKKK.........\n.............KPPPPK.............\n.............KPPPPK.............\n.............KPPPPK.............\n.............KPPPPK.............\n.............KPPPPK.............\n.............KPPPPK.............\n.............KPPPPK.............\n.............KPPPPK.V...........\n.............KPPPPKV............\n.............KPPPKK.............\n.............KPPPPK.............\n.............KKKKKK.............\n................................\n................................\n................................\n................................\n................................","offbyone-front":"................................\n................................\n................................\n................................\n................................\n.............KKKKKK.............\n.............KIIIIK.............\n.............KKKKKK.............\n.............KIIIIK.............\n.............KIKWKK.............\n.............KIWKWK.............\n.............KIKWKK.............\n.............KIIIIKKKKK.........\n.............KIIIIKWWWK.........\n.............KIIIIKKKKK.........\n.............KIIIIK.............\n.............KIIIIK.............\n.............KIIIIK.............\n.............KIIIIK.............\n.............KIIIIK.............\n.............KIIIIK.............\n.............KIIIIK.............\n.............KIIIIK.............\n.............KIIIIK.............\n.............KIIIIK.............\n.............KIIIIK.............\n.............KKKKKK.............\n................................\n................................\n................................\n................................\n................................","racecondition-back":"................................\n................................\n................................\n...........V.......V............\n...........K.......K............\n..........KP........KP..........\n..........KP........KP..........\n...........KP......KP...........\n...........KP......KP...........\n............KP....KP............\n............KP....KP............\n............KP....KP............\n.............KP..KP.............\n.............KP..KP.............\n.............KP..KP.............\n..............KPKP..............\n..............KPKP..............\n...............KP...............\n...............KP...............\n...............KP...............\n..............KPKP..............\n..............KPKP..............\n..............KPKP.......V......\n.............KP..KP.....V.......\n.............KP..KP...KK........\n............KP....KP............\n............KP....KP............\n................................\n................................\n................................\n................................\n................................","racecondition-front":"................................\n................................\n................................\n................................\n................................\n..........KI........KV..........\n..........KI........KV..........\n...........KI......KV...........\n...........KI......KV...........\n............KI....KV............\n............KI....KV............\n............KWK...KV............\n............WKW..KV.............\n............KWK..KV.............\n.............KI..KV.............\n..............KIKV..............\n..............KIKKWK............\n...............KVWKW............\n...............KVKWK............\n...............KV...............\n..............KVKI..............\n..............KVKI..............\n..............KVKI..............\n.............KV..KI.............\n.............KV..KI.............\n............KV....KI............\n............KV....KI............\n................................\n................................\n................................\n................................\n................................","recursion-back":"................................\n................................\n................................\n................................\n........V..............V........\n........K..............K........\n......KKKKKKKKKKKKKKKKKKKK......\n......K..................K......\n......K..................K......\n......K..PPPPPPPPPPPPPP..K......\n......K..P............P..K......\n......K..P............P..K......\n......K..P..PPPPPPPP..P..K......\n......K..P..PKKKKKKP..P..K......\n......K..P..PKKKKKKP..P..K......\n......K..P..PKKKKKKP..P..K......\n......K..P..PKKKKKKP..P..K......\n......K..P..PKKKKKKP..P..K......\n......K..P..PKKKKKKP..P..K......\n......K..P..PPPPPPPP..P..K......\n......K..P............P..K......\n......K..P............P..K......\n......K..PPPPPPPPPPPPPP..K.V....\n......K..................KV.....\n......K.................KK......\n......KKKKKKKKKKKKKKKKKKKK......\n................................\n................................\n................................\n................................\n................................\n................................","recursion-front":"................................\n................................\n................................\n................................\n................................\n................................\n......KKKKKKKKKKKKKKKKKKKK......\n......KW.................K......\n......K..................K......\n......K..VVVVVVVVVVVVVV..K......\n......K..VW...........V..K......\n......K..V............V..K......\n......K..V..IIIIIIII..V..K......\n......K..V..IKKKKKKI..V..K......\n......K..V..IKKKKKKI..V..K......\n......K..V..IKKKWKKI..V..K......\n......K..V..IKKWKWKI..V..K......\n......K..V..IKKKWKKI..V..K......\n......K..V..IKKKKKKI..V..K......\n......K..V..IIIIIIII..V..K......\n......K..V............V..K......\n......K..V............V..K......\n......K..VVVVVVVVVVVVVV..K......\n......K..................K......\n......K..................K......\n......KKKKKKKKKKKKKKKKKKKK......\n................................\n................................\n................................\n................................\n................................\n................................","segfault-back":"................................\n................................\n................................\n................................\n................................\n..........K...........K.........\n...........P.........P..........\n...........P.........P..........\n............P...K...P...........\n............P...P...P...........\n.............P..P..P............\n.............P.KKK.P..K.........\n..........KP.KKKKKKKPP..........\n............PKKKKKKK............\n............KKKKKKKKK...........\n.....KPPPPPPKKKKKKKKKPPPPPPK....\n............KKKKKKKKK...........\n.............KKKKKKK............\n...........PPKKKKKKKPP..........\n..........K...PKKK.P..K.........\n.............P..P..P......V.....\n.............P..P...P....V......\n............P...K...P..KK.......\n............P........P..........\n...........P.........P..........\n...........K..........K.........\n................................\n................................\n................................\n................................\n................................\n................................","segfault-front":"................................\n................................\n................................\n................................\n................................\n..........K...........K.........\n...........V.........V..........\n...........V.........V..........\n............V...K...V...........\n............V...V...V...........\n............KKKKVKKKK...........\n.............V.KKK.V..K.........\n..........KV.KKKKKKKVV..........\n............VKWKKKWK............\n............KWKWKWKWK...........\n.....KVVVVVVKKWKKKWKKVVVVVVK....\n............KKKKKKKKK...........\n.............KKKKKKK............\n...........VVKKKKKKKVV..........\n..........K...VKKK.V..K.........\n.............V..V..V............\n.............V..V...V...........\n............V...K...V...........\n............V........V..........\n...........V.........V..........\n...........K..........K.........\n................................\n................................\n................................\n................................\n................................\n................................","stackoverflow-back":"................................\n................................\n................................\n................................\n............V......V............\n............K......K............\n............KKKKKKKK............\n............KPPPPPPK............\n............KPPPPPPK............\n............KKKKKKKK............\n............KPPPPPPK............\n............KPPPPPPK............\n............KKKKKKKK............\n..........KKKKKKKKKKKK..........\n..........KPPPPPPPPPPK..........\n..........KPPPPPPPPPPK..........\n..........KPPPPPPPPPPK..........\n..........KPPPPPPPPPPK..........\n..........KPPPPPPPPPPK..........\n..........KKKKKKKKKKKK..........\n........KKKKKKKKKKKKKKKK........\n........KPPPPPPPPPPPPPPK........\n........KPPPPPPPPPPPPPPK.V......\n........KPPPPPPPPPPPPPPKV.......\n........KPPPPPPPPPPPPPKK........\n........KPPPPPPPPPPPPPPK........\n........KPPPPPPPPPPPPPPK........\n........KKKKKKKKKKKKKKKK........\n................................\n................................\n................................\n................................","stackoverflow-front":"................................\n................................\n................................\n................................\n................................\n................................\n............KKKKKKKK............\n............KPPPPPPK............\n............KKWKPKWK............\n............KWKWPWKW............\n............KKWKPKWK............\n............KPPPPPPK............\n............KKKKKKKK............\n..........KKKKKKKKKKKK..........\n..........KPPPPPPPPPPK..........\n..........KPPPPPPPPPPK..........\n..........KPPPPPPPPPPK..........\n..........KPPPPPPPPPPK..........\n..........KPPPPPPPPPPK..........\n..........KKKKKKKKKKKK..........\n........KKKKKKKKKKKKKKKK........\n........KPPPPPPPPPPPPPPK........\n........KPPPPPPPPPPPPPPK........\n........KWPPPPPPPPPPPPPK........\n........KWPPPPPPPPPPPPPK........\n........KPPPPPPPPPPPPPPK........\n........KPPPPPPPPPPPPPPK........\n........KKKKKKKKKKKKKKKK........\n................................\n................................\n................................\n................................"};
    // <<< generated-sprites
    // >>> generated-ui — Quelle: packages/codingmon/assets/ui/*.svg (schreiben: `node scripts/assets/build-sprites.mjs --embed`; prueft: packages/codingmon/test/sprites.test.mjs)
    const UI_SVG = {"ball":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"#A855F7\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"16\" cy=\"16\" r=\"13\"/><path d=\"M3.5,16h7M21.5,16h7\"/><circle cx=\"16\" cy=\"16\" r=\"4.5\"/><path d=\"M17.0,16.0L17.0,16.4L16.9,16.7L16.7,17.0L16.3,17.3L15.9,17.4L15.4,17.3L14.9,17.1L14.6,16.7L14.4,16.2L14.3,15.6L14.5,15.1L14.8,14.6L15.3,14.2L16.0,14.0L16.6,14.0L17.3,14.3L17.9,14.8L18.2,15.4L18.4,16.2L18.3,17.0L17.9,17.7L17.2,18.3L16.4,18.7L15.5,18.7L14.6,18.5L13.8,17.9L13.2,17.1L12.9,16.1L13.0,15.1L13.4,14.1\" stroke-width=\"1.2\"/></svg>\n","spiral":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"#A855F7\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M17.0,16.0L17.1,16.2L17.2,16.5L17.2,16.8L17.1,17.1L16.9,17.4L16.6,17.7L16.3,17.9L15.9,18.1L15.4,18.2L14.9,18.1L14.4,18.0L14.0,17.7L13.5,17.3L13.2,16.8L12.9,16.2L12.8,15.6L12.8,14.9L13.0,14.2L13.3,13.6L13.8,13.0L14.4,12.5L15.1,12.1L15.9,11.8L16.8,11.8L17.7,11.9L18.6,12.2L19.4,12.7L20.1,13.4L20.7,14.2L21.1,15.2L21.3,16.2L21.2,17.3L21.0,18.4L20.5,19.5L19.8,20.4L18.9,21.2L17.8,21.8L16.6,22.2L15.3,22.3L14.0,22.2L12.7,21.8L11.5,21.1L10.5,20.2L9.6,19.0L9.0,17.7L8.7,16.2L8.6,14.7L8.9,13.2L9.5,11.8L10.4,10.4L11.6,9.3L13.0,8.4L14.6,7.8L16.3,7.6L18.0,7.7L19.7,8.1L21.3,8.9L22.7,10.1L23.9,11.5L24.8,13.1L25.3,15.0L25.5,16.9L25.2,18.8L24.6,20.7L23.6,22.5L22.2,24.0L20.5,25.2L18.6,26.0L16.5,26.5L14.3,26.5L12.2,26.1L10.2,25.2L8.3,23.9L6.8,22.3L5.5,20.3L4.8,18.1L4.4,15.8L4.6,13.4L5.2,11.1L6.3,8.9\"/></svg>\n","step-bestehen":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"#A855F7\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"16\" cy=\"14\" r=\"8\"/><path d=\"M12.5,14l2.5,2.5L19.5,11\"/><path d=\"M9,22l-2,4M23,22l2,4M12,24.5l-1.5,4M20,24.5l1.5,4\"/></svg>\n","step-denken":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"#A855F7\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8,6h13a5,5 0 0 1 5,5v5a5,5 0 0 1-5,5h-8l-4,4v-4H8a5,5 0 0 1-5-5v-5a5,5 0 0 1 5-5z\"/><circle cx=\"12\" cy=\"14\" r=\"0.6\" fill=\"#A855F7\"/><circle cx=\"16\" cy=\"14\" r=\"0.6\" fill=\"#A855F7\"/><circle cx=\"20\" cy=\"14\" r=\"0.6\" fill=\"#A855F7\"/></svg>\n","step-handeln":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"#A855F7\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M17,3L8,17h6l-1,12L23,13h-6l0,-10z\"/></svg>\n","step-lernen":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"#A855F7\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M16,8c-2.5,-2 -6,-2.5 -9,-1v15c3,-1.5 6.5,-1 9,1c2.5,-2 6,-2.5 9,-1V7c-3,-1.5 -6.5,-1 -9,1z\"/><path d=\"M16,8v15\"/></svg>\n","step-pruefen":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\" fill=\"none\" stroke=\"#A855F7\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"14\" cy=\"14\" r=\"8\"/><path d=\"M20,20l6,6\"/><path d=\"M11,14l2.2,2.2L17.5,12\"/></svg>\n"};
    // <<< generated-ui
    // >>> generated-art — Quelle: packages/codingmon/assets/art/*.svg (schreiben: `node scripts/assets/build-sprites.mjs --embed`; prueft: packages/codingmon/test/sprites.test.mjs)
    const SPRITE_ART = {
      "basecase": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-basecase-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#95b5f3\"/><stop offset=\".42\" stop-color=\"#4b7de2\"/><stop offset=\"1\" stop-color=\"#142f99\"/></linearGradient><linearGradient id=\"cm-basecase-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#621dd7\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-basecase-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#57e8ff\"/><stop offset=\"1\" stop-color=\"#621dd7\"/></radialGradient><filter id=\"cm-basecase-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#57e8ff\" opacity=\".12\" filter=\"url(#cm-basecase-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M125 304 Q128 226 201 219 L310 219 Q384 230 383 304 Q365 357 255 363 Q145 359 125 304Z\" fill=\"url(#cm-basecase-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M164 253 L186 213 L231 232 L256 201 L281 232 L326 213 L348 253Z\" fill=\"url(#cm-basecase-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M142 311 Q101 296 82 332 L110 361 L154 351 M357 311 Q399 296 418 332 L390 361 L346 351\" fill=\"url(#cm-basecase-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M184 354 L170 403 L203 404 L224 360 M291 360 L310 405 L342 398 L325 351\" fill=\"url(#cm-basecase-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"195\" y=\"257\" width=\"122\" height=\"61\" rx=\"9\" fill=\"#10182d\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"#57e8ff\" stroke-width=\"6\"/><path d=\"M214 278 H288 M214 294 H268\" fill=\"none\" stroke=\"#9bff82\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"300\" cy=\"295\" r=\"5\" fill=\"#f7c47e\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"220.6\" y=\"260.2\" width=\"70.8\" height=\"46.8\" rx=\"7.2\" fill=\"#10182d\" stroke=\"#57e8ff\" stroke-width=\"4.2\"/><rect x=\"230.2\" y=\"268.6\" width=\"18.0\" height=\"13.8\" rx=\"2.4\" fill=\"#57e8ff\"/><rect x=\"263.8\" y=\"268.6\" width=\"18.0\" height=\"13.8\" rx=\"2.4\" fill=\"#ff65c9\"/><path d=\"M240.4 293.8 h52\" stroke=\"#d9faff\" stroke-width=\"3.6\" stroke-linecap=\"round\"/><circle cx=\"297.4\" cy=\"264.4\" r=\"3.0\" fill=\"#a7ff6b\"/><rect x=\"206\" y=\"257\" width=\"100\" height=\"58\" rx=\"7\" fill=\"#10182d\" stroke=\"#57e8ff\" stroke-width=\"6\"/><text x=\"256\" y=\"294\" font-family=\"monospace\" font-weight=\"800\" font-size=\"24\" text-anchor=\"middle\" fill=\"#a7ff82\">STOP</text><path d=\"M128 408 h28 M356 408 h28\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#f7c47e\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#57e8ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#f7c47e\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "boundarybeast": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-boundarybeast-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#9f95f3\"/><stop offset=\".42\" stop-color=\"#5a4be2\"/><stop offset=\"1\" stop-color=\"#331499\"/></linearGradient><linearGradient id=\"cm-boundarybeast-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#b21dd7\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-boundarybeast-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#cf79ff\"/><stop offset=\"1\" stop-color=\"#b21dd7\"/></radialGradient><filter id=\"cm-boundarybeast-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#cf79ff\" opacity=\".12\" filter=\"url(#cm-boundarybeast-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M128 309 Q119 241 188 226 L318 228 Q381 251 376 315 L347 354 L164 354Z\" fill=\"url(#cm-boundarybeast-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M160 244 L129 190 L188 216 L205 173 L236 226 M300 226 L321 173 L341 216 L386 188 L358 249\" fill=\"url(#cm-boundarybeast-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M157 321 L140 389 L175 395 L202 344 M303 344 L326 395 L359 385 L345 321\" fill=\"url(#cm-boundarybeast-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M176 270 L143 286 L174 305 M337 270 L369 286 L341 305\" fill=\"#f5f77e\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M120 226 L395 226\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M138 212 L154 239 M362 211 L347 239\" fill=\"none\" stroke=\"#ffe18b\" stroke-width=\"6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><ellipse cx=\"236.5\" cy=\"271.5\" rx=\"11.3\" ry=\"14.5\" fill=\"#f8ffff\"/><ellipse cx=\"275.5\" cy=\"271.5\" rx=\"11.3\" ry=\"14.5\" fill=\"#f8ffff\"/><ellipse cx=\"239.0\" cy=\"274\" rx=\"5.0\" ry=\"8.2\" fill=\"#11172b\"/><ellipse cx=\"278.1\" cy=\"274\" rx=\"5.0\" ry=\"8.2\" fill=\"#11172b\"/><circle cx=\"237.7\" cy=\"269.0\" r=\"2.5\" fill=\"#ffffff\"/><circle cx=\"276.8\" cy=\"269.0\" r=\"2.5\" fill=\"#ffffff\"/><path d=\"M244.0 291.6 Q256 302.4 268.0 291.6\" stroke=\"#ff65c9\" stroke-width=\"3.8\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M112 192 V247 M143 192 V247 M174 192 V247 M104 205 H181 M104 235 H181\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"6\" stroke-dasharray=\"9 7\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#f5f77e\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#cf79ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#f5f77e\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "bufferbehemoth": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-bufferbehemoth-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#c4f395\"/><stop offset=\".42\" stop-color=\"#96e24b\"/><stop offset=\"1\" stop-color=\"#459914\"/></linearGradient><linearGradient id=\"cm-bufferbehemoth-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#1dd743\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-bufferbehemoth-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#a8ff6e\"/><stop offset=\"1\" stop-color=\"#1dd743\"/></radialGradient><filter id=\"cm-bufferbehemoth-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#a8ff6e\" opacity=\".12\" filter=\"url(#cm-bufferbehemoth-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M91 319 Q91 246 163 224 L220 231 L249 214 L286 231 L348 220 Q417 250 414 321 L376 366 L137 367Z\" fill=\"url(#cm-bufferbehemoth-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M140 244 L122 180 L174 218 L206 173 L227 235 M302 237 L335 170 L360 218 L396 184 L375 258\" fill=\"url(#cm-bufferbehemoth-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"159\" y=\"258\" width=\"31\" height=\"30\" rx=\"4\" fill=\"url(#cm-bufferbehemoth-metal)\" stroke=\"#10172b\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"6\"/><path d=\"M165 271 h18\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><rect x=\"206\" y=\"253\" width=\"31\" height=\"30\" rx=\"4\" fill=\"url(#cm-bufferbehemoth-metal)\" stroke=\"#10172b\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"6\"/><path d=\"M212 266 h18\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><rect x=\"253\" y=\"257\" width=\"31\" height=\"30\" rx=\"4\" fill=\"url(#cm-bufferbehemoth-metal)\" stroke=\"#10172b\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"6\"/><path d=\"M259 270 h18\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><rect x=\"302\" y=\"253\" width=\"31\" height=\"30\" rx=\"4\" fill=\"url(#cm-bufferbehemoth-metal)\" stroke=\"#10172b\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"6\"/><path d=\"M308 266 h18\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><rect x=\"347\" y=\"263\" width=\"31\" height=\"30\" rx=\"4\" fill=\"url(#cm-bufferbehemoth-metal)\" stroke=\"#10172b\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"6\"/><path d=\"M353 276 h18\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M145 355 L126 413 L164 417 L197 364 M319 364 L344 415 L379 405 L366 351\" fill=\"url(#cm-bufferbehemoth-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"256\" cy=\"329\" r=\"35\" fill=\"#10182d\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"#a8ff6e\" stroke-width=\"7\"/><circle cx=\"256\" cy=\"329\" r=\"18\" fill=\"#b07ef7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><ellipse cx=\"235.2\" cy=\"282.3\" rx=\"12.1\" ry=\"15.4\" fill=\"#f8ffff\"/><ellipse cx=\"276.8\" cy=\"282.3\" rx=\"12.1\" ry=\"15.4\" fill=\"#f8ffff\"/><ellipse cx=\"237.9\" cy=\"285\" rx=\"5.4\" ry=\"8.7\" fill=\"#11172b\"/><ellipse cx=\"279.4\" cy=\"285\" rx=\"5.4\" ry=\"8.7\" fill=\"#11172b\"/><circle cx=\"236.6\" cy=\"279.6\" r=\"2.7\" fill=\"#ffffff\"/><circle cx=\"278.1\" cy=\"279.6\" r=\"2.7\" fill=\"#ffffff\"/><path d=\"M243.3 303.8 Q256 315.1 268.7 303.8\" stroke=\"#ff65c9\" stroke-width=\"4.0\" fill=\"none\" stroke-linecap=\"round\"/><rect x=\"174\" y=\"177\" width=\"33\" height=\"28\" rx=\"4\" fill=\"#10182d\" stroke=\"#a8ff6e\" stroke-width=\"4\"/><rect x=\"216\" y=\"177\" width=\"33\" height=\"28\" rx=\"4\" fill=\"#10182d\" stroke=\"#a8ff6e\" stroke-width=\"4\"/><rect x=\"258\" y=\"177\" width=\"33\" height=\"28\" rx=\"4\" fill=\"#10182d\" stroke=\"#a8ff6e\" stroke-width=\"4\"/><rect x=\"300\" y=\"177\" width=\"33\" height=\"28\" rx=\"4\" fill=\"#10182d\" stroke=\"#a8ff6e\" stroke-width=\"4\"/><circle cx=\"386\" cy=\"395\" r=\"7\" fill=\"#b07ef7\"/><circle cx=\"406\" cy=\"410\" r=\"4\" fill=\"#a8ff6e\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#b07ef7\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#a8ff6e\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#b07ef7\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "bufferbug": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-bufferbug-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e4f395\"/><stop offset=\".42\" stop-color=\"#c9e24b\"/><stop offset=\"1\" stop-color=\"#719914\"/></linearGradient><linearGradient id=\"cm-bufferbug-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#36d71d\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-bufferbug-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#a8ff6e\"/><stop offset=\"1\" stop-color=\"#36d71d\"/></radialGradient><filter id=\"cm-bufferbug-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#a8ff6e\" opacity=\".12\" filter=\"url(#cm-bufferbug-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M158 331 l-18 36 l20 10 l19 -35\" fill=\"url(#cm-bufferbug-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M190 357 l-18 36 l20 10 l19 -35\" fill=\"url(#cm-bufferbug-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M322 357 l-18 36 l20 10 l19 -35\" fill=\"url(#cm-bufferbug-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M354 331 l-18 36 l20 10 l19 -35\" fill=\"url(#cm-bufferbug-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M132 305 Q121 241 185 210 Q258 174 326 218 Q386 252 370 317 L329 347 L174 347Z\" fill=\"url(#cm-bufferbug-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M177 231 L214 194 L254 220 L245 297 L180 311Z\" fill=\"url(#cm-bufferbug-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M263 221 L300 194 L344 231 L329 308 L263 297Z\" fill=\"#887ef7\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M192 229 v67\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M219 229 v67\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M246 229 v67\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M273 229 v67\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M300 229 v67\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M327 229 v67\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M195 275 L161 248 L145 277 L181 302 M319 275 L352 248 L367 277 L334 302\" fill=\"url(#cm-bufferbug-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M214.7 261.8 Q263 243.9 311.3 261.8\" fill=\"none\" stroke=\"#101629\" stroke-width=\"8.3\"/><circle cx=\"239.5\" cy=\"277\" r=\"19.3\" fill=\"#101629\" stroke=\"#a8ff6e\" stroke-width=\"4.8\"/><circle cx=\"286.5\" cy=\"277\" r=\"19.3\" fill=\"#101629\" stroke=\"#ff65c9\" stroke-width=\"4.8\"/><circle cx=\"239.5\" cy=\"277\" r=\"6.9\" fill=\"#f5ffff\"/><circle cx=\"286.5\" cy=\"277\" r=\"6.9\" fill=\"#f5ffff\"/><circle cx=\"240.9\" cy=\"277.7\" r=\"3.4\" fill=\"#101629\"/><circle cx=\"287.8\" cy=\"277.7\" r=\"3.4\" fill=\"#101629\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#887ef7\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#a8ff6e\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#887ef7\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "bufferoverflow": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-bufferoverflow-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f395d4\"/><stop offset=\".42\" stop-color=\"#e24bb0\"/><stop offset=\"1\" stop-color=\"#99145b\"/></linearGradient><linearGradient id=\"cm-bufferoverflow-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#d7241d\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-bufferoverflow-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#a8ff6e\"/><stop offset=\"1\" stop-color=\"#d7241d\"/></radialGradient><filter id=\"cm-bufferoverflow-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#a8ff6e\" opacity=\".12\" filter=\"url(#cm-bufferoverflow-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M163 341 l-24 31 l18 10 l24 -28\" fill=\"url(#cm-bufferoverflow-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M204 365 l-24 31 l18 10 l24 -28\" fill=\"url(#cm-bufferoverflow-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M315 363 l-24 31 l18 10 l24 -28\" fill=\"url(#cm-bufferoverflow-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M356 340 l-24 31 l18 10 l24 -28\" fill=\"url(#cm-bufferoverflow-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M128 302 Q126 232 212 213 Q300 198 355 256 L366 323 Q315 355 249 350 Q175 358 128 302Z\" fill=\"url(#cm-bufferoverflow-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M187 241 Q205 187 264 198 L319 225 L314 292 L242 316 L185 288Z\" fill=\"url(#cm-bufferoverflow-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"212\" y=\"234\" width=\"24\" height=\"22\" rx=\"4\" fill=\"#7ef79c\" stroke=\"#10172b\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><rect x=\"250\" y=\"223\" width=\"24\" height=\"22\" rx=\"4\" fill=\"#7ef79c\" stroke=\"#10172b\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><rect x=\"287\" y=\"237\" width=\"24\" height=\"22\" rx=\"4\" fill=\"#7ef79c\" stroke=\"#10172b\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><rect x=\"225\" y=\"271\" width=\"24\" height=\"22\" rx=\"4\" fill=\"#7ef79c\" stroke=\"#10172b\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><rect x=\"267\" y=\"266\" width=\"24\" height=\"22\" rx=\"4\" fill=\"#7ef79c\" stroke=\"#10172b\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><rect x=\"302\" y=\"270\" width=\"24\" height=\"22\" rx=\"4\" fill=\"#7ef79c\" stroke=\"#10172b\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"5\"/><path d=\"M150 256 L104 224 L85 247 L128 284Z\" fill=\"url(#cm-bufferoverflow-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M349 256 L395 223 L416 250 L367 284Z\" fill=\"url(#cm-bufferoverflow-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"198\" y=\"187\" width=\"21\" height=\"12\" rx=\"3\" fill=\"#ff5c85\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"226\" y=\"187\" width=\"21\" height=\"12\" rx=\"3\" fill=\"#ff5c85\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"254\" y=\"187\" width=\"21\" height=\"12\" rx=\"3\" fill=\"#ff5c85\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"282\" y=\"187\" width=\"21\" height=\"12\" rx=\"3\" fill=\"#ff5c85\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><ellipse cx=\"238.8\" cy=\"277.5\" rx=\"13.5\" ry=\"18.0\" fill=\"#f7fcff\"/><ellipse cx=\"285.2\" cy=\"277.5\" rx=\"13.5\" ry=\"18.0\" fill=\"#f7fcff\"/><circle cx=\"241.0\" cy=\"280.5\" r=\"6.8\" fill=\"#101629\"/><circle cx=\"287.5\" cy=\"280.5\" r=\"6.8\" fill=\"#101629\"/><path d=\"M239.5 301.5 Q262 327.8 286.8 300.8 Q269.5 313.5 239.5 301.5Z\" fill=\"#15152c\" stroke=\"#ff65c9\" stroke-width=\"3.0\"/><path d=\"M247.8 303.0 l7 15 l5 -12 M271.0 305.2 l7 11 l4 -15\" fill=\"#fff5f5\" stroke=\"#f7fcff\" stroke-width=\"2\"/><rect x=\"176\" y=\"175\" width=\"27\" height=\"17\" rx=\"3\" fill=\"#ff5c85\" stroke=\"#10182d\" stroke-width=\"4\"/><rect x=\"210\" y=\"175\" width=\"27\" height=\"17\" rx=\"3\" fill=\"#ff5c85\" stroke=\"#10182d\" stroke-width=\"4\"/><rect x=\"244\" y=\"175\" width=\"27\" height=\"17\" rx=\"3\" fill=\"#ff5c85\" stroke=\"#10182d\" stroke-width=\"4\"/><rect x=\"278\" y=\"175\" width=\"27\" height=\"17\" rx=\"3\" fill=\"#ff5c85\" stroke=\"#10182d\" stroke-width=\"4\"/><path d=\"M173 163 H313\" stroke=\"#ff5c85\" stroke-width=\"5\" stroke-dasharray=\"7 6\"/><path d=\"M186 211 h18 M212 205 h18 M238 199 h18 M264 193 h18\" stroke=\"#ff5b85\" stroke-width=\"6\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#7ef79c\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#a8ff6e\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#7ef79c\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "cachewraith": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-cachewraith-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e4f395\"/><stop offset=\".42\" stop-color=\"#c9e24b\"/><stop offset=\"1\" stop-color=\"#719914\"/></linearGradient><linearGradient id=\"cm-cachewraith-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#36d71d\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-cachewraith-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#a8ff6e\"/><stop offset=\"1\" stop-color=\"#36d71d\"/></radialGradient><filter id=\"cm-cachewraith-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#a8ff6e\" opacity=\".12\" filter=\"url(#cm-cachewraith-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M134 289 Q157 238 219 253 L272 267 L312 292 L287 332 L223 349 L159 333Z\" fill=\"url(#cm-cachewraith-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M267 285 Q330 248 370 280 Q411 317 384 354 Q365 378 348 357 Q377 331 347 314 Q325 301 305 324Z\" fill=\"url(#cm-cachewraith-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M190 264 L181 226 L211 243 L231 218 L249 261\" fill=\"#887ef7\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M161 323 L153 385 L181 385 L197 337 M239 337 L244 390 L270 387 L272 329\" fill=\"url(#cm-cachewraith-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M343 300 l23 7\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M343 321 l23 7\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M343 342 l23 7\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><rect x=\"312\" y=\"227\" width=\"35\" height=\"23\" rx=\"5\" fill=\"#887ef7\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M198.9 284.3 Q214.0 269.2 227.9 284.8\" stroke=\"#f6fcff\" stroke-width=\"6.4\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M236.6 284.8 Q251.7 269.2 265.1 284.3\" stroke=\"#f6fcff\" stroke-width=\"6.4\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M219.2 303.4 Q232 311.5 244.8 303.4\" stroke=\"#ff65c9\" stroke-width=\"3.5\" fill=\"none\" stroke-linecap=\"round\"/><rect x=\"354\" y=\"288\" width=\"44\" height=\"14\" rx=\"4\" fill=\"#10182d\" stroke=\"#a8ff6e\" stroke-width=\"4\"/><rect x=\"364\" y=\"306\" width=\"44\" height=\"14\" rx=\"4\" fill=\"#10182d\" stroke=\"#a8ff6e\" stroke-width=\"4\"/><rect x=\"374\" y=\"324\" width=\"44\" height=\"14\" rx=\"4\" fill=\"#10182d\" stroke=\"#a8ff6e\" stroke-width=\"4\"/><circle cx=\"386\" cy=\"395\" r=\"7\" fill=\"#887ef7\"/><circle cx=\"406\" cy=\"410\" r=\"4\" fill=\"#a8ff6e\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#887ef7\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#a8ff6e\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#887ef7\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "callstacker": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-callstacker-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#95f3dd\"/><stop offset=\".42\" stop-color=\"#4be2bf\"/><stop offset=\"1\" stop-color=\"#14998c\"/></linearGradient><linearGradient id=\"cm-callstacker-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#1d81d7\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-callstacker-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#57e8ff\"/><stop offset=\"1\" stop-color=\"#1d81d7\"/></radialGradient><filter id=\"cm-callstacker-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#57e8ff\" opacity=\".12\" filter=\"url(#cm-callstacker-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M183 222 L205 166 L253 144 L303 169 L324 222 L300 244 L297 285 L333 324 L318 364 L281 345 L256 374 L231 345 L194 365 L179 323 L215 284 L210 242Z\" fill=\"url(#cm-callstacker-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"198\" y=\"225\" width=\"115\" height=\"65\" rx=\"10\" fill=\"url(#cm-callstacker-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M193 298 L153 323 L169 356 L222 325 M318 298 L360 319 L341 356 L292 327\" fill=\"url(#cm-callstacker-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"216\" y=\"361\" width=\"29\" height=\"54\" rx=\"5\" fill=\"url(#cm-callstacker-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"268\" y=\"361\" width=\"29\" height=\"54\" rx=\"5\" fill=\"url(#cm-callstacker-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M366 182 L408 365\" fill=\"none\" stroke=\"#f77ea4\" stroke-width=\"10\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"367\" cy=\"170\" r=\"19\" fill=\"#57e8ff\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M216 242 H294\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M216 262 H294\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M216 282 H294\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M212.0 230.5 Q256 210.0 300.0 230.5 L293.8 257.2 Q256 268.3 218.2 257.2 Z\" fill=\"#101629\" stroke=\"#57e8ff\" stroke-width=\"4.3\"/><path d=\"M229.3 243.5 l24 -6 M267.2 239.8 l24 6\" stroke=\"#ff65c9\" stroke-width=\"5.6\" stroke-linecap=\"round\"/><path d=\"M243.6 260.3 h40\" stroke=\"#f8fbff\" stroke-width=\"3.1\" stroke-linecap=\"round\"/><circle cx=\"408\" cy=\"151\" r=\"12\" fill=\"none\" stroke=\"#f77ea4\" stroke-width=\"5\"/><circle cx=\"408\" cy=\"151\" r=\"23\" fill=\"none\" stroke=\"#f77ea4\" stroke-width=\"5\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#f77ea4\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#57e8ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#f77ea4\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "callwyrm": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-callwyrm-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#b595f3\"/><stop offset=\".42\" stop-color=\"#7d4be2\"/><stop offset=\"1\" stop-color=\"#521499\"/></linearGradient><linearGradient id=\"cm-callwyrm-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#d71dd1\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-callwyrm-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#cf79ff\"/><stop offset=\"1\" stop-color=\"#d71dd1\"/></radialGradient><filter id=\"cm-callwyrm-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#cf79ff\" opacity=\".12\" filter=\"url(#cm-callwyrm-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M135 345 Q91 306 134 268 Q174 234 221 263 Q268 289 304 257 Q347 222 385 250 Q425 280 384 315 Q356 338 328 318\" fill=\"url(#cm-callwyrm-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M148 281 Q171 245 199 239 L227 205 L260 215 L270 250 L241 275\" fill=\"url(#cm-callwyrm-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M230 212 L216 173 L244 191 L267 164 L278 218\" fill=\"#d8f77e\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M326 318 C370 331 365 377 407 374 C444 372 443 344 415 341 C388 339 394 368 420 366\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"14\" stroke-linecap=\"round\"/><rect x=\"156\" y=\"322\" width=\"13\" height=\"9\" rx=\"2\" fill=\"#d8f77e\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"206\" y=\"302\" width=\"13\" height=\"9\" rx=\"2\" fill=\"#d8f77e\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"261\" y=\"300\" width=\"13\" height=\"9\" rx=\"2\" fill=\"#d8f77e\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"314\" y=\"281\" width=\"13\" height=\"9\" rx=\"2\" fill=\"#d8f77e\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><ellipse cx=\"212.9\" cy=\"251.8\" rx=\"9.9\" ry=\"12.7\" fill=\"#f8ffff\"/><ellipse cx=\"247.1\" cy=\"251.8\" rx=\"9.9\" ry=\"12.7\" fill=\"#f8ffff\"/><ellipse cx=\"215.2\" cy=\"254\" rx=\"4.4\" ry=\"7.2\" fill=\"#11172b\"/><ellipse cx=\"249.2\" cy=\"254\" rx=\"4.4\" ry=\"7.2\" fill=\"#11172b\"/><circle cx=\"214.1\" cy=\"249.6\" r=\"2.2\" fill=\"#ffffff\"/><circle cx=\"248.2\" cy=\"249.6\" r=\"2.2\" fill=\"#ffffff\"/><path d=\"M219.6 269.4 Q230 278.8 240.4 269.4\" stroke=\"#ff65c9\" stroke-width=\"3.3\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M330 310 C372 309 372 358 409 358 C445 358 445 326 416 326 C388 326 389 351 415 351\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"11\" stroke-linecap=\"round\"/><rect x=\"225\" y=\"205\" width=\"56\" height=\"22\" rx=\"11\" fill=\"#10182d\" stroke=\"#d8f77e\" stroke-width=\"5\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#d8f77e\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#cf79ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#d8f77e\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "coredrake": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-coredrake-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ddf395\"/><stop offset=\".42\" stop-color=\"#bfe24b\"/><stop offset=\"1\" stop-color=\"#699914\"/></linearGradient><linearGradient id=\"cm-coredrake-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#2ad71d\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-coredrake-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#a8ff6e\"/><stop offset=\"1\" stop-color=\"#2ad71d\"/></radialGradient><filter id=\"cm-coredrake-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#a8ff6e\" opacity=\".12\" filter=\"url(#cm-coredrake-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M119 309 Q149 270 223 284 L292 300 L351 275 L399 293 L360 322 L313 329 L278 358 L224 348 L166 360Z\" fill=\"url(#cm-coredrake-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M263 299 Q238 246 261 213 L300 191 L331 217 L309 246 L300 286\" fill=\"url(#cm-coredrake-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"299,196 290,155 317,178 344,153 338,213\" fill=\"#907ef7\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M230 302 L174 239 L198 318 M302 307 L354 240 L338 326\" fill=\"url(#cm-coredrake-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M159 346 L146 394 L173 395 L193 354 M233 350 L225 396 L252 396 L266 348\" fill=\"url(#cm-coredrake-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"199\" y=\"305\" width=\"15\" height=\"12\" rx=\"3\" fill=\"#a8ff6e\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"225\" y=\"313\" width=\"15\" height=\"12\" rx=\"3\" fill=\"#a8ff6e\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"251\" y=\"321\" width=\"15\" height=\"12\" rx=\"3\" fill=\"#a8ff6e\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"277\" y=\"324\" width=\"15\" height=\"12\" rx=\"3\" fill=\"#a8ff6e\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"306\" y=\"318\" width=\"15\" height=\"12\" rx=\"3\" fill=\"#a8ff6e\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"403\" cy=\"321\" r=\"30\" fill=\"#10182d\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"#907ef7\" stroke-width=\"7\"/><circle cx=\"403\" cy=\"321\" r=\"12\" fill=\"#a8ff6e\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><ellipse cx=\"285.1\" cy=\"232.1\" rx=\"8.6\" ry=\"11.5\" fill=\"#f7fcff\"/><ellipse cx=\"314.9\" cy=\"232.1\" rx=\"8.6\" ry=\"11.5\" fill=\"#f7fcff\"/><circle cx=\"286.6\" cy=\"234.0\" r=\"4.3\" fill=\"#101629\"/><circle cx=\"316.3\" cy=\"234.0\" r=\"4.3\" fill=\"#101629\"/><path d=\"M285.6 247.5 Q300 264.3 315.8 247.0 Q304.8 255.2 285.6 247.5Z\" fill=\"#15152c\" stroke=\"#ff65c9\" stroke-width=\"1.9\"/><path d=\"M290.9 248.4 l7 15 l5 -12 M305.8 249.9 l7 11 l4 -15\" fill=\"#fff5f5\" stroke=\"#f7fcff\" stroke-width=\"2\"/><rect x=\"166\" y=\"302.0\" width=\"22\" height=\"15\" rx=\"2\" fill=\"#10182d\" stroke=\"#a8ff6e\" stroke-width=\"4\"/><rect x=\"201\" y=\"306.20735492403946\" width=\"22\" height=\"15\" rx=\"2\" fill=\"#10182d\" stroke=\"#a8ff6e\" stroke-width=\"4\"/><rect x=\"236\" y=\"306.5464871341284\" width=\"22\" height=\"15\" rx=\"2\" fill=\"#10182d\" stroke=\"#a8ff6e\" stroke-width=\"4\"/><rect x=\"271\" y=\"302.7056000402993\" width=\"22\" height=\"15\" rx=\"2\" fill=\"#10182d\" stroke=\"#a8ff6e\" stroke-width=\"4\"/><rect x=\"306\" y=\"298.21598752346034\" width=\"22\" height=\"15\" rx=\"2\" fill=\"#10182d\" stroke=\"#a8ff6e\" stroke-width=\"4\"/><path d=\"M128 408 h28 M356 408 h28\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#907ef7\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#a8ff6e\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#907ef7\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "coremaw": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-coremaw-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#95c7f3\"/><stop offset=\".42\" stop-color=\"#4b9be2\"/><stop offset=\"1\" stop-color=\"#144999\"/></linearGradient><linearGradient id=\"cm-coremaw-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#3c1dd7\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-coremaw-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#57e8ff\"/><stop offset=\"1\" stop-color=\"#3c1dd7\"/></radialGradient><filter id=\"cm-coremaw-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#57e8ff\" opacity=\".12\" filter=\"url(#cm-coremaw-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M106 310 Q92 247 163 223 L208 217 L246 236 L296 216 Q375 219 401 279 L373 351 L316 378 L189 377 L139 351Z\" fill=\"url(#cm-coremaw-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M178 272 Q256 207 337 272 L318 331 Q256 364 194 331Z\" fill=\"#101629\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"#57e8ff\" stroke-width=\"7\"/><polygon points=\"196,273 210,304 221,273\" fill=\"#f8f5ff\" stroke=\"#10172b\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"4\"/><polygon points=\"221,273 235,304 246,273\" fill=\"#f8f5ff\" stroke=\"#10172b\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"4\"/><polygon points=\"246,273 260,304 271,273\" fill=\"#f8f5ff\" stroke=\"#10172b\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"4\"/><polygon points=\"271,273 285,304 296,273\" fill=\"#f8f5ff\" stroke=\"#10172b\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"4\"/><polygon points=\"296,273 310,304 321,273\" fill=\"#f8f5ff\" stroke=\"#10172b\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"4\"/><circle cx=\"256\" cy=\"362\" r=\"33\" fill=\"#f7ac7e\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"256\" cy=\"362\" r=\"18\" fill=\"#57e8ff\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><path d=\"M148 336 L119 393 L153 400 L181 352 M348 352 L378 400 L407 390 L372 331\" fill=\"url(#cm-coremaw-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"237.7\" cy=\"269.5\" rx=\"10.6\" ry=\"14.2\" fill=\"#f7fcff\"/><ellipse cx=\"274.3\" cy=\"269.5\" rx=\"10.6\" ry=\"14.2\" fill=\"#f7fcff\"/><circle cx=\"239.5\" cy=\"271.8\" r=\"5.3\" fill=\"#101629\"/><circle cx=\"276.1\" cy=\"271.8\" r=\"5.3\" fill=\"#101629\"/><path d=\"M238.3 288.3 Q256 309.0 275.5 287.8 Q261.9 297.8 238.3 288.3Z\" fill=\"#15152c\" stroke=\"#ff65c9\" stroke-width=\"2.4\"/><path d=\"M244.8 289.5 l7 15 l5 -12 M263.1 291.3 l7 11 l4 -15\" fill=\"#fff5f5\" stroke=\"#f7fcff\" stroke-width=\"2\"/><circle cx=\"256\" cy=\"363\" r=\"38\" fill=\"#10182d\" stroke=\"#57e8ff\" stroke-width=\"8\"/><circle cx=\"256\" cy=\"363\" r=\"19\" fill=\"#f7ac7e\"/><path d=\"M238 362 l10 -10 l9 20 l10 -20 l10 10\" fill=\"none\" stroke=\"#ffffff\" stroke-width=\"5\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#f7ac7e\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#57e8ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#f7ac7e\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "crashcolossus": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-crashcolossus-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#d195f3\"/><stop offset=\".42\" stop-color=\"#ab4be2\"/><stop offset=\"1\" stop-color=\"#7a1499\"/></linearGradient><linearGradient id=\"cm-crashcolossus-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#d71d99\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-crashcolossus-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#cf79ff\"/><stop offset=\"1\" stop-color=\"#d71d99\"/></radialGradient><filter id=\"cm-crashcolossus-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#cf79ff\" opacity=\".12\" filter=\"url(#cm-crashcolossus-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><rect x=\"186\" y=\"196\" width=\"146\" height=\"129\" rx=\"19\" fill=\"url(#cm-crashcolossus-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M206 193 L226 147 L257 175 L282 140 L313 201\" fill=\"url(#cm-crashcolossus-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M190 229 L119 216 L98 263 L163 294 M326 229 L393 208 L416 256 L346 293\" fill=\"url(#cm-crashcolossus-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M214 322 L188 404 L224 412 L250 340 M289 340 L319 405 L356 389 L323 314\" fill=\"url(#cm-crashcolossus-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M211 221 L248 246 L228 269 L263 287 L245 314\" fill=\"#b4f77e\" stroke=\"#10172b\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"8\"/><rect x=\"218\" y=\"219\" width=\"103\" height=\"52\" rx=\"6\" fill=\"#10182d\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"#cf79ff\" stroke-width=\"5\"/><path d=\"M233 233 L250 247 L238 260\" fill=\"none\" stroke=\"#ff61c8\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M225.1 231.2 Q267 211.8 308.9 231.2 L303.0 256.6 Q267 267.2 231.0 256.6 Z\" fill=\"#101629\" stroke=\"#cf79ff\" stroke-width=\"4.1\"/><path d=\"M241.6 243.6 l24 -6 M277.6 240.1 l24 6\" stroke=\"#ff65c9\" stroke-width=\"5.3\" stroke-linecap=\"round\"/><path d=\"M255.2 259.6 h40\" stroke=\"#f8fbff\" stroke-width=\"2.9\" stroke-linecap=\"round\"/><path d=\"M232 222 L256 245 L245 267 L270 283 L257 309\" fill=\"none\" stroke=\"#ff6a9d\" stroke-width=\"8\" stroke-linecap=\"round\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#b4f77e\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#cf79ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#b4f77e\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "deadlock": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-deadlock-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#bb95f3\"/><stop offset=\".42\" stop-color=\"#874be2\"/><stop offset=\"1\" stop-color=\"#5b1499\"/></linearGradient><linearGradient id=\"cm-deadlock-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#d71dc5\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-deadlock-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#cf79ff\"/><stop offset=\"1\" stop-color=\"#d71dc5\"/></radialGradient><filter id=\"cm-deadlock-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#cf79ff\" opacity=\".12\" filter=\"url(#cm-deadlock-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M151 340 l-21 34 l17 9 l22 -31\" fill=\"url(#cm-deadlock-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M188 364 l-21 34 l17 9 l22 -31\" fill=\"url(#cm-deadlock-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M326 364 l-21 34 l17 9 l22 -31\" fill=\"url(#cm-deadlock-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M361 340 l-21 34 l17 9 l22 -31\" fill=\"url(#cm-deadlock-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M147 268 Q168 208 246 221 Q337 213 365 268 L348 335 Q257 375 164 335Z\" fill=\"url(#cm-deadlock-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M151 282 L100 250 Q74 232 83 207 Q112 208 128 232 L169 254Z\" fill=\"url(#cm-deadlock-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M361 282 L412 249 Q442 232 429 205 Q400 207 386 231 L345 253Z\" fill=\"url(#cm-deadlock-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"209\" y=\"212\" width=\"94\" height=\"24\" rx=\"8\" fill=\"#d0f77e\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M176 315 L205 333 M338 315 L310 333\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M204.9 258.0 Q256 234.2 307.1 258.0 L299.9 289.0 Q256 301.9 212.1 289.0 Z\" fill=\"#101629\" stroke=\"#cf79ff\" stroke-width=\"5.0\"/><path d=\"M225.0 273.1 l24 -6 M269.0 268.8 l24 6\" stroke=\"#ff65c9\" stroke-width=\"6.5\" stroke-linecap=\"round\"/><path d=\"M241.6 292.6 h40\" stroke=\"#f8fbff\" stroke-width=\"3.6\" stroke-linecap=\"round\"/><rect x=\"222\" y=\"292\" width=\"27\" height=\"25\" rx=\"4\" fill=\"#d0f77e\"/><rect x=\"260\" y=\"292\" width=\"27\" height=\"25\" rx=\"4\" fill=\"#cf79ff\"/><path d=\"M227 291 v-9 a8 8 0 0 1 16 0 v9 M265 291 v-9 a8 8 0 0 1 16 0 v9\" fill=\"none\" stroke=\"#d0f77e\" stroke-width=\"5\"/><path d=\"M230 250 h52 M256 226 v50\" stroke=\"#ffd86b\" stroke-width=\"5\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#d0f77e\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#cf79ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#d0f77e\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "derefang": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-derefang-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e195f3\"/><stop offset=\".42\" stop-color=\"#c44be2\"/><stop offset=\"1\" stop-color=\"#911499\"/></linearGradient><linearGradient id=\"cm-derefang-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#d71d7a\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-derefang-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#cf79ff\"/><stop offset=\"1\" stop-color=\"#d71d7a\"/></radialGradient><filter id=\"cm-derefang-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#cf79ff\" opacity=\".12\" filter=\"url(#cm-derefang-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M115 300 Q164 250 236 266 L315 252 L347 271 L323 306 L274 323 L213 333 L157 356Z\" fill=\"url(#cm-derefang-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M294 263 L327 213 L354 245 L388 228 L384 274 L347 294Z\" fill=\"url(#cm-derefang-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M357 267 L435 281 L390 305 L340 294Z\" fill=\"url(#cm-derefang-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M168 330 L154 395 L180 394 L207 337 M250 331 L263 392 L290 389 L286 320 M310 301 L328 370 L354 362 L342 289\" fill=\"url(#cm-derefang-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"385,276 407,284 391,289\" fill=\"#cf79ff\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><ellipse cx=\"333.5\" cy=\"264.0\" rx=\"9.0\" ry=\"12.0\" fill=\"#f7fcff\"/><ellipse cx=\"364.5\" cy=\"264.0\" rx=\"9.0\" ry=\"12.0\" fill=\"#f7fcff\"/><circle cx=\"335.0\" cy=\"266.0\" r=\"4.5\" fill=\"#101629\"/><circle cx=\"366.0\" cy=\"266.0\" r=\"4.5\" fill=\"#101629\"/><path d=\"M334.0 280.0 Q349 297.5 365.5 279.5 Q354.0 288.0 334.0 280.0Z\" fill=\"#15152c\" stroke=\"#ff65c9\" stroke-width=\"2.0\"/><path d=\"M339.5 281.0 l7 15 l5 -12 M355.0 282.5 l7 11 l4 -15\" fill=\"#fff5f5\" stroke=\"#f7fcff\" stroke-width=\"2\"/><path d=\"M365 264 L420 280 L382 298 L391 286 L359 284Z\" fill=\"#a0f77e\" stroke=\"#10172b\" stroke-width=\"7\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#a0f77e\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#cf79ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#a0f77e\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "faultling": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-faultling-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#cef395\"/><stop offset=\".42\" stop-color=\"#a6e24b\"/><stop offset=\"1\" stop-color=\"#529914\"/></linearGradient><linearGradient id=\"cm-faultling-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#1dd730\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-faultling-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#a8ff6e\"/><stop offset=\"1\" stop-color=\"#1dd730\"/></radialGradient><filter id=\"cm-faultling-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#a8ff6e\" opacity=\".12\" filter=\"url(#cm-faultling-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M174 277 Q158 226 196 212 L220 190 L240 213 L270 201 L289 225 Q327 227 334 273 L314 333 L272 362 L218 354 L185 327Z\" fill=\"url(#cm-faultling-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"185,238 146,204 192,207\" fill=\"url(#cm-faultling-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"312,239 349,198 337,247\" fill=\"url(#cm-faultling-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M214 354 L199 396 L226 401 L244 361 M281 360 L296 400 L323 388 L311 347\" fill=\"url(#cm-faultling-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"104,250 143,181 182,250\" fill=\"#a47ef7\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M137 205 V226 M137 237 V243\" stroke=\"#10182d\" stroke-width=\"8\" stroke-linecap=\"round\"/><rect x=\"330\" y=\"286\" width=\"71\" height=\"91\" rx=\"7\" fill=\"#fff1c0\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"#10172b\" stroke-width=\"7\"/><path d=\"M345 308 h40 M345 329 h33 M345 350 h41\" fill=\"none\" stroke=\"#11172b\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><ellipse cx=\"236.8\" cy=\"265.3\" rx=\"11.2\" ry=\"14.9\" fill=\"#f7fcff\"/><ellipse cx=\"275.2\" cy=\"265.3\" rx=\"11.2\" ry=\"14.9\" fill=\"#f7fcff\"/><circle cx=\"238.6\" cy=\"267.8\" r=\"5.6\" fill=\"#101629\"/><circle cx=\"277.1\" cy=\"267.8\" r=\"5.6\" fill=\"#101629\"/><path d=\"M237.4 285.1 Q256 306.8 276.5 284.5 Q262.2 295.0 237.4 285.1Z\" fill=\"#15152c\" stroke=\"#ff65c9\" stroke-width=\"2.5\"/><path d=\"M244.2 286.4 l7 15 l5 -12 M263.4 288.2 l7 11 l4 -15\" fill=\"#fff5f5\" stroke=\"#f7fcff\" stroke-width=\"2\"/><path d=\"M360 260 h68 v96 h-68 l-11 -13 l11 -15 l-11 -15 l11 -15 l-11 -15Z\" fill=\"#fff1c0\" stroke=\"#10172b\" stroke-width=\"6\"/><path d=\"M373 282 h42 M373 300 h34 M373 318 h39\" stroke=\"#11172b\" stroke-width=\"4\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#a47ef7\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#a8ff6e\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#a47ef7\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "foreverwait": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-foreverwait-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#95f3e4\"/><stop offset=\".42\" stop-color=\"#4be2c9\"/><stop offset=\"1\" stop-color=\"#149995\"/></linearGradient><linearGradient id=\"cm-foreverwait-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#1d74d7\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-foreverwait-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#57e8ff\"/><stop offset=\"1\" stop-color=\"#1d74d7\"/></radialGradient><filter id=\"cm-foreverwait-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#57e8ff\" opacity=\".12\" filter=\"url(#cm-foreverwait-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M208 214 Q256 178 304 214 L329 288 L350 393 L302 417 L256 392 L210 417 L162 393 L183 288Z\" fill=\"url(#cm-foreverwait-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M213 213 L194 174 L226 186 L243 157 L258 191 L281 164 L292 205\" fill=\"url(#cm-foreverwait-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"256\" cy=\"226\" r=\"84\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"9\" stroke-dasharray=\"315 220\" transform=\"rotate(-70 256 226)\"/><circle cx=\"220\" cy=\"357\" r=\"7\" fill=\"#f77e9c\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"256\" cy=\"357\" r=\"7\" fill=\"#f77e9c\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"292\" cy=\"357\" r=\"7\" fill=\"#f77e9c\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><path d=\"M203 317 Q256 340 309 317\" fill=\"url(#cm-foreverwait-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M218.9 268.1 Q235.8 251.2 251.4 268.7\" stroke=\"#f6fcff\" stroke-width=\"7.2\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M261.2 268.7 Q278.1 251.2 293.1 268.1\" stroke=\"#f6fcff\" stroke-width=\"7.2\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M241.7 289.5 Q256 298.6 270.3 289.5\" stroke=\"#ff65c9\" stroke-width=\"3.9\" fill=\"none\" stroke-linecap=\"round\"/><circle cx=\"256\" cy=\"225\" r=\"87\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"9\" stroke-dasharray=\"75 16 24 17 53 21\" transform=\"rotate(-25 256 225)\"/><circle cx=\"220\" cy=\"386\" r=\"6\" fill=\"#f77e9c\"/><circle cx=\"256\" cy=\"386\" r=\"6\" fill=\"#f77e9c\"/><circle cx=\"292\" cy=\"386\" r=\"6\" fill=\"#f77e9c\"/><path d=\"M128 155 l11 0 M133 149 v12 M376 390 l11 0 M381 384 v12\" stroke=\"#f77e9c\" stroke-width=\"4\" stroke-linecap=\"round\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#f77e9c\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#57e8ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#f77e9c\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "heapgolem": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-heapgolem-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#cb95f3\"/><stop offset=\".42\" stop-color=\"#a04be2\"/><stop offset=\"1\" stop-color=\"#711499\"/></linearGradient><linearGradient id=\"cm-heapgolem-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#d71da6\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-heapgolem-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#cf79ff\"/><stop offset=\"1\" stop-color=\"#d71da6\"/></radialGradient><filter id=\"cm-heapgolem-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#cf79ff\" opacity=\".12\" filter=\"url(#cm-heapgolem-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M122 333 L113 283 L149 251 L166 213 L211 202 L237 224 L278 199 L313 224 L358 240 L378 289 L352 334 L315 349 L171 353Z\" fill=\"url(#cm-heapgolem-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"149,251 166,213 211,202 221,250 184,280\" fill=\"url(#cm-heapgolem-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"221,250 237,224 278,199 295,254 258,284\" fill=\"#bcf77e\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"295,254 313,224 358,240 378,289 330,301\" fill=\"url(#cm-heapgolem-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M157 324 L134 382 L163 394 L195 339 M315 338 L346 385 L372 368 L354 316\" fill=\"url(#cm-heapgolem-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"206\" y=\"287\" width=\"35\" height=\"32\" rx=\"4\" fill=\"#cf79ff\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"251\" y=\"292\" width=\"34\" height=\"27\" rx=\"4\" fill=\"#bcf77e\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"235.8\" cy=\"271.4\" rx=\"11.7\" ry=\"15.0\" fill=\"#f8ffff\"/><ellipse cx=\"276.1\" cy=\"271.4\" rx=\"11.7\" ry=\"15.0\" fill=\"#f8ffff\"/><ellipse cx=\"238.4\" cy=\"274\" rx=\"5.2\" ry=\"8.5\" fill=\"#11172b\"/><ellipse cx=\"278.8\" cy=\"274\" rx=\"5.2\" ry=\"8.5\" fill=\"#11172b\"/><circle cx=\"237.2\" cy=\"268.8\" r=\"2.6\" fill=\"#ffffff\"/><circle cx=\"277.4\" cy=\"268.8\" r=\"2.6\" fill=\"#ffffff\"/><path d=\"M243.7 292.2 Q256 303.2 268.4 292.2\" stroke=\"#ff65c9\" stroke-width=\"3.9\" fill=\"none\" stroke-linecap=\"round\"/><rect x=\"133\" y=\"326\" width=\"51\" height=\"40\" rx=\"5\" fill=\"#10182d\" stroke=\"#bcf77e\" stroke-width=\"6\"/><path d=\"M140 367 v11\" stroke=\"#cf79ff\" stroke-width=\"3\"/><path d=\"M149 367 v11\" stroke=\"#cf79ff\" stroke-width=\"3\"/><path d=\"M158 367 v11\" stroke=\"#cf79ff\" stroke-width=\"3\"/><path d=\"M167 367 v11\" stroke=\"#cf79ff\" stroke-width=\"3\"/><path d=\"M176 367 v11\" stroke=\"#cf79ff\" stroke-width=\"3\"/><rect x=\"325\" y=\"326\" width=\"51\" height=\"40\" rx=\"5\" fill=\"#10182d\" stroke=\"#bcf77e\" stroke-width=\"6\"/><path d=\"M332 367 v11\" stroke=\"#cf79ff\" stroke-width=\"3\"/><path d=\"M341 367 v11\" stroke=\"#cf79ff\" stroke-width=\"3\"/><path d=\"M350 367 v11\" stroke=\"#cf79ff\" stroke-width=\"3\"/><path d=\"M359 367 v11\" stroke=\"#cf79ff\" stroke-width=\"3\"/><path d=\"M368 367 v11\" stroke=\"#cf79ff\" stroke-width=\"3\"/><path d=\"M128 408 h28 M356 408 h28\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#bcf77e\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#cf79ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#bcf77e\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "heisenbug": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-heisenbug-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#dc95f3\"/><stop offset=\".42\" stop-color=\"#bc4be2\"/><stop offset=\"1\" stop-color=\"#8a1499\"/></linearGradient><linearGradient id=\"cm-heisenbug-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#d71d84\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-heisenbug-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#cf79ff\"/><stop offset=\"1\" stop-color=\"#d71d84\"/></radialGradient><filter id=\"cm-heisenbug-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#cf79ff\" opacity=\".12\" filter=\"url(#cm-heisenbug-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M232 271 Q141 165 70 211 Q82 285 185 311Z\" fill=\"url(#cm-heisenbug-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M280 271 Q373 153 441 205 Q424 285 328 313Z\" fill=\"url(#cm-heisenbug-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M225 300 Q167 340 155 394 Q221 386 244 340Z\" fill=\"#a6f77e\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M287 300 Q346 346 356 391 Q293 385 270 339Z\" fill=\"#cf79ff\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"256\" cy=\"296\" rx=\"48\" ry=\"88\" fill=\"url(#cm-heisenbug-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M241 214 L218 170 L249 194 M272 211 L301 164 L281 197\" fill=\"url(#cm-heisenbug-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M180 224 L144 192 M332 225 L368 192\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><ellipse cx=\"238.6\" cy=\"285\" rx=\"10.6\" ry=\"14.0\" fill=\"#f7fcff\"/><ellipse cx=\"274.5\" cy=\"286.7\" rx=\"11.2\" ry=\"12.9\" fill=\"#f7fcff\"/><ellipse cx=\"242.0\" cy=\"286.1\" rx=\"5.0\" ry=\"8.4\" fill=\"#101629\"/><ellipse cx=\"277.8\" cy=\"287.8\" rx=\"5.0\" ry=\"7.8\" fill=\"#101629\"/><path d=\"M223.0 307.4 l18 -8 h22 l8 8 M261.6 307.4 l15 -8 h25\" stroke=\"#ff65c9\" stroke-width=\"3.4\" stroke-linecap=\"round\" fill=\"none\"/><path d=\"M236.4 267.6 h19 M269.4 268.2 h19\" stroke=\"#cf79ff\" stroke-width=\"3.4\"/><path d=\"M100 196 L147 172 L169 207 L122 230Z M411 196 L364 172 L342 207 L389 230Z\" fill=\"#cf79ff\" opacity=\".5\"/><path d=\"M124 170 l-15 -18 M390 170 l15 -18\" stroke=\"#a6f77e\" stroke-width=\"6\"/><path d=\"M227 321 h22 M263 321 h22 M242 333 h22\" stroke=\"#f6fbff\" stroke-width=\"4\" stroke-dasharray=\"4 5\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#a6f77e\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#cf79ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#a6f77e\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "heisenwisp": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-heisenwisp-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#c7f395\"/><stop offset=\".42\" stop-color=\"#9be24b\"/><stop offset=\"1\" stop-color=\"#499914\"/></linearGradient><linearGradient id=\"cm-heisenwisp-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#1dd73c\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-heisenwisp-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#a8ff6e\"/><stop offset=\"1\" stop-color=\"#1dd73c\"/></radialGradient><filter id=\"cm-heisenwisp-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#a8ff6e\" opacity=\".12\" filter=\"url(#cm-heisenwisp-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M222 192 Q256 168 288 192 L316 286 L347 357 L304 394 L268 366 L238 397 L191 367 L207 287Z\" fill=\"url(#cm-heisenwisp-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M191 222 Q214 194 237 222 L257 293 L277 343 L242 363 L222 340 L201 359 L176 329 L187 275Z\" fill=\"url(#cm-heisenwisp-metal)\" stroke=\"#10172b\" stroke-linejoin=\"round\" stroke-linecap=\"round\" opacity=\".6\" stroke-width=\"7\"/><path d=\"M279 207 Q311 193 331 223 L342 288 L370 341 L337 366 L314 346 L292 359 L270 329 L286 277Z\" fill=\"#a8ff6e\" stroke=\"#10172b\" stroke-linejoin=\"round\" stroke-linecap=\"round\" opacity=\".35\" stroke-width=\"7\"/><rect x=\"157\" y=\"219\" width=\"16\" height=\"16\" rx=\"3\" fill=\"#ac7ef7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"368\" y=\"237\" width=\"16\" height=\"16\" rx=\"3\" fill=\"#ac7ef7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"337\" y=\"163\" width=\"16\" height=\"16\" rx=\"3\" fill=\"#ac7ef7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"190\" y=\"381\" width=\"16\" height=\"16\" rx=\"3\" fill=\"#ac7ef7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><ellipse cx=\"237.4\" cy=\"279\" rx=\"11.4\" ry=\"15.0\" fill=\"#f7fcff\"/><ellipse cx=\"275.8\" cy=\"280.8\" rx=\"12.0\" ry=\"13.8\" fill=\"#f7fcff\"/><ellipse cx=\"241.0\" cy=\"280.2\" rx=\"5.4\" ry=\"9.0\" fill=\"#101629\"/><ellipse cx=\"279.4\" cy=\"282.0\" rx=\"5.4\" ry=\"8.4\" fill=\"#101629\"/><path d=\"M220.6 303.0 l18 -8 h22 l8 8 M262.0 303.0 l15 -8 h25\" stroke=\"#ff65c9\" stroke-width=\"3.6\" stroke-linecap=\"round\" fill=\"none\"/><path d=\"M235.0 260.4 h19 M270.4 261.0 h19\" stroke=\"#a8ff6e\" stroke-width=\"3.6\"/><rect x=\"142\" y=\"225\" width=\"20\" height=\"20\" rx=\"3\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\"/><rect x=\"363\" y=\"233\" width=\"20\" height=\"20\" rx=\"3\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\"/><rect x=\"341\" y=\"353\" width=\"20\" height=\"20\" rx=\"3\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\"/><rect x=\"179\" y=\"360\" width=\"20\" height=\"20\" rx=\"3\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\"/><path d=\"M128 155 l11 0 M133 149 v12 M376 390 l11 0 M381 384 v12\" stroke=\"#ac7ef7\" stroke-width=\"4\" stroke-linecap=\"round\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#ac7ef7\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#a8ff6e\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#ac7ef7\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "indexeater": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-indexeater-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#b2f395\"/><stop offset=\".42\" stop-color=\"#78e24b\"/><stop offset=\"1\" stop-color=\"#2a9914\"/></linearGradient><linearGradient id=\"cm-indexeater-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#1dd768\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-indexeater-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#a8ff6e\"/><stop offset=\"1\" stop-color=\"#1dd768\"/></radialGradient><filter id=\"cm-indexeater-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#a8ff6e\" opacity=\".12\" filter=\"url(#cm-indexeater-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M132 332 Q105 294 141 263 Q181 227 218 261 Q253 291 286 255 Q315 221 350 241 Q396 269 373 312 Q357 342 323 329 Q295 318 275 345 Q247 375 215 351 Q188 329 167 350\" fill=\"url(#cm-indexeater-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"161\" cy=\"276\" r=\"27\" fill=\"none\" stroke=\"url(#cm-indexeater-metal)\" stroke-width=\"10\"/><circle cx=\"216\" cy=\"282\" r=\"24\" fill=\"none\" stroke=\"url(#cm-indexeater-metal)\" stroke-width=\"10\"/><circle cx=\"286\" cy=\"270\" r=\"22\" fill=\"none\" stroke=\"url(#cm-indexeater-metal)\" stroke-width=\"10\"/><circle cx=\"346\" cy=\"268\" r=\"24\" fill=\"none\" stroke=\"url(#cm-indexeater-metal)\" stroke-width=\"10\"/><circle cx=\"137\" cy=\"286\" r=\"34\" fill=\"#10182d\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"#a8ff6e\" stroke-width=\"7\"/><circle cx=\"137\" cy=\"286\" r=\"18\" fill=\"#f7fbff\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M126 277 L133 291 L141 278 L149 291\" fill=\"#11172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"187\" y=\"244\" width=\"15\" height=\"19\" rx=\"2\" fill=\"#c87ef7\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"239\" y=\"315\" width=\"15\" height=\"19\" rx=\"2\" fill=\"#c87ef7\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"318\" y=\"228\" width=\"15\" height=\"19\" rx=\"2\" fill=\"#c87ef7\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"120.0\" cy=\"282.5\" rx=\"10.4\" ry=\"13.9\" fill=\"#f7fcff\"/><ellipse cx=\"156.0\" cy=\"282.5\" rx=\"10.4\" ry=\"13.9\" fill=\"#f7fcff\"/><circle cx=\"121.8\" cy=\"284.8\" r=\"5.2\" fill=\"#101629\"/><circle cx=\"157.7\" cy=\"284.8\" r=\"5.2\" fill=\"#101629\"/><path d=\"M120.6 301.1 Q138 321.4 157.1 300.5 Q143.8 310.4 120.6 301.1Z\" fill=\"#15152c\" stroke=\"#ff65c9\" stroke-width=\"2.3\"/><path d=\"M127.0 302.2 l7 15 l5 -12 M145.0 304.0 l7 11 l4 -15\" fill=\"#fff5f5\" stroke=\"#f7fcff\" stroke-width=\"2\"/><rect x=\"345\" y=\"188\" width=\"30\" height=\"22\" rx=\"3\" fill=\"#fff1c0\" stroke=\"#10172b\" stroke-width=\"4\" transform=\"rotate(15 360 199)\"/><rect x=\"359\" y=\"208\" width=\"30\" height=\"22\" rx=\"3\" fill=\"#fff1c0\" stroke=\"#10172b\" stroke-width=\"4\" transform=\"rotate(15 374 219)\"/><rect x=\"373\" y=\"228\" width=\"30\" height=\"22\" rx=\"3\" fill=\"#fff1c0\" stroke=\"#10172b\" stroke-width=\"4\" transform=\"rotate(15 388 239)\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#c87ef7\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#a8ff6e\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#c87ef7\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "indeximp": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-indeximp-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#95cbf3\"/><stop offset=\".42\" stop-color=\"#4ba0e2\"/><stop offset=\"1\" stop-color=\"#144e99\"/></linearGradient><linearGradient id=\"cm-indeximp-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#361dd7\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-indeximp-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#57e8ff\"/><stop offset=\"1\" stop-color=\"#361dd7\"/></radialGradient><filter id=\"cm-indeximp-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#57e8ff\" opacity=\".12\" filter=\"url(#cm-indeximp-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><ellipse cx=\"254\" cy=\"294\" rx=\"64\" ry=\"72\" fill=\"url(#cm-indeximp-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M205 248 L177 191 L220 218 L237 174 L263 225\" fill=\"url(#cm-indeximp-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M299 248 L328 191 L296 218 L278 174 L261 225\" fill=\"#f7a87e\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M211 342 L196 400 L221 399 L239 350 M276 350 L294 400 L318 393 L300 339\" fill=\"url(#cm-indeximp-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M315 305 Q383 302 386 345 Q385 384 430 389 Q451 388 446 368\" fill=\"#57e8ff\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"338\" y=\"317\" width=\"20\" height=\"20\" rx=\"3\" fill=\"#f7a87e\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"361\" y=\"330\" width=\"20\" height=\"20\" rx=\"3\" fill=\"#f7a87e\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"384\" y=\"343\" width=\"20\" height=\"20\" rx=\"3\" fill=\"#f7a87e\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"407\" y=\"356\" width=\"20\" height=\"20\" rx=\"3\" fill=\"#f7a87e\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"237.4\" cy=\"280\" rx=\"11.4\" ry=\"15.0\" fill=\"#f7fcff\"/><ellipse cx=\"275.8\" cy=\"281.8\" rx=\"12.0\" ry=\"13.8\" fill=\"#f7fcff\"/><ellipse cx=\"241.0\" cy=\"281.2\" rx=\"5.4\" ry=\"9.0\" fill=\"#101629\"/><ellipse cx=\"279.4\" cy=\"283.0\" rx=\"5.4\" ry=\"8.4\" fill=\"#101629\"/><path d=\"M220.6 304.0 l18 -8 h22 l8 8 M262.0 304.0 l15 -8 h25\" stroke=\"#ff65c9\" stroke-width=\"3.6\" stroke-linecap=\"round\" fill=\"none\"/><path d=\"M235.0 261.4 h19 M270.4 262.0 h19\" stroke=\"#57e8ff\" stroke-width=\"3.6\"/><rect x=\"338\" y=\"314\" width=\"21\" height=\"21\" rx=\"4\" fill=\"#10182d\" stroke=\"#57e8ff\" stroke-width=\"3\"/><text x=\"348.5\" y=\"329\" font-family=\"monospace\" font-size=\"14\" fill=\"#f7a87e\" text-anchor=\"middle\">0</text><rect x=\"362\" y=\"329\" width=\"21\" height=\"21\" rx=\"4\" fill=\"#10182d\" stroke=\"#57e8ff\" stroke-width=\"3\"/><text x=\"372.5\" y=\"344\" font-family=\"monospace\" font-size=\"14\" fill=\"#f7a87e\" text-anchor=\"middle\">1</text><rect x=\"386\" y=\"344\" width=\"21\" height=\"21\" rx=\"4\" fill=\"#10182d\" stroke=\"#57e8ff\" stroke-width=\"3\"/><text x=\"396.5\" y=\"359\" font-family=\"monospace\" font-size=\"14\" fill=\"#f7a87e\" text-anchor=\"middle\">2</text><path d=\"M128 424 H384\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-dasharray=\"3 12\" opacity=\".75\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#f7a87e\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#57e8ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#f7a87e\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "infiniteancestor": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-infiniteancestor-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#daf395\"/><stop offset=\".42\" stop-color=\"#bae24b\"/><stop offset=\"1\" stop-color=\"#649914\"/></linearGradient><linearGradient id=\"cm-infiniteancestor-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#24d71d\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-infiniteancestor-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#a8ff6e\"/><stop offset=\"1\" stop-color=\"#24d71d\"/></radialGradient><filter id=\"cm-infiniteancestor-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#a8ff6e\" opacity=\".12\" filter=\"url(#cm-infiniteancestor-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M180 300 Q184 247 230 237 L279 237 Q324 249 328 300 L304 351 L210 353Z\" fill=\"url(#cm-infiniteancestor-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M207 245 L180 192 L198 168 L220 214 L237 171 L250 221 M305 245 L333 191 L315 168 L293 214 L277 171 L265 221\" fill=\"url(#cm-infiniteancestor-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M250 250 L222 214 L244 180 L262 205 L285 175 L305 218 L283 255\" fill=\"#947ef7\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M210 345 L190 401 L222 406 L241 356 M278 356 L300 406 L331 398 L306 345\" fill=\"url(#cm-infiniteancestor-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"256\" cy=\"249\" r=\"111\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-dasharray=\"12 10\" opacity=\".7\"/><path d=\"M172 244 l7 7 l-7 7 l-7 -7Z\" fill=\"#947ef7\" stroke=\"none\"/><path d=\"M338 244 l7 7 l-7 7 l-7 -7Z\" fill=\"#947ef7\" stroke=\"none\"/><path d=\"M198 144 l7 7 l-7 7 l-7 -7Z\" fill=\"#947ef7\" stroke=\"none\"/><path d=\"M314 144 l7 7 l-7 7 l-7 -7Z\" fill=\"#947ef7\" stroke=\"none\"/><g fill=\"#f8ffff\"><ellipse cx=\"236.5\" cy=\"268.3\" rx=\"5.5\" ry=\"7.9\"/><ellipse cx=\"256.0\" cy=\"261.6\" rx=\"5.5\" ry=\"7.9\"/><ellipse cx=\"275.5\" cy=\"268.3\" rx=\"5.5\" ry=\"7.9\"/></g><g fill=\"#12172c\"><circle cx=\"237.7\" cy=\"268.9\" r=\"3.0\"/><circle cx=\"257.2\" cy=\"262.2\" r=\"3.0\"/><circle cx=\"276.7\" cy=\"268.9\" r=\"3.0\"/></g><path d=\"M247.5 289.1 Q256 295.2 264.5 289.1\" stroke=\"#ff65c9\" stroke-width=\"3.0\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M184 165 l7 7 l-7 7 l-7 -7Z\" fill=\"#947ef7\"/><path d=\"M220 136 l7 7 l-7 7 l-7 -7Z\" fill=\"#947ef7\"/><path d=\"M256 155 l7 7 l-7 7 l-7 -7Z\" fill=\"#947ef7\"/><path d=\"M296 126 l7 7 l-7 7 l-7 -7Z\" fill=\"#947ef7\"/><path d=\"M331 165 l7 7 l-7 7 l-7 -7Z\" fill=\"#947ef7\"/><path d=\"M364 145 l7 7 l-7 7 l-7 -7Z\" fill=\"#947ef7\"/><path d=\"M184 172 L220 143 L256 162 L296 133 L331 172 L364 152\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\"/><circle cx=\"256\" cy=\"120\" r=\"5\" fill=\"#947ef7\"/><circle cx=\"128\" cy=\"300\" r=\"4\" fill=\"#a8ff6e\"/><circle cx=\"385\" cy=\"300\" r=\"4\" fill=\"#947ef7\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#947ef7\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#a8ff6e\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#947ef7\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "leakhydra": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-leakhydra-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#95f3a5\"/><stop offset=\".42\" stop-color=\"#4be264\"/><stop offset=\"1\" stop-color=\"#14993c\"/></linearGradient><linearGradient id=\"cm-leakhydra-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#1dd7bf\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-leakhydra-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#a8ff6e\"/><stop offset=\"1\" stop-color=\"#1dd7bf\"/></radialGradient><filter id=\"cm-leakhydra-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#a8ff6e\" opacity=\".12\" filter=\"url(#cm-leakhydra-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M198 350 Q174 302 190 252 L214 203 L236 255 L233 315 M255 350 Q242 280 256 209 L280 169 L302 217 L287 322 M309 350 Q319 290 341 249 L369 220 L385 256 L350 321\" fill=\"url(#cm-leakhydra-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M139 345 Q169 304 217 316 L256 336 L295 313 Q340 310 374 347 L352 392 L167 393Z\" fill=\"url(#cm-leakhydra-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M190 208 L185 165 L215 183 L231 158 L245 206Z\" fill=\"#f77eed\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M274 178 L267 128 L300 149 L316 129 L319 183Z\" fill=\"#f77eed\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M366 226 L365 184 L394 198 L412 180 L408 233Z\" fill=\"#f77eed\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"216\" cy=\"199\" rx=\"32\" ry=\"25\" fill=\"url(#cm-leakhydra-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"208\" cy=\"196\" r=\"7\" fill=\"#f5ffff\"/><circle cx=\"210\" cy=\"196\" r=\"3.5\" fill=\"#11172b\"/><ellipse cx=\"294\" cy=\"169\" rx=\"32\" ry=\"25\" fill=\"url(#cm-leakhydra-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"286\" cy=\"166\" r=\"7\" fill=\"#f5ffff\"/><circle cx=\"288\" cy=\"166\" r=\"3.5\" fill=\"#11172b\"/><ellipse cx=\"383\" cy=\"228\" rx=\"32\" ry=\"25\" fill=\"url(#cm-leakhydra-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"375\" cy=\"225\" r=\"7\" fill=\"#f5ffff\"/><circle cx=\"377\" cy=\"225\" r=\"3.5\" fill=\"#11172b\"/><path d=\"M190 366 H322\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><g fill=\"#f8ffff\"><ellipse cx=\"280.6\" cy=\"190.5\" rx=\"3.8\" ry=\"5.5\"/><ellipse cx=\"294.0\" cy=\"185.9\" rx=\"3.8\" ry=\"5.5\"/><ellipse cx=\"307.4\" cy=\"190.5\" rx=\"3.8\" ry=\"5.5\"/></g><g fill=\"#12172c\"><circle cx=\"281.4\" cy=\"190.9\" r=\"2.1\"/><circle cx=\"294.8\" cy=\"186.3\" r=\"2.1\"/><circle cx=\"308.3\" cy=\"190.9\" r=\"2.1\"/></g><path d=\"M288.1 204.8 Q294 209.0 299.9 204.8\" stroke=\"#ff65c9\" stroke-width=\"2.1\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M194 191 q18 16 0 33 q-18 17 0 30\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"7\"/><path d=\"M280 151 q18 16 0 33 q-18 17 0 30\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"7\"/><path d=\"M365 206 q18 16 0 33 q-18 17 0 30\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"7\"/><circle cx=\"386\" cy=\"395\" r=\"7\" fill=\"#f77eed\"/><circle cx=\"406\" cy=\"410\" r=\"4\" fill=\"#a8ff6e\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#f77eed\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#a8ff6e\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#f77eed\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "lockwarden": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-lockwarden-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#cbf395\"/><stop offset=\".42\" stop-color=\"#a0e24b\"/><stop offset=\"1\" stop-color=\"#4e9914\"/></linearGradient><linearGradient id=\"cm-lockwarden-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#1dd736\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-lockwarden-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#a8ff6e\"/><stop offset=\"1\" stop-color=\"#1dd736\"/></radialGradient><filter id=\"cm-lockwarden-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#a8ff6e\" opacity=\".12\" filter=\"url(#cm-lockwarden-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M222 179 L256 148 L290 179 L310 236 L295 265 L309 339 L283 361 L256 341 L229 361 L203 339 L217 265 L202 236Z\" fill=\"url(#cm-lockwarden-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M290 220 L373 195 L408 231 L397 333 L337 366 L301 320Z\" fill=\"url(#cm-lockwarden-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M322 248 L378 229 L375 309 L345 330Z\" fill=\"#a8ff6e\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"224\" y=\"221\" width=\"64\" height=\"45\" rx=\"7\" fill=\"#10182d\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"#a87ef7\" stroke-width=\"6\"/><path d=\"M228 389 L218 432 L244 432 L257 396 M271 396 L286 432 L312 432 L295 389\" fill=\"url(#cm-lockwarden-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M218.4 224.8 Q256 207.3 293.6 224.8 L288.3 247.5 Q256 257.1 223.7 247.5 Z\" fill=\"#101629\" stroke=\"#a8ff6e\" stroke-width=\"3.7\"/><path d=\"M233.2 235.9 l24 -6 M265.5 232.7 l24 6\" stroke=\"#ff65c9\" stroke-width=\"4.8\" stroke-linecap=\"round\"/><path d=\"M245.4 250.2 h40\" stroke=\"#f8fbff\" stroke-width=\"2.7\" stroke-linecap=\"round\"/><path d=\"M342 216 L393 199 L420 227 L409 309 L373 335 L347 311Z\" fill=\"#10182d\" stroke=\"#a8ff6e\" stroke-width=\"7\"/><path d=\"M368 236 L394 227 L389 296 L369 310Z\" fill=\"#a87ef7\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#a87ef7\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#a8ff6e\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#a87ef7\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "memoryleak": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-memoryleak-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#bbf395\"/><stop offset=\".42\" stop-color=\"#87e24b\"/><stop offset=\"1\" stop-color=\"#389914\"/></linearGradient><linearGradient id=\"cm-memoryleak-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#1dd755\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-memoryleak-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#a8ff6e\"/><stop offset=\"1\" stop-color=\"#1dd755\"/></radialGradient><filter id=\"cm-memoryleak-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#a8ff6e\" opacity=\".12\" filter=\"url(#cm-memoryleak-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M109 319 Q92 276 132 242 L167 223 L214 229 L242 205 L276 223 L327 217 Q374 237 390 283 L375 331 L334 347 L166 348Z\" fill=\"url(#cm-memoryleak-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M141 317 L129 389 L171 393 L194 343\" fill=\"url(#cm-memoryleak-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M294 343 L315 391 L355 385 L347 319\" fill=\"url(#cm-memoryleak-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M181 236 Q165 180 199 171 L222 207 L239 162 L258 209 L284 177 L296 224\" fill=\"url(#cm-memoryleak-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"176\" cy=\"248\" r=\"8\" fill=\"#bc7ef7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"205\" cy=\"222\" r=\"8\" fill=\"#bc7ef7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"305\" cy=\"245\" r=\"8\" fill=\"#bc7ef7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"347\" cy=\"274\" r=\"8\" fill=\"#bc7ef7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"152\" cy=\"290\" r=\"8\" fill=\"#bc7ef7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><path d=\"M112 280 Q83 255 91 225 M360 248 Q395 219 390 190\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M276.4 270.0 Q293.5 252.9 309.4 270.7\" stroke=\"#f6fcff\" stroke-width=\"7.3\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M319.3 270.7 Q336.4 252.9 351.6 270.0\" stroke=\"#f6fcff\" stroke-width=\"7.3\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M299.5 291.8 Q314 301.0 328.5 291.8\" stroke=\"#ff65c9\" stroke-width=\"4.0\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M145 174 C131 189 135 200 145 203 C156 197 157 187 145 174Z\" fill=\"#a8ff6e\" opacity=\".9\"/><path d=\"M180 148 C166 163 170 174 180 177 C191 171 192 161 180 148Z\" fill=\"#a8ff6e\" opacity=\".9\"/><path d=\"M329 163 C315 178 319 189 329 192 C340 186 341 176 329 163Z\" fill=\"#a8ff6e\" opacity=\".9\"/><path d=\"M366 199 C352 214 356 225 366 228 C377 222 378 212 366 199Z\" fill=\"#a8ff6e\" opacity=\".9\"/><path d=\"M144 223 C130 238 134 249 144 252 C155 246 156 236 144 223Z\" fill=\"#a8ff6e\" opacity=\".9\"/><circle cx=\"386\" cy=\"395\" r=\"7\" fill=\"#bc7ef7\"/><circle cx=\"406\" cy=\"410\" r=\"4\" fill=\"#a8ff6e\"/><path d=\"M184 212 q-18 -20 -6 -35 q19 16 6 35 M350 226 q-18 -21 -5 -37 q19 17 5 37\" fill=\"#a7ff82\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#bc7ef7\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#a8ff6e\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#bc7ef7\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "memoryphoenix": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-memoryphoenix-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#95edf3\"/><stop offset=\".42\" stop-color=\"#4bd8e2\"/><stop offset=\"1\" stop-color=\"#147f99\"/></linearGradient><linearGradient id=\"cm-memoryphoenix-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#1d49d7\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-memoryphoenix-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#57e8ff\"/><stop offset=\"1\" stop-color=\"#1d49d7\"/></radialGradient><filter id=\"cm-memoryphoenix-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#57e8ff\" opacity=\".12\" filter=\"url(#cm-memoryphoenix-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M223 291 Q148 267 75 193 Q79 271 158 337 L212 349Z\" fill=\"url(#cm-memoryphoenix-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M289 291 Q364 267 437 193 Q433 271 354 337 L300 349Z\" fill=\"url(#cm-memoryphoenix-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M128 246 l-20 -43 l48 37Z\" fill=\"#57e8ff\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M384 246 l20 -43 l-48 37Z\" fill=\"#57e8ff\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M148 255 l-20 -43 l48 37Z\" fill=\"#f77e80\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M364 255 l20 -43 l-48 37Z\" fill=\"#f77e80\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M168 264 l-20 -43 l48 37Z\" fill=\"#57e8ff\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M344 264 l20 -43 l-48 37Z\" fill=\"#57e8ff\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M188 273 l-20 -43 l48 37Z\" fill=\"#f77e80\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M324 273 l20 -43 l-48 37Z\" fill=\"#f77e80\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"256\" cy=\"300\" rx=\"54\" ry=\"77\" fill=\"url(#cm-memoryphoenix-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M236 227 L217 189 L250 211 L275 175 L285 227\" fill=\"#f77e80\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M216 350 L189 411 L226 389 L256 425 L282 389 L322 411 L296 350Z\" fill=\"#57e8ff\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"238.0\" cy=\"272.2\" rx=\"9.9\" ry=\"12.8\" fill=\"#f8ffff\"/><ellipse cx=\"274.0\" cy=\"272.2\" rx=\"9.9\" ry=\"12.8\" fill=\"#f8ffff\"/><circle cx=\"239.8\" cy=\"273.9\" r=\"4.6\" fill=\"#12172c\"/><circle cx=\"275.7\" cy=\"273.9\" r=\"4.6\" fill=\"#12172c\"/><path d=\"M250.2 283.8 L261.8 283.8 L256 294.8Z\" fill=\"#ff65c9\" stroke=\"#12172c\" stroke-width=\"3\"/><rect x=\"98\" y=\"231\" width=\"26\" height=\"18\" rx=\"3\" fill=\"#10182d\" stroke=\"#57e8ff\" stroke-width=\"4\" transform=\"rotate(-25 111 240)\"/><rect x=\"115\" y=\"240\" width=\"26\" height=\"18\" rx=\"3\" fill=\"#10182d\" stroke=\"#57e8ff\" stroke-width=\"4\" transform=\"rotate(-25 128 249)\"/><rect x=\"132\" y=\"249\" width=\"26\" height=\"18\" rx=\"3\" fill=\"#10182d\" stroke=\"#57e8ff\" stroke-width=\"4\" transform=\"rotate(-25 145 258)\"/><rect x=\"149\" y=\"258\" width=\"26\" height=\"18\" rx=\"3\" fill=\"#10182d\" stroke=\"#57e8ff\" stroke-width=\"4\" transform=\"rotate(-25 162 267)\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#f77e80\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#57e8ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#f77e80\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "mutexling": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-mutexling-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f395f3\"/><stop offset=\".42\" stop-color=\"#e24be2\"/><stop offset=\"1\" stop-color=\"#991488\"/></linearGradient><linearGradient id=\"cm-mutexling-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#d71d55\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-mutexling-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#cf79ff\"/><stop offset=\"1\" stop-color=\"#d71d55\"/></radialGradient><filter id=\"cm-mutexling-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#cf79ff\" opacity=\".12\" filter=\"url(#cm-mutexling-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M215 234 V207 Q215 158 258 158 Q302 158 302 207 V234\" fill=\"url(#cm-mutexling-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"163\" y=\"225\" width=\"190\" height=\"144\" rx=\"28\" fill=\"url(#cm-mutexling-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"256\" cy=\"276\" r=\"28\" fill=\"#10182d\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"#cf79ff\" stroke-width=\"7\"/><path d=\"M242 290 L237 324 L275 324 L270 290\" fill=\"#88f77e\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M164 277 L106 248 L85 278 L145 312 M348 277 L406 248 L427 278 L367 312\" fill=\"url(#cm-mutexling-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M167 359 l-14 27 h23 l8 -26\" fill=\"url(#cm-mutexling-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M201 383 l-14 27 h23 l8 -26\" fill=\"url(#cm-mutexling-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M310 383 l-14 27 h23 l8 -26\" fill=\"url(#cm-mutexling-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M344 359 l-14 27 h23 l8 -26\" fill=\"url(#cm-mutexling-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"256\" cy=\"260.6\" r=\"29.4\" fill=\"#101629\" stroke=\"#cf79ff\" stroke-width=\"5.6\"/><circle cx=\"256\" cy=\"260.6\" r=\"18.2\" fill=\"#f4fbff\"/><circle cx=\"259.5\" cy=\"260.6\" r=\"9.1\" fill=\"#ff65c9\"/><circle cx=\"259.5\" cy=\"260.6\" r=\"3.5\" fill=\"#101629\"/><circle cx=\"255.3\" cy=\"255.0\" r=\"3.5\" fill=\"#ffffff\"/><circle cx=\"256\" cy=\"292\" r=\"27\" fill=\"#10182d\" stroke=\"#88f77e\" stroke-width=\"6\"/><circle cx=\"256\" cy=\"285\" r=\"8\" fill=\"#cf79ff\"/><path d=\"M250 295 L247 314 H265 L262 295Z\" fill=\"#cf79ff\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#88f77e\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#cf79ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#88f77e\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "nullpointer": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-nullpointer-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#c195f3\"/><stop offset=\".42\" stop-color=\"#914be2\"/><stop offset=\"1\" stop-color=\"#641499\"/></linearGradient><linearGradient id=\"cm-nullpointer-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#d71db8\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-nullpointer-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#57e8ff\"/><stop offset=\"1\" stop-color=\"#d71db8\"/></radialGradient><filter id=\"cm-nullpointer-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#57e8ff\" opacity=\".12\" filter=\"url(#cm-nullpointer-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M359 300 Q423 260 448 222 Q461 282 419 318 Q395 338 368 330\" fill=\"url(#cm-nullpointer-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M150 258 Q76 218 65 267 Q70 315 152 330Z\" fill=\"url(#cm-nullpointer-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M360 258 Q428 207 444 259 Q440 310 365 330Z\" fill=\"url(#cm-nullpointer-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"158,208 125,121 205,176\" fill=\"url(#cm-nullpointer-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"331,206 379,120 300,177\" fill=\"url(#cm-nullpointer-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"194,166 184,108 230,144\" fill=\"#c8f77e\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"302,165 327,106 284,145\" fill=\"#c8f77e\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"256\" cy=\"296\" rx=\"143\" ry=\"132\" fill=\"url(#cm-nullpointer-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M186 371 Q167 395 183 422 L220 422 L229 384Z\" fill=\"url(#cm-nullpointer-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M285 384 L296 422 L338 422 Q350 395 327 371Z\" fill=\"url(#cm-nullpointer-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"230.0\" cy=\"286\" rx=\"16.0\" ry=\"21.0\" fill=\"#f7fcff\"/><ellipse cx=\"283.7\" cy=\"288.5\" rx=\"16.8\" ry=\"19.3\" fill=\"#f7fcff\"/><ellipse cx=\"235.0\" cy=\"287.7\" rx=\"7.6\" ry=\"12.6\" fill=\"#101629\"/><ellipse cx=\"288.8\" cy=\"290.2\" rx=\"7.6\" ry=\"11.8\" fill=\"#101629\"/><path d=\"M206.4 319.6 l18 -8 h22 l8 8 M264.4 319.6 l15 -8 h25\" stroke=\"#ff65c9\" stroke-width=\"5.0\" stroke-linecap=\"round\" fill=\"none\"/><path d=\"M226.6 260.0 h19 M276.2 260.8 h19\" stroke=\"#57e8ff\" stroke-width=\"5.0\"/><path d=\"M356 126 L415 188 L384 190 L399 221 L380 229 L365 198 L344 218Z\" fill=\"#c8f77e\" stroke=\"#10172b\" stroke-width=\"7\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M401 119 l15 -12 M412 138 l18 -3 M376 105 l1 -16\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><path d=\"M128 424 H384\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-dasharray=\"3 12\" opacity=\".75\"/><path d=\"M224 337 l16 12 l-16 12 M272 349 h18\" stroke=\"#f4ffff\" stroke-width=\"5\" fill=\"none\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#c8f77e\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#57e8ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#c8f77e\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "nullprism": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-nullprism-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#95f3f0\"/><stop offset=\".42\" stop-color=\"#4be2dd\"/><stop offset=\"1\" stop-color=\"#148c99\"/></linearGradient><linearGradient id=\"cm-nullprism-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#1d5bd7\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-nullprism-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#57e8ff\"/><stop offset=\"1\" stop-color=\"#1d5bd7\"/></radialGradient><filter id=\"cm-nullprism-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#57e8ff\" opacity=\".12\" filter=\"url(#cm-nullprism-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M170 288 L212 176 L273 150 L337 220 L362 302 L318 365 L190 360Z\" fill=\"url(#cm-nullprism-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"212,176 273,150 259,267\" fill=\"url(#cm-nullprism-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"273,150 337,220 259,267\" fill=\"#f77e8c\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"170,288 212,176 259,267\" fill=\"#57e8ff\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"259,267 337,220 362,302 291,342\" fill=\"url(#cm-nullprism-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M151 251 L116 222 L139 282\" fill=\"#57e8ff\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M359 247 L401 211 L385 282\" fill=\"#57e8ff\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M202 365 L185 409 L211 398\" fill=\"#57e8ff\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M311 362 L335 406 L348 386\" fill=\"#57e8ff\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"265\" cy=\"284.8\" r=\"26.0\" fill=\"#101629\" stroke=\"#57e8ff\" stroke-width=\"5.0\"/><circle cx=\"265\" cy=\"284.8\" r=\"16.1\" fill=\"#f4fbff\"/><circle cx=\"268.1\" cy=\"284.8\" r=\"8.1\" fill=\"#ff65c9\"/><circle cx=\"268.1\" cy=\"284.8\" r=\"3.1\" fill=\"#101629\"/><circle cx=\"264.4\" cy=\"279.8\" r=\"3.1\" fill=\"#ffffff\"/><polygon points=\"398,156 415,178 391,201\" fill=\"#f77e8c\" stroke=\"#10172b\" stroke-width=\"5\"/><polygon points=\"112,183 130,160 146,189\" fill=\"#57e8ff\" stroke=\"#10172b\" stroke-width=\"5\"/><polygon points=\"379,227 401,237 379,258\" fill=\"#1d5bd7\" stroke=\"#10172b\" stroke-width=\"5\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#f77e8c\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#57e8ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#f77e8c\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "observoid": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-observoid-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#95b2f3\"/><stop offset=\".42\" stop-color=\"#4b78e2\"/><stop offset=\"1\" stop-color=\"#142a99\"/></linearGradient><linearGradient id=\"cm-observoid-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#681dd7\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-observoid-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#57e8ff\"/><stop offset=\"1\" stop-color=\"#681dd7\"/></radialGradient><filter id=\"cm-observoid-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#57e8ff\" opacity=\".12\" filter=\"url(#cm-observoid-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><ellipse cx=\"256\" cy=\"282\" rx=\"125\" ry=\"103\" fill=\"url(#cm-observoid-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M256 282 Q388.0 300.0 408.0 275.0\" fill=\"none\" stroke=\"url(#cm-observoid-metal)\" stroke-width=\"12\" stroke-linecap=\"round\"/><circle cx=\"408.0\" cy=\"275.0\" r=\"13\" fill=\"#57e8ff\" stroke=\"#10172b\" stroke-width=\"6\"/><path d=\"M256 282 Q283.0 406.5 303.0 381.5\" fill=\"none\" stroke=\"url(#cm-observoid-metal)\" stroke-width=\"12\" stroke-linecap=\"round\"/><circle cx=\"303.0\" cy=\"381.5\" r=\"13\" fill=\"#57e8ff\" stroke=\"#10172b\" stroke-width=\"6\"/><path d=\"M256 282 Q113.0 365.8 133.0 340.8\" fill=\"none\" stroke=\"url(#cm-observoid-metal)\" stroke-width=\"12\" stroke-linecap=\"round\"/><circle cx=\"133.0\" cy=\"340.8\" r=\"13\" fill=\"#57e8ff\" stroke=\"#10172b\" stroke-width=\"6\"/><path d=\"M256 282 Q113.0 234.2 133.0 209.2\" fill=\"none\" stroke=\"url(#cm-observoid-metal)\" stroke-width=\"12\" stroke-linecap=\"round\"/><circle cx=\"133.0\" cy=\"209.2\" r=\"13\" fill=\"#57e8ff\" stroke=\"#10172b\" stroke-width=\"6\"/><path d=\"M256 282 Q283.0 193.5 303.0 168.5\" fill=\"none\" stroke=\"url(#cm-observoid-metal)\" stroke-width=\"12\" stroke-linecap=\"round\"/><circle cx=\"303.0\" cy=\"168.5\" r=\"13\" fill=\"#57e8ff\" stroke=\"#10172b\" stroke-width=\"6\"/><circle cx=\"256\" cy=\"282\" r=\"70\" fill=\"#10182d\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"#57e8ff\" stroke-width=\"10\"/><ellipse cx=\"256\" cy=\"282\" rx=\"53\" ry=\"37\" fill=\"#f4fbff\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"269\" cy=\"282\" r=\"23\" fill=\"url(#cm-observoid-metal)\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"277\" cy=\"275\" r=\"8\" fill=\"#ffffff\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"256\" cy=\"282\" r=\"109\" fill=\"none\" stroke=\"#f7c87e\" stroke-width=\"4\" stroke-dasharray=\"6 13\"/><circle cx=\"256\" cy=\"280.6\" r=\"29.4\" fill=\"#101629\" stroke=\"#57e8ff\" stroke-width=\"5.6\"/><circle cx=\"256\" cy=\"280.6\" r=\"18.2\" fill=\"#f4fbff\"/><circle cx=\"259.5\" cy=\"280.6\" r=\"9.1\" fill=\"#ff65c9\"/><circle cx=\"259.5\" cy=\"280.6\" r=\"3.5\" fill=\"#101629\"/><circle cx=\"255.3\" cy=\"275.0\" r=\"3.5\" fill=\"#ffffff\"/><circle cx=\"256\" cy=\"282\" r=\"95\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-dasharray=\"4 12\"/><path d=\"M161 282 H351 M256 187 V377\" stroke=\"#f7c87e\" stroke-width=\"3\" opacity=\".8\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#f7c87e\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#57e8ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#f7c87e\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "offbyone": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-offbyone-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f3d495\"/><stop offset=\".42\" stop-color=\"#e2b04b\"/><stop offset=\"1\" stop-color=\"#997f14\"/></linearGradient><linearGradient id=\"cm-offbyone-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#93d71d\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-offbyone-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#57e8ff\"/><stop offset=\"1\" stop-color=\"#93d71d\"/></radialGradient><filter id=\"cm-offbyone-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#57e8ff\" opacity=\".12\" filter=\"url(#cm-offbyone-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M148 292 Q180 252 241 263 L303 282 L337 259 L358 290 L320 312 L273 325 L212 329 L174 352Z\" fill=\"url(#cm-offbyone-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M333 275 L351 195 L382 226 L408 211 L394 280 L365 301Z\" fill=\"url(#cm-offbyone-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M171 276 L150 216 L203 249 L226 225 L226 273Z\" fill=\"#7eb0f7\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M183 323 L172 386 L200 390 L217 334 M259 325 L271 384 L300 380 L292 313\" fill=\"url(#cm-offbyone-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M304 318 Q354 342 378 378 Q407 409 435 376 Q423 352 399 363 Q386 337 353 314\" fill=\"#57e8ff\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M373 369 l0 -10\" fill=\"none\" stroke=\"#10203c\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M383 365 l0 -10\" fill=\"none\" stroke=\"#10203c\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M393 361 l0 -10\" fill=\"none\" stroke=\"#10203c\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M403 357 l0 -10\" fill=\"none\" stroke=\"#10203c\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M413 353 l0 -10\" fill=\"none\" stroke=\"#10203c\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><ellipse cx=\"343.9\" cy=\"262.9\" rx=\"9.4\" ry=\"12.0\" fill=\"#f8ffff\"/><ellipse cx=\"376.1\" cy=\"262.9\" rx=\"9.4\" ry=\"12.0\" fill=\"#f8ffff\"/><ellipse cx=\"346.0\" cy=\"265\" rx=\"4.2\" ry=\"6.8\" fill=\"#11172b\"/><ellipse cx=\"378.2\" cy=\"265\" rx=\"4.2\" ry=\"6.8\" fill=\"#11172b\"/><circle cx=\"344.9\" cy=\"260.8\" r=\"2.1\" fill=\"#ffffff\"/><circle cx=\"377.2\" cy=\"260.8\" r=\"2.1\" fill=\"#ffffff\"/><path d=\"M350.1 279.6 Q360 288.4 369.9 279.6\" stroke=\"#ff65c9\" stroke-width=\"3.1\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M357 365 l0 -9\" stroke=\"#7eb0f7\" stroke-width=\"4\"/><path d=\"M366 362 l0 -5\" stroke=\"#7eb0f7\" stroke-width=\"4\"/><path d=\"M375 359 l0 -9\" stroke=\"#7eb0f7\" stroke-width=\"4\"/><path d=\"M384 356 l0 -5\" stroke=\"#7eb0f7\" stroke-width=\"4\"/><path d=\"M393 353 l0 -9\" stroke=\"#7eb0f7\" stroke-width=\"4\"/><path d=\"M402 350 l0 -5\" stroke=\"#7eb0f7\" stroke-width=\"4\"/><path d=\"M411 347 l0 -9\" stroke=\"#7eb0f7\" stroke-width=\"4\"/><path d=\"M128 424 H384\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-dasharray=\"3 12\" opacity=\".75\"/><circle cx=\"252\" cy=\"181\" r=\"7\" fill=\"#ff65c9\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#7eb0f7\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#57e8ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#7eb0f7\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "overflowarchon": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-overflowarchon-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ce95f3\"/><stop offset=\".42\" stop-color=\"#a64be2\"/><stop offset=\"1\" stop-color=\"#761499\"/></linearGradient><linearGradient id=\"cm-overflowarchon-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#d71da0\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-overflowarchon-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#cf79ff\"/><stop offset=\"1\" stop-color=\"#d71da0\"/></radialGradient><filter id=\"cm-overflowarchon-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#cf79ff\" opacity=\".12\" filter=\"url(#cm-overflowarchon-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><polygon points=\"203,153 309,170 332,280 301,377 197,361 175,264\" fill=\"url(#cm-overflowarchon-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"209,172 291,184 307,272 282,345 212,336 195,266\" fill=\"url(#cm-overflowarchon-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"256\" cy=\"269\" rx=\"78\" ry=\"45.239999999999995\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"5\" transform=\"rotate(-25 256 269)\" opacity=\".78\"/><ellipse cx=\"256\" cy=\"269\" rx=\"103\" ry=\"59.739999999999995\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"5\" transform=\"rotate(-25 256 269)\" opacity=\".78\"/><ellipse cx=\"256\" cy=\"269\" rx=\"129\" ry=\"74.82\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"5\" transform=\"rotate(-25 256 269)\" opacity=\".78\"/><path d=\"M202 245 L146 229 L127 256 L183 275Z\" fill=\"#b8f77e\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M310 245 L365 225 L388 249 L328 275Z\" fill=\"#b8f77e\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"183\" y=\"190\" width=\"18\" height=\"18\" rx=\"3\" fill=\"#cf79ff\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"326\" y=\"338\" width=\"18\" height=\"18\" rx=\"3\" fill=\"#cf79ff\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"169\" y=\"334\" width=\"18\" height=\"18\" rx=\"3\" fill=\"#cf79ff\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"347\" y=\"197\" width=\"18\" height=\"18\" rx=\"3\" fill=\"#cf79ff\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><ellipse cx=\"238.9\" cy=\"269.8\" rx=\"9.9\" ry=\"12.7\" fill=\"#f8ffff\"/><ellipse cx=\"273.1\" cy=\"269.8\" rx=\"9.9\" ry=\"12.7\" fill=\"#f8ffff\"/><ellipse cx=\"241.2\" cy=\"272\" rx=\"4.4\" ry=\"7.2\" fill=\"#11172b\"/><ellipse cx=\"275.2\" cy=\"272\" rx=\"4.4\" ry=\"7.2\" fill=\"#11172b\"/><circle cx=\"240.1\" cy=\"267.6\" r=\"2.2\" fill=\"#ffffff\"/><circle cx=\"274.1\" cy=\"267.6\" r=\"2.2\" fill=\"#ffffff\"/><path d=\"M245.6 287.4 Q256 296.8 266.4 287.4\" stroke=\"#ff65c9\" stroke-width=\"3.3\" fill=\"none\" stroke-linecap=\"round\"/><ellipse cx=\"256\" cy=\"264\" rx=\"158\" ry=\"56\" transform=\"rotate(-25 256 264)\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"5\"/><ellipse cx=\"256\" cy=\"264\" rx=\"145\" ry=\"75\" transform=\"rotate(48 256 264)\" fill=\"none\" stroke=\"#b8f77e\" stroke-width=\"4\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#b8f77e\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#cf79ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#b8f77e\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "overflowhorn": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-overflowhorn-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#cb95f3\"/><stop offset=\".42\" stop-color=\"#a04be2\"/><stop offset=\"1\" stop-color=\"#711499\"/></linearGradient><linearGradient id=\"cm-overflowhorn-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#d71da6\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-overflowhorn-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#cf79ff\"/><stop offset=\"1\" stop-color=\"#d71da6\"/></radialGradient><filter id=\"cm-overflowhorn-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#cf79ff\" opacity=\".12\" filter=\"url(#cm-overflowhorn-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M123 292 Q137 232 211 234 L298 233 Q350 237 360 278 L339 331 L180 354 L140 332Z\" fill=\"url(#cm-overflowhorn-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M307 268 L371 248 L419 270 L384 301 L341 304Z\" fill=\"url(#cm-overflowhorn-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M335 260 L366 193 L393 251Z\" fill=\"#bcf77e\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M273 245 L285 173 L321 240Z\" fill=\"#cf79ff\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M169 330 L159 389 L189 394 L211 346 M278 344 L298 390 L327 379 L326 329\" fill=\"url(#cm-overflowhorn-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M304 192 l13 -5\" fill=\"none\" stroke=\"#ffe18b\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M318 203 l13 -5\" fill=\"none\" stroke=\"#ffe18b\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M332 214 l13 -5\" fill=\"none\" stroke=\"#ffe18b\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><ellipse cx=\"308.9\" cy=\"274.9\" rx=\"9.4\" ry=\"12.5\" fill=\"#f7fcff\"/><ellipse cx=\"341.1\" cy=\"274.9\" rx=\"9.4\" ry=\"12.5\" fill=\"#f7fcff\"/><circle cx=\"310.4\" cy=\"277.0\" r=\"4.7\" fill=\"#101629\"/><circle cx=\"342.7\" cy=\"277.0\" r=\"4.7\" fill=\"#101629\"/><path d=\"M309.4 291.5 Q325 309.7 342.2 291.0 Q330.2 299.8 309.4 291.5Z\" fill=\"#15152c\" stroke=\"#ff65c9\" stroke-width=\"2.1\"/><path d=\"M315.1 292.6 l7 15 l5 -12 M331.2 294.1 l7 11 l4 -15\" fill=\"#fff5f5\" stroke=\"#f7fcff\" stroke-width=\"2\"/><rect x=\"290\" y=\"188\" width=\"25\" height=\"45\" rx=\"5\" fill=\"#10182d\" stroke=\"#bcf77e\" stroke-width=\"6\"/><path d=\"M297 200 h11 M297 212 h11\" stroke=\"#cf79ff\" stroke-width=\"4\"/><rect x=\"346\" y=\"188\" width=\"25\" height=\"45\" rx=\"5\" fill=\"#10182d\" stroke=\"#bcf77e\" stroke-width=\"6\"/><path d=\"M353 200 h11 M353 212 h11\" stroke=\"#cf79ff\" stroke-width=\"4\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#bcf77e\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#cf79ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#bcf77e\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "phantomtrace": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-phantomtrace-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#c795f3\"/><stop offset=\".42\" stop-color=\"#9b4be2\"/><stop offset=\"1\" stop-color=\"#6d1499\"/></linearGradient><linearGradient id=\"cm-phantomtrace-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#d71dac\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-phantomtrace-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#cf79ff\"/><stop offset=\"1\" stop-color=\"#d71dac\"/></radialGradient><filter id=\"cm-phantomtrace-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#cf79ff\" opacity=\".12\" filter=\"url(#cm-phantomtrace-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M221 202 Q256 171 291 202 L307 259 L343 397 L286 416 L256 388 L226 416 L169 397 L205 259Z\" fill=\"url(#cm-phantomtrace-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M211 201 L199 168 L221 178 L240 147 L256 179 L282 153 L294 197\" fill=\"url(#cm-phantomtrace-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M207 241 L148 276 L168 290 L226 266 M305 241 L363 270 L347 291 L288 267\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"10\" stroke-linecap=\"round\"/><circle cx=\"293\" cy=\"228\" r=\"22\" fill=\"#10182d\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"#c0f77e\" stroke-width=\"6\"/><circle cx=\"293\" cy=\"228\" r=\"8\" fill=\"#cf79ff\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"184\" y=\"322\" width=\"55\" height=\"7\" rx=\"2\" fill=\"#c0f77e\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"198\" y=\"327\" width=\"55\" height=\"7\" rx=\"2\" fill=\"#c0f77e\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"212\" y=\"332\" width=\"55\" height=\"7\" rx=\"2\" fill=\"#c0f77e\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"226\" y=\"337\" width=\"55\" height=\"7\" rx=\"2\" fill=\"#c0f77e\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><path d=\"M214.0 240.8 Q256 225.2 298.0 240.8\" fill=\"none\" stroke=\"#101629\" stroke-width=\"7.2\"/><circle cx=\"235.6\" cy=\"254\" r=\"16.8\" fill=\"#101629\" stroke=\"#cf79ff\" stroke-width=\"4.2\"/><circle cx=\"276.4\" cy=\"254\" r=\"16.8\" fill=\"#101629\" stroke=\"#ff65c9\" stroke-width=\"4.2\"/><circle cx=\"235.6\" cy=\"254\" r=\"6.0\" fill=\"#f5ffff\"/><circle cx=\"276.4\" cy=\"254\" r=\"6.0\" fill=\"#f5ffff\"/><circle cx=\"236.8\" cy=\"254.6\" r=\"3.0\" fill=\"#101629\"/><circle cx=\"277.6\" cy=\"254.6\" r=\"3.0\" fill=\"#101629\"/><path d=\"M180 301 h68\" stroke=\"#cf79ff\" stroke-width=\"4\"/><path d=\"M198 317 h68\" stroke=\"#c0f77e\" stroke-width=\"4\"/><path d=\"M216 333 h68\" stroke=\"#cf79ff\" stroke-width=\"4\"/><path d=\"M234 349 h68\" stroke=\"#c0f77e\" stroke-width=\"4\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#c0f77e\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#cf79ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#c0f77e\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "quantumdebug": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-quantumdebug-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e795f3\"/><stop offset=\".42\" stop-color=\"#ce4be2\"/><stop offset=\"1\" stop-color=\"#991499\"/></linearGradient><linearGradient id=\"cm-quantumdebug-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#d71d6e\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-quantumdebug-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#cf79ff\"/><stop offset=\"1\" stop-color=\"#d71d6e\"/></radialGradient><filter id=\"cm-quantumdebug-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#cf79ff\" opacity=\".12\" filter=\"url(#cm-quantumdebug-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M167 332 Q129 275 162 212 L204 184 L228 217 L255 197 L283 217 L308 184 L350 212 Q383 277 345 332 L308 375 L204 375Z\" fill=\"url(#cm-quantumdebug-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"211\" cy=\"270\" r=\"37\" fill=\"#10182d\" stroke=\"#cf79ff\" stroke-width=\"8\"/><circle cx=\"211\" cy=\"270\" r=\"20\" fill=\"#ebfbff\"/><circle cx=\"216\" cy=\"270\" r=\"11\" fill=\"#98f77e\"/><circle cx=\"301\" cy=\"270\" r=\"37\" fill=\"#10182d\" stroke=\"#cf79ff\" stroke-width=\"8\"/><circle cx=\"301\" cy=\"270\" r=\"20\" fill=\"#ebfbff\"/><circle cx=\"306\" cy=\"270\" r=\"11\" fill=\"#98f77e\"/><path d=\"M248 268 H264\" fill=\"none\" stroke=\"url(#cm-quantumdebug-metal)\" stroke-width=\"9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><polygon points=\"244,302 268,302 256,324\" fill=\"#98f77e\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"169\" y=\"222\" width=\"17\" height=\"10\" rx=\"2\" fill=\"#cf79ff\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"343\" y=\"222\" width=\"17\" height=\"10\" rx=\"2\" fill=\"#cf79ff\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"205\" y=\"346\" width=\"17\" height=\"10\" rx=\"2\" fill=\"#cf79ff\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"309\" y=\"346\" width=\"17\" height=\"10\" rx=\"2\" fill=\"#cf79ff\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><path d=\"M201.4 252.8 Q256 232.6 310.6 252.8\" fill=\"none\" stroke=\"#101629\" stroke-width=\"9.4\"/><circle cx=\"229.5\" cy=\"270\" r=\"21.8\" fill=\"#101629\" stroke=\"#cf79ff\" stroke-width=\"5.5\"/><circle cx=\"282.5\" cy=\"270\" r=\"21.8\" fill=\"#101629\" stroke=\"#ff65c9\" stroke-width=\"5.5\"/><circle cx=\"229.5\" cy=\"270\" r=\"7.8\" fill=\"#f5ffff\"/><circle cx=\"282.5\" cy=\"270\" r=\"7.8\" fill=\"#f5ffff\"/><circle cx=\"231.0\" cy=\"270.8\" r=\"3.9\" fill=\"#101629\"/><circle cx=\"284.1\" cy=\"270.8\" r=\"3.9\" fill=\"#101629\"/><path d=\"M188 200 l-6 -28 l17 21Z\" fill=\"#cf79ff\" stroke=\"#10172b\" stroke-width=\"4\"/><path d=\"M213 200 l-6 -28 l17 21Z\" fill=\"#98f77e\" stroke=\"#10172b\" stroke-width=\"4\"/><path d=\"M238 200 l-6 -28 l17 21Z\" fill=\"#cf79ff\" stroke=\"#10172b\" stroke-width=\"4\"/><circle cx=\"256\" cy=\"270\" r=\"103\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"3\" stroke-dasharray=\"2 11\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#98f77e\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#cf79ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#98f77e\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "quantumracer": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-quantumracer-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e795f3\"/><stop offset=\".42\" stop-color=\"#ce4be2\"/><stop offset=\"1\" stop-color=\"#991499\"/></linearGradient><linearGradient id=\"cm-quantumracer-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#d71d6e\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-quantumracer-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#cf79ff\"/><stop offset=\"1\" stop-color=\"#d71d6e\"/></radialGradient><filter id=\"cm-quantumracer-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#cf79ff\" opacity=\".12\" filter=\"url(#cm-quantumracer-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M78 307 L143 263 L222 251 L301 217 L392 241 L432 271 L371 292 L300 294 L222 330 L131 334Z\" fill=\"url(#cm-quantumracer-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M89 280 L154 235 L231 227 L310 196 L401 220 L441 250 L380 270 L310 273 L231 307 L140 310Z\" fill=\"url(#cm-quantumracer-metal)\" stroke=\"#10172b\" stroke-linejoin=\"round\" stroke-linecap=\"round\" opacity=\".45\" stroke-width=\"6\"/><circle cx=\"162\" cy=\"337\" r=\"27\" fill=\"#10182d\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"#cf79ff\" stroke-width=\"7\"/><circle cx=\"162\" cy=\"337\" r=\"9\" fill=\"#98f77e\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"340\" cy=\"337\" r=\"27\" fill=\"#10182d\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"#cf79ff\" stroke-width=\"7\"/><circle cx=\"340\" cy=\"337\" r=\"9\" fill=\"#98f77e\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><path d=\"M141 294 H353\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M169 274 L204 260 M287 256 L323 242\" fill=\"none\" stroke=\"#98f77e\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M313.1 253.8 Q345 238.9 376.9 253.8 L372.4 273.1 Q345 281.2 317.6 273.1 Z\" fill=\"#101629\" stroke=\"#cf79ff\" stroke-width=\"3.1\"/><path d=\"M325.6 263.2 l24 -6 M353.1 260.5 l24 6\" stroke=\"#ff65c9\" stroke-width=\"4.0\" stroke-linecap=\"round\"/><path d=\"M336.0 275.4 h40\" stroke=\"#f8fbff\" stroke-width=\"2.2\" stroke-linecap=\"round\"/><path d=\"M104 357 H215 L238 333 M104 373 H215 L238 349 M278 309 L300 286 H407 M278 326 L300 303 H407\" stroke=\"#cf79ff\" stroke-width=\"6\" fill=\"none\"/><path d=\"M128 155 l11 0 M133 149 v12 M376 390 l11 0 M381 384 v12\" stroke=\"#98f77e\" stroke-width=\"4\" stroke-linecap=\"round\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#98f77e\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#cf79ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#98f77e\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "racecondition": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-racecondition-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#95e4f3\"/><stop offset=\".42\" stop-color=\"#4bc9e2\"/><stop offset=\"1\" stop-color=\"#147199\"/></linearGradient><linearGradient id=\"cm-racecondition-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#1d36d7\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-racecondition-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#57e8ff\"/><stop offset=\"1\" stop-color=\"#1d36d7\"/></radialGradient><filter id=\"cm-racecondition-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#57e8ff\" opacity=\".12\" filter=\"url(#cm-racecondition-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M98 302 L148 252 L208 254 L270 222 L343 242 L402 214 L375 272 L324 287 L273 324 L193 331 L136 356Z\" fill=\"url(#cm-racecondition-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M104 321 L67 353 L122 347 M141 344 L111 385 L168 360 M289 316 L306 373 L346 370\" fill=\"url(#cm-racecondition-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M148 268 L112 226 L178 244 M328 245 L374 200 L361 257\" fill=\"#f7887e\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M89 284 L42 294 L68 272 M122 304 L64 320 L85 298\" fill=\"#57e8ff\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><ellipse cx=\"321.6\" cy=\"268.9\" rx=\"9.5\" ry=\"12.2\" fill=\"#f8ffff\"/><ellipse cx=\"354.4\" cy=\"268.9\" rx=\"9.5\" ry=\"12.2\" fill=\"#f8ffff\"/><ellipse cx=\"323.7\" cy=\"271\" rx=\"4.2\" ry=\"6.9\" fill=\"#11172b\"/><ellipse cx=\"356.6\" cy=\"271\" rx=\"4.2\" ry=\"6.9\" fill=\"#11172b\"/><circle cx=\"322.6\" cy=\"266.8\" r=\"2.1\" fill=\"#ffffff\"/><circle cx=\"355.5\" cy=\"266.8\" r=\"2.1\" fill=\"#ffffff\"/><path d=\"M327.9 285.8 Q338 294.9 348.1 285.8\" stroke=\"#ff65c9\" stroke-width=\"3.2\" fill=\"none\" stroke-linecap=\"round\"/><circle cx=\"155\" cy=\"195\" r=\"23\" fill=\"#10182d\" stroke=\"#f7887e\" stroke-width=\"6\"/><path d=\"M155 183 V195 L168 202\" stroke=\"#57e8ff\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/><circle cx=\"359\" cy=\"183\" r=\"23\" fill=\"#10182d\" stroke=\"#f7887e\" stroke-width=\"6\"/><path d=\"M359 171 V183 L372 190\" stroke=\"#57e8ff\" stroke-width=\"5\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M128 155 l11 0 M133 149 v12 M376 390 l11 0 M381 384 v12\" stroke=\"#f7887e\" stroke-width=\"4\" stroke-linecap=\"round\"/><path d=\"M262 301 l23 17 l-12 17 l24 15\" stroke=\"#ff67c9\" stroke-width=\"6\" fill=\"none\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#f7887e\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#57e8ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#f7887e\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "raceweaver": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-raceweaver-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#95f3a2\"/><stop offset=\".42\" stop-color=\"#4be25f\"/><stop offset=\"1\" stop-color=\"#149938\"/></linearGradient><linearGradient id=\"cm-raceweaver-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#1dd7b8\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-raceweaver-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#a8ff6e\"/><stop offset=\"1\" stop-color=\"#1dd7b8\"/></radialGradient><filter id=\"cm-raceweaver-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#a8ff6e\" opacity=\".12\" filter=\"url(#cm-raceweaver-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><ellipse cx=\"259\" cy=\"287\" rx=\"68\" ry=\"52\" fill=\"url(#cm-raceweaver-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"319\" cy=\"248\" rx=\"42\" ry=\"35\" fill=\"url(#cm-raceweaver-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M218 230 Q154 190 108 238\" fill=\"url(#cm-raceweaver-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M288 230 Q353 190 402 238\" fill=\"url(#cm-raceweaver-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M230 261 Q150 221 104 269\" fill=\"url(#cm-raceweaver-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M294 261 Q358 221 406 269\" fill=\"url(#cm-raceweaver-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M242 292 Q146 252 100 300\" fill=\"url(#cm-raceweaver-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M300 292 Q363 252 410 300\" fill=\"url(#cm-raceweaver-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M254 323 Q142 283 96 331\" fill=\"url(#cm-raceweaver-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M306 323 Q368 283 414 331\" fill=\"url(#cm-raceweaver-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M165 270 L125 232 L185 247 M345 253 L386 211 L374 269\" fill=\"#f77ef1\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M110 178 L401 382 M112 382 L399 178 M152 169 L367 391 M151 390 L369 170\" stroke=\"#a8ff6e\" stroke-width=\"3\" opacity=\".6\" fill=\"none\"/><path d=\"M285.0 238.0 Q320 225.0 355.0 238.0\" fill=\"none\" stroke=\"#101629\" stroke-width=\"6.0\"/><circle cx=\"303.0\" cy=\"249\" r=\"14.0\" fill=\"#101629\" stroke=\"#a8ff6e\" stroke-width=\"3.5\"/><circle cx=\"337.0\" cy=\"249\" r=\"14.0\" fill=\"#101629\" stroke=\"#ff65c9\" stroke-width=\"3.5\"/><circle cx=\"303.0\" cy=\"249\" r=\"5.0\" fill=\"#f5ffff\"/><circle cx=\"337.0\" cy=\"249\" r=\"5.0\" fill=\"#f5ffff\"/><circle cx=\"304.0\" cy=\"249.5\" r=\"2.5\" fill=\"#101629\"/><circle cx=\"338.0\" cy=\"249.5\" r=\"2.5\" fill=\"#101629\"/><path d=\"M108 172 L405 381 M106 381 L406 173 M158 158 L360 393 M159 395 L361 156\" stroke=\"#a8ff6e\" stroke-width=\"4\" opacity=\".7\" fill=\"none\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#f77ef1\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#a8ff6e\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#f77ef1\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "recursaur": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-recursaur-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#95c4f3\"/><stop offset=\".42\" stop-color=\"#4b96e2\"/><stop offset=\"1\" stop-color=\"#144599\"/></linearGradient><linearGradient id=\"cm-recursaur-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#431dd7\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-recursaur-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#57e8ff\"/><stop offset=\"1\" stop-color=\"#431dd7\"/></radialGradient><filter id=\"cm-recursaur-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#57e8ff\" opacity=\".12\" filter=\"url(#cm-recursaur-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M200 243 Q239 201 283 232 L315 276 L291 307 L265 348 L235 346 L221 301 L180 306 L157 286Z\" fill=\"url(#cm-recursaur-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M264 245 L296 194 L330 212 L313 255 L291 277\" fill=\"url(#cm-recursaur-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M308 214 L341 181 L342 221 L324 243\" fill=\"#f7b07e\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M225 339 L205 399 L240 409 L258 354 M273 350 L294 406 L329 395 L309 328\" fill=\"url(#cm-recursaur-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M185 275 Q142 244 144 296 Q146 333 178 331 Q205 327 206 304\" fill=\"#57e8ff\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"254\" cy=\"283\" r=\"17\" fill=\"none\" stroke=\"#f7b07e\" stroke-width=\"4\" opacity=\".85\"/><circle cx=\"254\" cy=\"283\" r=\"32\" fill=\"none\" stroke=\"#f7b07e\" stroke-width=\"4\" opacity=\".85\"/><circle cx=\"254\" cy=\"283\" r=\"47\" fill=\"none\" stroke=\"#f7b07e\" stroke-width=\"4\" opacity=\".85\"/><ellipse cx=\"264.9\" cy=\"271.7\" rx=\"9.9\" ry=\"13.2\" fill=\"#f7fcff\"/><ellipse cx=\"299.1\" cy=\"271.7\" rx=\"9.9\" ry=\"13.2\" fill=\"#f7fcff\"/><circle cx=\"266.6\" cy=\"273.9\" r=\"5.0\" fill=\"#101629\"/><circle cx=\"300.7\" cy=\"273.9\" r=\"5.0\" fill=\"#101629\"/><path d=\"M265.5 289.3 Q282 308.6 300.1 288.8 Q287.5 298.1 265.5 289.3Z\" fill=\"#15152c\" stroke=\"#ff65c9\" stroke-width=\"2.2\"/><path d=\"M271.6 290.4 l7 15 l5 -12 M288.6 292.1 l7 11 l4 -15\" fill=\"#fff5f5\" stroke=\"#f7fcff\" stroke-width=\"2\"/><circle cx=\"256\" cy=\"287\" r=\"22\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"5\"/><circle cx=\"256\" cy=\"287\" r=\"36\" fill=\"none\" stroke=\"#f7b07e\" stroke-width=\"5\"/><circle cx=\"256\" cy=\"287\" r=\"51\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"5\"/><circle cx=\"256\" cy=\"120\" r=\"5\" fill=\"#f7b07e\"/><circle cx=\"128\" cy=\"300\" r=\"4\" fill=\"#57e8ff\"/><circle cx=\"385\" cy=\"300\" r=\"4\" fill=\"#f7b07e\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#f7b07e\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#57e8ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#f7b07e\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "recursion": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-recursion-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#95f3c4\"/><stop offset=\".42\" stop-color=\"#4be296\"/><stop offset=\"1\" stop-color=\"#149969\"/></linearGradient><linearGradient id=\"cm-recursion-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#1db2d7\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-recursion-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#57e8ff\"/><stop offset=\"1\" stop-color=\"#1db2d7\"/></radialGradient><filter id=\"cm-recursion-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#57e8ff\" opacity=\".12\" filter=\"url(#cm-recursion-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M122 339 Q154 280 225 298 Q278 304 294 349 Q304 383 352 383 Q406 380 392 336 Q378 309 354 327\" fill=\"url(#cm-recursion-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M191 302 Q161 255 196 220 L240 201 L275 222 L263 252 L223 264 L225 298\" fill=\"url(#cm-recursion-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M238 207 L229 168 L254 192 L274 161 L278 215\" fill=\"#f77ec4\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M212 285 L156 238 L181 309 M264 294 L310 248 L298 326\" fill=\"url(#cm-recursion-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M157 336 L138 395 L174 396 L194 350 M230 342 L221 397 L251 397 L264 347\" fill=\"url(#cm-recursion-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"360\" cy=\"354\" r=\"30\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"5\" opacity=\".7\"/><circle cx=\"360\" cy=\"354\" r=\"50\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"5\" opacity=\".7\"/><circle cx=\"360\" cy=\"354\" r=\"70\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"5\" opacity=\".7\"/><ellipse cx=\"222.9\" cy=\"232.8\" rx=\"9.9\" ry=\"12.7\" fill=\"#f8ffff\"/><ellipse cx=\"257.1\" cy=\"232.8\" rx=\"9.9\" ry=\"12.7\" fill=\"#f8ffff\"/><ellipse cx=\"225.2\" cy=\"235\" rx=\"4.4\" ry=\"7.2\" fill=\"#11172b\"/><ellipse cx=\"259.2\" cy=\"235\" rx=\"4.4\" ry=\"7.2\" fill=\"#11172b\"/><circle cx=\"224.1\" cy=\"230.6\" r=\"2.2\" fill=\"#ffffff\"/><circle cx=\"258.1\" cy=\"230.6\" r=\"2.2\" fill=\"#ffffff\"/><path d=\"M229.6 250.4 Q240 259.8 250.4 250.4\" stroke=\"#ff65c9\" stroke-width=\"3.3\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M338 367 C294 317 348 285 382 318 C419 352 372 395 337 369 C302 342 257 375 234 354\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"10\" stroke-linecap=\"round\"/><circle cx=\"256\" cy=\"120\" r=\"5\" fill=\"#f77ec4\"/><circle cx=\"128\" cy=\"300\" r=\"4\" fill=\"#57e8ff\"/><circle cx=\"385\" cy=\"300\" r=\"4\" fill=\"#f77ec4\"/><path d=\"M234 327 q22 18 44 0 q-22 -20 -44 0\" fill=\"none\" stroke=\"#ff65c9\" stroke-width=\"5\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#f77ec4\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#57e8ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#f77ec4\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "segfault": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-segfault-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f39595\"/><stop offset=\".42\" stop-color=\"#e24b4b\"/><stop offset=\"1\" stop-color=\"#992614\"/></linearGradient><linearGradient id=\"cm-segfault-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#d7a01d\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-segfault-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#a8ff6e\"/><stop offset=\"1\" stop-color=\"#d7a01d\"/></radialGradient><filter id=\"cm-segfault-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#a8ff6e\" opacity=\".12\" filter=\"url(#cm-segfault-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M135 284 Q184 243 248 258 L319 238 L356 261 L326 293 L278 300 L259 350 L226 352 L211 309 L172 340 L142 337Z\" fill=\"url(#cm-segfault-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M303 256 L321 193 L354 227 L382 204 L379 267 L352 287Z\" fill=\"url(#cm-segfault-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M349 260 L412 281 L377 304 L337 292Z\" fill=\"url(#cm-segfault-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M163 313 L145 386 L174 391 L197 332 M231 336 L220 395 L249 397 L259 341 M291 303 L306 377 L331 374 L323 291\" fill=\"url(#cm-segfault-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M177 271 L205 236 L213 263 L239 223 L253 265\" fill=\"#7ef7ed\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"324.9\" cy=\"259.7\" rx=\"9.9\" ry=\"13.2\" fill=\"#f7fcff\"/><ellipse cx=\"359.1\" cy=\"259.7\" rx=\"9.9\" ry=\"13.2\" fill=\"#f7fcff\"/><circle cx=\"326.6\" cy=\"261.9\" r=\"5.0\" fill=\"#101629\"/><circle cx=\"360.7\" cy=\"261.9\" r=\"5.0\" fill=\"#101629\"/><path d=\"M325.5 277.3 Q342 296.6 360.1 276.8 Q347.5 286.1 325.5 277.3Z\" fill=\"#15152c\" stroke=\"#ff65c9\" stroke-width=\"2.2\"/><path d=\"M331.6 278.4 l7 15 l5 -12 M348.6 280.1 l7 11 l4 -15\" fill=\"#fff5f5\" stroke=\"#f7fcff\" stroke-width=\"2\"/><path d=\"M366 155 L405 220 L327 220Z\" fill=\"#ffd85f\" stroke=\"#10172b\" stroke-width=\"7\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M366 177 v19 M366 205 v2\" stroke=\"#10182d\" stroke-width=\"7\" stroke-linecap=\"round\"/><path d=\"M339 308 l13 13 l-13 13\" stroke=\"#ffd86b\" stroke-width=\"5\" fill=\"none\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#7ef7ed\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#a8ff6e\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#7ef7ed\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "stackoverflow": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-stackoverflow-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f3a595\"/><stop offset=\".42\" stop-color=\"#e2644b\"/><stop offset=\"1\" stop-color=\"#993c14\"/></linearGradient><linearGradient id=\"cm-stackoverflow-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#d7bf1d\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-stackoverflow-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#cf79ff\"/><stop offset=\"1\" stop-color=\"#d7bf1d\"/></radialGradient><filter id=\"cm-stackoverflow-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#cf79ff\" opacity=\".12\" filter=\"url(#cm-stackoverflow-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><rect x=\"157\" y=\"152\" width=\"198\" height=\"85\" rx=\"18\" fill=\"url(#cm-stackoverflow-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"131\" y=\"235\" width=\"250\" height=\"98\" rx=\"15\" fill=\"url(#cm-stackoverflow-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"158\" y=\"330\" width=\"196\" height=\"70\" rx=\"14\" fill=\"url(#cm-stackoverflow-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"169\" y=\"140\" width=\"42\" height=\"18\" rx=\"5\" fill=\"#7eedf7\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" opacity=\".9\"/><rect x=\"225\" y=\"140\" width=\"42\" height=\"18\" rx=\"5\" fill=\"#cf79ff\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"281\" y=\"140\" width=\"42\" height=\"18\" rx=\"5\" fill=\"#7eedf7\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"115\" y=\"250\" width=\"28\" height=\"80\" rx=\"7\" fill=\"url(#cm-stackoverflow-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"369\" y=\"250\" width=\"28\" height=\"80\" rx=\"7\" fill=\"url(#cm-stackoverflow-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"171\" y=\"391\" width=\"51\" height=\"45\" rx=\"6\" fill=\"url(#cm-stackoverflow-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"290\" y=\"391\" width=\"51\" height=\"45\" rx=\"6\" fill=\"url(#cm-stackoverflow-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M164 268 H348 M163 300 H347\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><rect x=\"212.9\" y=\"161.3\" width=\"86.1\" height=\"56.9\" rx=\"8.8\" fill=\"#10182d\" stroke=\"#cf79ff\" stroke-width=\"5.1\"/><rect x=\"224.6\" y=\"171.5\" width=\"21.9\" height=\"16.8\" rx=\"2.9\" fill=\"#cf79ff\"/><rect x=\"265.5\" y=\"171.5\" width=\"21.9\" height=\"16.8\" rx=\"2.9\" fill=\"#ff65c9\"/><path d=\"M237.0 202.1 h52\" stroke=\"#d9faff\" stroke-width=\"4.4\" stroke-linecap=\"round\"/><circle cx=\"306.4\" cy=\"166.4\" r=\"3.6\" fill=\"#a7ff6b\"/><rect x=\"218\" y=\"295\" width=\"76\" height=\"48\" rx=\"7\" fill=\"#11172b\" stroke=\"#cf79ff\" stroke-width=\"6\"/><path d=\"M231 309 h21 M231 323 h34\" stroke=\"#7eedf7\" stroke-width=\"5\"/><path d=\"M128 424 H384\" stroke=\"#cf79ff\" stroke-width=\"4\" stroke-dasharray=\"3 12\" opacity=\".75\"/><rect x=\"237\" y=\"355\" width=\"38\" height=\"16\" rx=\"3\" fill=\"#a7ff82\"/><path d=\"M244 361 h23\" stroke=\"#11172b\" stroke-width=\"3\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#7eedf7\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#cf79ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#7eedf7\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "stackravager": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-stackravager-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#95aef3\"/><stop offset=\".42\" stop-color=\"#4b73e2\"/><stop offset=\"1\" stop-color=\"#142699\"/></linearGradient><linearGradient id=\"cm-stackravager-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#6e1dd7\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-stackravager-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#57e8ff\"/><stop offset=\"1\" stop-color=\"#6e1dd7\"/></radialGradient><filter id=\"cm-stackravager-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#57e8ff\" opacity=\".12\" filter=\"url(#cm-stackravager-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M202 210 L226 177 L273 177 L303 213 L330 253 L316 319 L284 355 L221 348 L186 319 L177 255Z\" fill=\"url(#cm-stackravager-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M214 219 L174 248 L155 326 L187 340 L219 278 M298 220 L340 247 L361 319 L333 339 L305 279\" fill=\"url(#cm-stackravager-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M225 342 L211 397 L239 403 L255 354 M279 353 L299 404 L327 396 L308 342\" fill=\"url(#cm-stackravager-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"191\" y=\"220\" width=\"48\" height=\"48\" rx=\"5\" fill=\"#10182d\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"#57e8ff\" stroke-width=\"5\"/><rect x=\"274\" y=\"220\" width=\"48\" height=\"48\" rx=\"5\" fill=\"#10182d\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"#f7cc7e\" stroke-width=\"5\"/><path d=\"M256 221 V343\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M250 239 h12 M250 258 h12 M250 277 h12 M250 296 h12\" fill=\"none\" stroke=\"#f7cc7e\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M213.3 250.6 Q256 234.7 298.7 250.6\" fill=\"none\" stroke=\"#101629\" stroke-width=\"7.3\"/><circle cx=\"235.3\" cy=\"264\" r=\"17.1\" fill=\"#101629\" stroke=\"#57e8ff\" stroke-width=\"4.3\"/><circle cx=\"276.7\" cy=\"264\" r=\"17.1\" fill=\"#101629\" stroke=\"#ff65c9\" stroke-width=\"4.3\"/><circle cx=\"235.3\" cy=\"264\" r=\"6.1\" fill=\"#f5ffff\"/><circle cx=\"276.7\" cy=\"264\" r=\"6.1\" fill=\"#f5ffff\"/><circle cx=\"236.5\" cy=\"264.6\" r=\"3.0\" fill=\"#101629\"/><circle cx=\"278.0\" cy=\"264.6\" r=\"3.0\" fill=\"#101629\"/><rect x=\"152\" y=\"211\" width=\"63\" height=\"42\" rx=\"6\" fill=\"#10182d\" stroke=\"#57e8ff\" stroke-width=\"5\"/><path d=\"M159 223 h47 M159 237 h29\" stroke=\"#57e8ff\" stroke-width=\"4\"/><rect x=\"320\" y=\"207\" width=\"63\" height=\"42\" rx=\"6\" fill=\"#10182d\" stroke=\"#f7cc7e\" stroke-width=\"5\"/><path d=\"M327 219 h47 M327 233 h29\" stroke=\"#f7cc7e\" stroke-width=\"4\"/><path d=\"M128 424 H384\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-dasharray=\"3 12\" opacity=\".75\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#f7cc7e\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#57e8ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#f7cc7e\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "stacktitan": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-stacktitan-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f0f395\"/><stop offset=\".42\" stop-color=\"#dde24b\"/><stop offset=\"1\" stop-color=\"#839914\"/></linearGradient><linearGradient id=\"cm-stacktitan-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#4fd71d\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-stacktitan-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#a8ff6e\"/><stop offset=\"1\" stop-color=\"#4fd71d\"/></radialGradient><filter id=\"cm-stacktitan-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#a8ff6e\" opacity=\".12\" filter=\"url(#cm-stacktitan-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><rect x=\"183\" y=\"128\" width=\"148\" height=\"101\" rx=\"14\" fill=\"url(#cm-stacktitan-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"153\" y=\"222\" width=\"206\" height=\"117\" rx=\"15\" fill=\"url(#cm-stacktitan-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"176\" y=\"333\" width=\"160\" height=\"86\" rx=\"12\" fill=\"url(#cm-stacktitan-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M198 148 H314\" fill=\"none\" stroke=\"#7e84f7\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"210\" cy=\"148\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"232\" cy=\"148\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"254\" cy=\"148\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"276\" cy=\"148\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"298\" cy=\"148\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><path d=\"M198 179 H314\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"210\" cy=\"179\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"232\" cy=\"179\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"254\" cy=\"179\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"276\" cy=\"179\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"298\" cy=\"179\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><path d=\"M198 209 H314\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"210\" cy=\"209\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"232\" cy=\"209\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"254\" cy=\"209\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"276\" cy=\"209\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"298\" cy=\"209\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><path d=\"M198 247 H314\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"210\" cy=\"247\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"232\" cy=\"247\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"254\" cy=\"247\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"276\" cy=\"247\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"298\" cy=\"247\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><path d=\"M198 278 H314\" fill=\"none\" stroke=\"#7e84f7\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"210\" cy=\"278\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"232\" cy=\"278\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"254\" cy=\"278\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"276\" cy=\"278\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"298\" cy=\"278\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><path d=\"M198 309 H314\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"210\" cy=\"309\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"232\" cy=\"309\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"254\" cy=\"309\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"276\" cy=\"309\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"298\" cy=\"309\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><path d=\"M198 355 H314\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"210\" cy=\"355\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"232\" cy=\"355\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"254\" cy=\"355\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"276\" cy=\"355\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"298\" cy=\"355\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><path d=\"M198 385 H314\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"210\" cy=\"385\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"232\" cy=\"385\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"254\" cy=\"385\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"276\" cy=\"385\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"298\" cy=\"385\" r=\"3\" fill=\"#7e84f7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><path d=\"M160 247 L113 225 L90 257 L151 286Z\" fill=\"url(#cm-stacktitan-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M353 247 L398 225 L423 257 L361 286Z\" fill=\"url(#cm-stacktitan-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M203 414 L194 443 L226 443 L237 415 M281 415 L290 443 L322 443 L315 414\" fill=\"url(#cm-stacktitan-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"217.1\" y=\"164.9\" width=\"77.9\" height=\"51.5\" rx=\"7.9\" fill=\"#10182d\" stroke=\"#a8ff6e\" stroke-width=\"4.6\"/><rect x=\"227.6\" y=\"174.2\" width=\"19.8\" height=\"15.2\" rx=\"2.6\" fill=\"#a8ff6e\"/><rect x=\"264.6\" y=\"174.2\" width=\"19.8\" height=\"15.2\" rx=\"2.6\" fill=\"#ff65c9\"/><path d=\"M238.8 201.9 h52\" stroke=\"#d9faff\" stroke-width=\"4.0\" stroke-linecap=\"round\"/><circle cx=\"301.5\" cy=\"169.5\" r=\"3.3\" fill=\"#a7ff6b\"/><rect x=\"205\" y=\"122\" width=\"102\" height=\"19\" rx=\"4\" fill=\"#10182d\" stroke=\"#a8ff6e\" stroke-width=\"4\"/><circle cx=\"219\" cy=\"131\" r=\"3\" fill=\"#7e84f7\"/><rect x=\"205\" y=\"151\" width=\"102\" height=\"19\" rx=\"4\" fill=\"#10182d\" stroke=\"#a8ff6e\" stroke-width=\"4\"/><circle cx=\"219\" cy=\"160\" r=\"3\" fill=\"#7e84f7\"/><rect x=\"205\" y=\"180\" width=\"102\" height=\"19\" rx=\"4\" fill=\"#10182d\" stroke=\"#a8ff6e\" stroke-width=\"4\"/><circle cx=\"219\" cy=\"189\" r=\"3\" fill=\"#7e84f7\"/><path d=\"M128 408 h28 M356 408 h28\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#7e84f7\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#a8ff6e\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#7e84f7\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "stackwisp": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-stackwisp-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#dd95f3\"/><stop offset=\".42\" stop-color=\"#bf4be2\"/><stop offset=\"1\" stop-color=\"#8c1499\"/></linearGradient><linearGradient id=\"cm-stackwisp-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#d71d81\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-stackwisp-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#cf79ff\"/><stop offset=\"1\" stop-color=\"#d71d81\"/></radialGradient><filter id=\"cm-stackwisp-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#cf79ff\" opacity=\".12\" filter=\"url(#cm-stackwisp-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><rect x=\"145\" y=\"195\" width=\"220\" height=\"140\" rx=\"14\" fill=\"none\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"#cf79ff\" stroke-width=\"10\" opacity=\".8\"/><rect x=\"175\" y=\"220\" width=\"205\" height=\"142\" rx=\"14\" fill=\"url(#cm-stackwisp-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"204\" y=\"241\" width=\"176\" height=\"138\" rx=\"14\" fill=\"url(#cm-stackwisp-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M204 355 Q183 392 209 416 L247 389 L278 418 L309 390 L335 418 Q355 387 334 355Z\" fill=\"url(#cm-stackwisp-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"225\" cy=\"258\" r=\"5\" fill=\"#a4f77e\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"246\" cy=\"258\" r=\"5\" fill=\"#a4f77e\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"267\" cy=\"258\" r=\"5\" fill=\"#a4f77e\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><path d=\"M220 300 h138\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><rect x=\"247.7\" y=\"268.3\" width=\"76.7\" height=\"50.7\" rx=\"7.8\" fill=\"#10182d\" stroke=\"#cf79ff\" stroke-width=\"4.5\"/><rect x=\"258.1\" y=\"277.4\" width=\"19.5\" height=\"15.0\" rx=\"2.6\" fill=\"#cf79ff\"/><rect x=\"294.4\" y=\"277.4\" width=\"19.5\" height=\"15.0\" rx=\"2.6\" fill=\"#ff65c9\"/><path d=\"M269.1 304.7 h52\" stroke=\"#d9faff\" stroke-width=\"3.9\" stroke-linecap=\"round\"/><circle cx=\"330.9\" cy=\"272.9\" r=\"3.2\" fill=\"#a7ff6b\"/><rect x=\"132\" y=\"159\" width=\"72\" height=\"34\" rx=\"7\" fill=\"#10182d\" stroke=\"#a4f77e\" stroke-width=\"5\"/><rect x=\"306\" y=\"162\" width=\"79\" height=\"34\" rx=\"7\" fill=\"#10182d\" stroke=\"#cf79ff\" stroke-width=\"5\"/><path d=\"M128 424 H384\" stroke=\"#cf79ff\" stroke-width=\"4\" stroke-dasharray=\"3 12\" opacity=\".75\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#a4f77e\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#cf79ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#a4f77e\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "stalemateon": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-stalemateon-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#e495f3\"/><stop offset=\".42\" stop-color=\"#c94be2\"/><stop offset=\"1\" stop-color=\"#951499\"/></linearGradient><linearGradient id=\"cm-stalemateon-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#d71d74\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-stalemateon-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#cf79ff\"/><stop offset=\"1\" stop-color=\"#d71d74\"/></radialGradient><filter id=\"cm-stalemateon-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#cf79ff\" opacity=\".12\" filter=\"url(#cm-stalemateon-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M187 210 L147 174 L179 152 L208 180 L238 155 L277 186 L302 222 L285 254 L256 273 L229 258 L198 277 L184 244Z\" fill=\"url(#cm-stalemateon-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M199 268 Q149 282 165 334 L213 350 L250 321 L285 344 L327 323 L314 284 L273 267Z\" fill=\"url(#cm-stalemateon-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M167 347 L142 379 L175 391 L203 358 M278 350 L303 385 L335 375 L321 339\" fill=\"url(#cm-stalemateon-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"113,406 398,406 421,438 91,438\" fill=\"#10182d\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M132 409 V434\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M179 409 V434\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M226 409 V434\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M273 409 V434\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M320 409 V434\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M367 409 V434\" fill=\"none\" stroke=\"#cf79ff\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><path d=\"M112 421 H400\" fill=\"none\" stroke=\"#9cf77e\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><ellipse cx=\"203.9\" cy=\"205.9\" rx=\"9.4\" ry=\"12.0\" fill=\"#f8ffff\"/><ellipse cx=\"236.1\" cy=\"205.9\" rx=\"9.4\" ry=\"12.0\" fill=\"#f8ffff\"/><ellipse cx=\"206.0\" cy=\"208\" rx=\"4.2\" ry=\"6.8\" fill=\"#11172b\"/><ellipse cx=\"238.2\" cy=\"208\" rx=\"4.2\" ry=\"6.8\" fill=\"#11172b\"/><circle cx=\"204.9\" cy=\"203.8\" r=\"2.1\" fill=\"#ffffff\"/><circle cx=\"237.2\" cy=\"203.8\" r=\"2.1\" fill=\"#ffffff\"/><path d=\"M210.1 222.6 Q220 231.4 229.9 222.6\" stroke=\"#ff65c9\" stroke-width=\"3.1\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M180 188 l-24 -30 l37 17Z\" fill=\"#cf79ff\" stroke=\"#10172b\" stroke-width=\"4\"/><path d=\"M195 182 l-24 -30 l37 17Z\" fill=\"#9cf77e\" stroke=\"#10172b\" stroke-width=\"4\"/><path d=\"M210 176 l-24 -30 l37 17Z\" fill=\"#cf79ff\" stroke=\"#10172b\" stroke-width=\"4\"/><path d=\"M225 170 l-24 -30 l37 17Z\" fill=\"#9cf77e\" stroke=\"#10172b\" stroke-width=\"4\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#cf79ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#9cf77e\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#cf79ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#9cf77e\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "temporlock": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-temporlock-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#95f0f3\"/><stop offset=\".42\" stop-color=\"#4bdde2\"/><stop offset=\"1\" stop-color=\"#148399\"/></linearGradient><linearGradient id=\"cm-temporlock-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#1d4fd7\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-temporlock-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#57e8ff\"/><stop offset=\"1\" stop-color=\"#1d4fd7\"/></radialGradient><filter id=\"cm-temporlock-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#57e8ff\" opacity=\".12\" filter=\"url(#cm-temporlock-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M133 319 Q116 266 163 235 Q230 182 316 221 Q375 244 370 309 L344 347 L179 350Z\" fill=\"url(#cm-temporlock-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M169 236 Q158 281 175 331\" fill=\"url(#cm-temporlock-metal)\" stroke=\"#10172b\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"8\"/><path d=\"M204 236 Q193 281 210 331\" fill=\"url(#cm-temporlock-metal)\" stroke=\"#10172b\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"8\"/><path d=\"M239 236 Q228 281 245 331\" fill=\"url(#cm-temporlock-metal)\" stroke=\"#10172b\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"8\"/><path d=\"M274 236 Q263 281 280 331\" fill=\"url(#cm-temporlock-metal)\" stroke=\"#10172b\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"8\"/><path d=\"M309 236 Q298 281 315 331\" fill=\"url(#cm-temporlock-metal)\" stroke=\"#10172b\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke-width=\"8\"/><path d=\"M152 309 L100 324 L91 354 L146 349 M348 310 L398 325 L409 354 L354 349\" fill=\"url(#cm-temporlock-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"257\" cy=\"274\" r=\"52\" fill=\"#10182d\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"#57e8ff\" stroke-width=\"8\"/><path d=\"M257 273 L257 238 M257 273 L287 288\" fill=\"none\" stroke=\"#f77e84\" stroke-width=\"8\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"257\" cy=\"273\" r=\"7\" fill=\"#57e8ff\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><path d=\"M184 347 L171 389 L198 390 L220 350 M298 350 L316 390 L341 382 L333 346\" fill=\"url(#cm-temporlock-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M173.7 285.4 Q187.9 271.1 201.2 285.9\" stroke=\"#f6fcff\" stroke-width=\"6.1\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M209.4 285.9 Q223.7 271.1 236.3 285.4\" stroke=\"#f6fcff\" stroke-width=\"6.1\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M192.9 303.5 Q205 311.2 217.1 303.5\" stroke=\"#ff65c9\" stroke-width=\"3.3\" fill=\"none\" stroke-linecap=\"round\"/><circle cx=\"257\" cy=\"271\" r=\"61\" fill=\"#10182d\" stroke=\"#57e8ff\" stroke-width=\"8\"/><path d=\"M257 225 V271 L288 287\" stroke=\"#f77e84\" stroke-width=\"8\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M305.0 271.0 L312.0 271.0\" stroke=\"#f77e84\" stroke-width=\"3\"/><path d=\"M298.4 295.5 L304.5 299.0\" stroke=\"#f77e84\" stroke-width=\"3\"/><path d=\"M280.5 313.4 L284.0 319.5\" stroke=\"#f77e84\" stroke-width=\"3\"/><path d=\"M256.0 320.0 L256.0 327.0\" stroke=\"#f77e84\" stroke-width=\"3\"/><path d=\"M231.5 313.4 L228.0 319.5\" stroke=\"#f77e84\" stroke-width=\"3\"/><path d=\"M213.6 295.5 L207.5 299.0\" stroke=\"#f77e84\" stroke-width=\"3\"/><path d=\"M207.0 271.0 L200.0 271.0\" stroke=\"#f77e84\" stroke-width=\"3\"/><path d=\"M213.6 246.5 L207.5 243.0\" stroke=\"#f77e84\" stroke-width=\"3\"/><path d=\"M231.5 228.6 L228.0 222.5\" stroke=\"#f77e84\" stroke-width=\"3\"/><path d=\"M256.0 222.0 L256.0 215.0\" stroke=\"#f77e84\" stroke-width=\"3\"/><path d=\"M280.5 228.6 L284.0 222.5\" stroke=\"#f77e84\" stroke-width=\"3\"/><path d=\"M298.4 246.5 L304.5 243.0\" stroke=\"#f77e84\" stroke-width=\"3\"/><path d=\"M128 155 l11 0 M133 149 v12 M376 390 l11 0 M381 384 v12\" stroke=\"#f77e84\" stroke-width=\"4\" stroke-linecap=\"round\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#f77e84\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#57e8ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#f77e84\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "threadlet": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-threadlet-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#95e1f3\"/><stop offset=\".42\" stop-color=\"#4bc4e2\"/><stop offset=\"1\" stop-color=\"#146d99\"/></linearGradient><linearGradient id=\"cm-threadlet-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#1d30d7\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-threadlet-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#57e8ff\"/><stop offset=\"1\" stop-color=\"#1d30d7\"/></radialGradient><filter id=\"cm-threadlet-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#57e8ff\" opacity=\".12\" filter=\"url(#cm-threadlet-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><ellipse cx=\"256\" cy=\"288\" rx=\"70\" ry=\"65\" fill=\"url(#cm-threadlet-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"256\" cy=\"234\" rx=\"43\" ry=\"40\" fill=\"url(#cm-threadlet-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M208 245 Q166 224 141 260 L150 277\" fill=\"url(#cm-threadlet-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M208 274 Q166 253 141 289 L150 306\" fill=\"url(#cm-threadlet-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M208 303 Q166 282 141 318 L150 335\" fill=\"url(#cm-threadlet-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M208 332 Q166 311 141 347 L150 364\" fill=\"url(#cm-threadlet-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M304 245 Q346 224 371 260 L362 277\" fill=\"url(#cm-threadlet-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M304 274 Q346 253 371 289 L362 306\" fill=\"url(#cm-threadlet-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M304 303 Q346 282 371 318 L362 335\" fill=\"url(#cm-threadlet-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M304 332 Q346 311 371 347 L362 364\" fill=\"url(#cm-threadlet-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"312\" cy=\"200\" r=\"28\" fill=\"#f78c7e\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"312\" cy=\"200\" r=\"13\" fill=\"#57e8ff\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><path d=\"M221 207 L195 174 M290 207 L314 171\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><rect x=\"216\" y=\"321\" width=\"80\" height=\"35\" rx=\"8\" fill=\"url(#cm-threadlet-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M225 332 h60 M225 344 h40\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><ellipse cx=\"238.0\" cy=\"232.7\" rx=\"10.4\" ry=\"13.3\" fill=\"#f8ffff\"/><ellipse cx=\"274.0\" cy=\"232.7\" rx=\"10.4\" ry=\"13.3\" fill=\"#f8ffff\"/><ellipse cx=\"240.3\" cy=\"235\" rx=\"4.6\" ry=\"7.5\" fill=\"#11172b\"/><ellipse cx=\"276.3\" cy=\"235\" rx=\"4.6\" ry=\"7.5\" fill=\"#11172b\"/><circle cx=\"239.2\" cy=\"230.4\" r=\"2.3\" fill=\"#ffffff\"/><circle cx=\"275.1\" cy=\"230.4\" r=\"2.3\" fill=\"#ffffff\"/><path d=\"M245.0 251.2 Q256 261.1 267.0 251.2\" stroke=\"#ff65c9\" stroke-width=\"3.5\" fill=\"none\" stroke-linecap=\"round\"/><circle cx=\"325\" cy=\"200\" r=\"35\" fill=\"#10182d\" stroke=\"#f78c7e\" stroke-width=\"7\"/><circle cx=\"325\" cy=\"200\" r=\"17\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"6\"/><path d=\"M296 176 Q337 167 353 204 Q359 238 319 232\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"5\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#f78c7e\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#57e8ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#f78c7e\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "voidseraph": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-voidseraph-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#95f3e1\"/><stop offset=\".42\" stop-color=\"#4be2c4\"/><stop offset=\"1\" stop-color=\"#149991\"/></linearGradient><linearGradient id=\"cm-voidseraph-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#1d7ad7\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-voidseraph-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#57e8ff\"/><stop offset=\"1\" stop-color=\"#1d7ad7\"/></radialGradient><filter id=\"cm-voidseraph-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#57e8ff\" opacity=\".12\" filter=\"url(#cm-voidseraph-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M218 269 Q179 214 115 201 Q135 266 209 302Z\" fill=\"url(#cm-voidseraph-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M294 269 Q333 214 397 201 Q375 269 301 302Z\" fill=\"url(#cm-voidseraph-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M220 302 Q174 278 130 289 Q158 337 221 337Z\" fill=\"#f77ea0\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M292 302 Q338 278 382 289 Q354 337 291 337Z\" fill=\"#57e8ff\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M218 333 Q170 333 149 365 Q195 389 231 358Z\" fill=\"url(#cm-voidseraph-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M294 333 Q342 333 363 365 Q317 389 281 358Z\" fill=\"#f77ea0\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"256\" cy=\"298\" rx=\"53\" ry=\"67\" fill=\"url(#cm-voidseraph-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"227,249 213,213 246,233\" fill=\"url(#cm-voidseraph-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><polygon points=\"282,249 300,213 266,234\" fill=\"url(#cm-voidseraph-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M174 175 Q256 102 338 175\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"8\" stroke-linecap=\"round\"/><ellipse cx=\"238.3\" cy=\"285.7\" rx=\"10.3\" ry=\"13.1\" fill=\"#f8ffff\"/><ellipse cx=\"273.7\" cy=\"285.7\" rx=\"10.3\" ry=\"13.1\" fill=\"#f8ffff\"/><ellipse cx=\"240.6\" cy=\"288\" rx=\"4.6\" ry=\"7.4\" fill=\"#11172b\"/><ellipse cx=\"275.9\" cy=\"288\" rx=\"4.6\" ry=\"7.4\" fill=\"#11172b\"/><circle cx=\"239.5\" cy=\"283.4\" r=\"2.3\" fill=\"#ffffff\"/><circle cx=\"274.8\" cy=\"283.4\" r=\"2.3\" fill=\"#ffffff\"/><path d=\"M245.2 304.0 Q256 313.6 266.8 304.0\" stroke=\"#ff65c9\" stroke-width=\"3.4\" fill=\"none\" stroke-linecap=\"round\"/><path d=\"M155 217 L119 217 L119 184 L146 184 M357 217 L393 217 L393 184 L366 184 M155 279 L119 279 L119 312 L146 312 M357 279 L393 279 L393 312 L366 312\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"8\" stroke-linecap=\"round\"/><circle cx=\"256\" cy=\"120\" r=\"5\" fill=\"#f77ea0\"/><circle cx=\"128\" cy=\"300\" r=\"4\" fill=\"#57e8ff\"/><circle cx=\"385\" cy=\"300\" r=\"4\" fill=\"#f77ea0\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#f77ea0\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#57e8ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#f77ea0\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "zerooracle": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-zerooracle-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#aef395\"/><stop offset=\".42\" stop-color=\"#73e24b\"/><stop offset=\"1\" stop-color=\"#269914\"/></linearGradient><linearGradient id=\"cm-zerooracle-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#1dd76e\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-zerooracle-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#a8ff6e\"/><stop offset=\"1\" stop-color=\"#1dd76e\"/></radialGradient><filter id=\"cm-zerooracle-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#a8ff6e\" opacity=\".12\" filter=\"url(#cm-zerooracle-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#a8ff6e\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M168 340 Q123 292 152 226 L199 178 L222 211 L256 192 L291 211 L314 178 L360 226 Q389 296 344 340 L310 374 L201 374Z\" fill=\"url(#cm-zerooracle-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M195 232 Q158 248 178 298 Q205 319 231 292Z\" fill=\"url(#cm-zerooracle-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><path d=\"M317 232 Q354 248 334 298 Q307 319 281 292Z\" fill=\"url(#cm-zerooracle-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"204\" cy=\"269\" r=\"28\" fill=\"#10182d\" stroke=\"#a8ff6e\" stroke-width=\"7\"/><circle cx=\"208\" cy=\"270\" r=\"14\" fill=\"#f5fbff\"/><circle cx=\"211\" cy=\"271\" r=\"7\" fill=\"#cc7ef7\"/><circle cx=\"308\" cy=\"269\" r=\"28\" fill=\"#10182d\" stroke=\"#a8ff6e\" stroke-width=\"7\"/><circle cx=\"312\" cy=\"270\" r=\"14\" fill=\"#f5fbff\"/><circle cx=\"315\" cy=\"271\" r=\"7\" fill=\"#cc7ef7\"/><polygon points=\"240,299 272,299 256,324\" fill=\"#a8ff6e\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><circle cx=\"116\" cy=\"240\" r=\"8\" fill=\"#cc7ef7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"394\" cy=\"240\" r=\"8\" fill=\"#cc7ef7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><circle cx=\"256\" cy=\"138\" r=\"8\" fill=\"#cc7ef7\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><path d=\"M200.0 256.4 Q256 235.6 312.0 256.4\" fill=\"none\" stroke=\"#101629\" stroke-width=\"9.6\"/><circle cx=\"228.8\" cy=\"274\" r=\"22.4\" fill=\"#101629\" stroke=\"#a8ff6e\" stroke-width=\"5.6\"/><circle cx=\"283.2\" cy=\"274\" r=\"22.4\" fill=\"#101629\" stroke=\"#ff65c9\" stroke-width=\"5.6\"/><circle cx=\"228.8\" cy=\"274\" r=\"8.0\" fill=\"#f5ffff\"/><circle cx=\"283.2\" cy=\"274\" r=\"8.0\" fill=\"#f5ffff\"/><circle cx=\"230.4\" cy=\"274.8\" r=\"4.0\" fill=\"#101629\"/><circle cx=\"284.8\" cy=\"274.8\" r=\"4.0\" fill=\"#101629\"/><rect x=\"123\" y=\"174\" width=\"36\" height=\"49\" rx=\"5\" fill=\"#10182d\" stroke=\"#cc7ef7\" stroke-width=\"5\" transform=\"rotate(-13 141 192)\"/><circle cx=\"141\" cy=\"192\" r=\"5\" fill=\"#a8ff6e\"/><rect x=\"372\" y=\"183\" width=\"32\" height=\"45\" rx=\"5\" fill=\"#10182d\" stroke=\"#cc7ef7\" stroke-width=\"5\" transform=\"rotate(-13 388 199)\"/><circle cx=\"388\" cy=\"199\" r=\"5\" fill=\"#a8ff6e\"/><rect x=\"353\" y=\"137\" width=\"26\" height=\"39\" rx=\"5\" fill=\"#10182d\" stroke=\"#cc7ef7\" stroke-width=\"5\" transform=\"rotate(-13 366 150)\"/><circle cx=\"366\" cy=\"150\" r=\"5\" fill=\"#a8ff6e\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#a8ff6e\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#cc7ef7\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#a8ff6e\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#cc7ef7\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>",
      "zerowyrm": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"512\" height=\"512\" viewBox=\"0 0 512 512\"><defs><linearGradient id=\"cm-zerowyrm-body\" x1=\"0\" y1=\"0\" x2=\".8\" y2=\"1\"><stop offset=\"0\" stop-color=\"#95f3ce\"/><stop offset=\".42\" stop-color=\"#4be2a6\"/><stop offset=\"1\" stop-color=\"#149976\"/></linearGradient><linearGradient id=\"cm-zerowyrm-metal\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#f4fbff\"/><stop offset=\".38\" stop-color=\"#1da0d7\"/><stop offset=\"1\" stop-color=\"#222640\"/></linearGradient><radialGradient id=\"cm-zerowyrm-core\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\".36\" stop-color=\"#57e8ff\"/><stop offset=\"1\" stop-color=\"#1da0d7\"/></radialGradient><filter id=\"cm-zerowyrm-glow\" x=\"-70%\" y=\"-70%\" width=\"240%\" height=\"240%\"><feGaussianBlur stdDeviation=\"9\"/></filter></defs><ellipse cx=\"256\" cy=\"449\" rx=\"137\" ry=\"16\" fill=\"#030817\" opacity=\".55\"/><circle cx=\"256\" cy=\"281\" r=\"147\" fill=\"#57e8ff\" opacity=\".12\" filter=\"url(#cm-zerowyrm-glow)\"/><path d=\"M109 278 C97 221 152 135 256 135 C359 135 415 223 402 278\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"4\" stroke-dasharray=\"4 15\" opacity=\".45\"/><path d=\"M133 417 H176 M336 417 H379\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\" opacity=\".75\"/><path d=\"M156 309 C86 234 151 157 245 185 C344 202 417 283 358 346 C303 405 189 370 154 309 C128 266 171 224 222 243 C277 265 300 326 267 343\" fill=\"none\" stroke=\"#10172b\" stroke-width=\"54\" stroke-linecap=\"round\"/><path d=\"M156 309 C86 234 151 157 245 185 C344 202 417 283 358 346 C303 405 189 370 154 309 C128 266 171 224 222 243 C277 265 300 326 267 343\" fill=\"none\" stroke=\"url(#cm-zerowyrm-body)\" stroke-width=\"35\" stroke-linecap=\"round\"/><path d=\"M245 184 L230 144 L258 163 L283 136 L282 196\" fill=\"url(#cm-zerowyrm-metal)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><ellipse cx=\"272\" cy=\"335\" rx=\"36\" ry=\"28\" fill=\"url(#cm-zerowyrm-body)\" stroke=\"#10172b\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\"/><rect x=\"180\" y=\"220\" width=\"11\" height=\"8\" rx=\"2\" fill=\"#57e8ff\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"217\" y=\"198\" width=\"11\" height=\"8\" rx=\"2\" fill=\"#57e8ff\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"319\" y=\"224\" width=\"11\" height=\"8\" rx=\"2\" fill=\"#57e8ff\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"352\" y=\"285\" width=\"11\" height=\"8\" rx=\"2\" fill=\"#57e8ff\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><rect x=\"325\" y=\"336\" width=\"11\" height=\"8\" rx=\"2\" fill=\"#57e8ff\" stroke-width=\"12\" stroke-linejoin=\"round\" stroke-linecap=\"round\" stroke=\"none\"/><ellipse cx=\"263.5\" cy=\"332.0\" rx=\"9.0\" ry=\"11.5\" fill=\"#f8ffff\"/><ellipse cx=\"294.5\" cy=\"332.0\" rx=\"9.0\" ry=\"11.5\" fill=\"#f8ffff\"/><ellipse cx=\"265.5\" cy=\"334\" rx=\"4.0\" ry=\"6.5\" fill=\"#11172b\"/><ellipse cx=\"296.5\" cy=\"334\" rx=\"4.0\" ry=\"6.5\" fill=\"#11172b\"/><circle cx=\"264.5\" cy=\"330.0\" r=\"2.0\" fill=\"#ffffff\"/><circle cx=\"295.5\" cy=\"330.0\" r=\"2.0\" fill=\"#ffffff\"/><path d=\"M269.5 348.0 Q279 356.5 288.5 348.0\" stroke=\"#ff65c9\" stroke-width=\"3.0\" fill=\"none\" stroke-linecap=\"round\"/><circle cx=\"256\" cy=\"280\" r=\"85\" fill=\"none\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-dasharray=\"5 10\"/><rect x=\"324.0\" y=\"276.0\" width=\"8\" height=\"8\" rx=\"2\" fill=\"#f77eb8\"/><rect x=\"314.4\" y=\"312.0\" width=\"8\" height=\"8\" rx=\"2\" fill=\"#f77eb8\"/><rect x=\"288.0\" y=\"338.4\" width=\"8\" height=\"8\" rx=\"2\" fill=\"#f77eb8\"/><rect x=\"252.0\" y=\"348.0\" width=\"8\" height=\"8\" rx=\"2\" fill=\"#f77eb8\"/><rect x=\"216.0\" y=\"338.4\" width=\"8\" height=\"8\" rx=\"2\" fill=\"#f77eb8\"/><rect x=\"189.6\" y=\"312.0\" width=\"8\" height=\"8\" rx=\"2\" fill=\"#f77eb8\"/><rect x=\"180.0\" y=\"276.0\" width=\"8\" height=\"8\" rx=\"2\" fill=\"#f77eb8\"/><rect x=\"189.6\" y=\"240.0\" width=\"8\" height=\"8\" rx=\"2\" fill=\"#f77eb8\"/><rect x=\"216.0\" y=\"213.6\" width=\"8\" height=\"8\" rx=\"2\" fill=\"#f77eb8\"/><rect x=\"252.0\" y=\"204.0\" width=\"8\" height=\"8\" rx=\"2\" fill=\"#f77eb8\"/><rect x=\"288.0\" y=\"213.6\" width=\"8\" height=\"8\" rx=\"2\" fill=\"#f77eb8\"/><rect x=\"314.4\" y=\"240.0\" width=\"8\" height=\"8\" rx=\"2\" fill=\"#f77eb8\"/><circle cx=\"256\" cy=\"120\" r=\"5\" fill=\"#f77eb8\"/><circle cx=\"128\" cy=\"300\" r=\"4\" fill=\"#57e8ff\"/><circle cx=\"385\" cy=\"300\" r=\"4\" fill=\"#f77eb8\"/><path d=\"M132 303 l-15 8 M379 295 l15 -9\" stroke=\"#57e8ff\" stroke-width=\"5\" stroke-linecap=\"round\"/><circle cx=\"157\" cy=\"191\" r=\"4\" fill=\"#f77eb8\"/><circle cx=\"358\" cy=\"167\" r=\"5\" fill=\"#57e8ff\"/><rect x=\"370\" y=\"351\" width=\"9\" height=\"9\" rx=\"2\" fill=\"#f77eb8\"/><path d=\"M220 429 h72\" stroke=\"#ffffff\" stroke-opacity=\".75\" stroke-width=\"4\" stroke-linecap=\"round\"/></svg>"
    };
    // <<< generated-art

    // ── 1. ESKALATION (Spiegel des Host-Vertrags) ─────────────────
    // Bewusst dupliziert: Client- und Host-Bundle teilen keinen Code, und ein
    // Import quer ueber Pakete ist in diesem Repo nicht erlaubt. Die Probe
    // /tmp/codemon-sim.mjs vergleicht beide Seiten Zahl fuer Zahl, damit die
    // Dopplung nicht auseinanderlaeuft.
    const ESCALATION = { growthBps: 1200, perLevel: '+12 % der Basiswerte', label: 'linear je Stufe' };
    const POWER_UNIT = 10;
    const LEVEL_CAP = 50;
    const cappedLevel = (level) => {
      if (!Number.isFinite(level)) throw new TypeError('level muss endlich sein');
      return Math.min(LEVEL_CAP, Math.max(1, Math.floor(level)));
    };
    const powerAt = (base, level) => Math.floor((base * (10000 + ESCALATION.growthBps * (cappedLevel(level) - 1))) / 10000);
    const powerAtExact = (base, level) => BigInt(powerAt(base, level));
    const group = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const formatNumber = (value) => {
      if (typeof value === 'bigint') return group(value.toString());
      if (typeof value === 'string') {
        if (/^-?\d+$/.test(value)) return group(value);
        if (/^-?\d+(?:\.\d+)?e[+-]?\d+$/i.test(value) && Number.isFinite(Number(value))) {
          return group(BigInt(Math.round(Number(value))).toString());
        }
        return value;
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
      const rounded = Math.round(value);
      return Number.isSafeInteger(rounded) ? group(String(rounded)) : group(BigInt(rounded).toString());
    };
    const exactText = (value) => {
      if (typeof value === 'bigint') return value.toString();
      if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.round(value)).toString();
      return String(value);
    };
    const digitsOf = (value) => {
      if (typeof value === 'bigint') return String(value < 0n ? -value : value).length;
      if (!Number.isFinite(value)) return String(value).length;
      const whole = BigInt(Math.round(value));
      return String(whole < 0n ? -whole : whole).length;
    };
    const describeValue = (base, level) => {
      const exact = powerAtExact(base, level);
      return { exact, text: formatNumber(exact), digits: digitsOf(exact), safe: exact <= BigInt(Number.MAX_SAFE_INTEGER) };
    };
    const threshold = (level, xpBase = XP_BASE) => {
      if (!Number.isSafeInteger(xpBase) || xpBase < 1) throw new RangeError('xpBase muss positiv sein');
      const current = cappedLevel(level);
      return (xpBase * (current - 1) * current) / 2;
    };
    const levelFor = (xp, xpBase = XP_BASE) => {
      if (!Number.isFinite(xp) || xp < 0) throw new RangeError('XP muss endlich und nicht negativ sein');
      let level = 1;
      while (level < LEVEL_CAP && threshold(level + 1, xpBase) <= xp) level += 1;
      return level;
    };
    const statsAt = (speciesId, level) => {
      const base = SPECIES[speciesId] ?? SPECIES[SPECIES_IDS[0]];
      const capped = cappedLevel(level);
      return Object.fromEntries(['hp','atk','def','agi','int'].map((key) => [key, Math.floor((base[key] * (10000 + ESCALATION.growthBps * (capped - 1))) / 10000)]));
    };
    const statsAtExact = (speciesId, level) => Object.fromEntries(Object.entries(statsAt(speciesId, level)).map(([key, value]) => [key, BigInt(value)]));

    /** Meilensteine der Inszenierung: zweistellig bis Millionen. */
    const MILESTONES = [10, 100, 1000, 10000, 1000000];
    const milestoneFor = (before, after) => {
      let hit = null;
      for (const mark of MILESTONES) if (Number(before) < mark && Number(after) >= mark) hit = mark;
      return hit;
    };

    // ── 2. REGELWERK (feste Tabellen, je Faktor ein Nachschlagen) ─────────
    // >>> generated-codingmon-elements — source: assets/data/codingmon-50.json
    const ELEMENTS = {"spark":{"label":"Spark","beats":"byte","losesTo":"feral"},"byte":{"label":"Byte","beats":"feral","losesTo":"spark"},"feral":{"label":"Feral","beats":"spark","losesTo":"byte"}};
    const ELEMENT_WIN = 1.5;
    const ELEMENT_LOSS = 0.75;
    const ELEMENT_CHART = {"spark":{"spark":1,"byte":1.5,"feral":0.75},"byte":{"spark":0.75,"byte":1,"feral":1.5},"feral":{"spark":1.5,"byte":0.75,"feral":1}};
    // <<< generated-codingmon-elements
        const CATEGORY = {
      physisch: { label: 'physisch', defFactor: 0.8 },
      speziell: { label: 'speziell', defFactor: 0.35 },
    };
    const SYNERGY = {
      'spark:physisch': 1,
      'spark:speziell': 1.25,
      'byte:physisch': 1,
      'byte:speziell': 1.25,
      'feral:physisch': 1,
      'feral:speziell': 1.25,
    };
    /** Vererbungsbaum: Ahn, Generation und die geerbte Faehigkeit je Linie. */
    // >>> generated-codingmon-lineage — source: assets/data/codingmon-50.json
    const LINEAGE = {"nullpointer":{"ancestor":null,"depth":1,"generation":1,"inherits":[]},"stackoverflow":{"ancestor":null,"depth":1,"generation":1,"inherits":[]},"memoryleak":{"ancestor":null,"depth":1,"generation":1,"inherits":[]},"racecondition":{"ancestor":"nullpointer","depth":2,"generation":2,"inherits":["null-access"]},"deadlock":{"ancestor":"stackoverflow","depth":2,"generation":2,"inherits":["trace-back"]},"segfault":{"ancestor":"memoryleak","depth":2,"generation":2,"inherits":["heap-flood"]},"offbyone":{"ancestor":"racecondition","depth":3,"generation":3,"inherits":["torn-read"]},"bufferoverflow":{"ancestor":"segfault","depth":3,"generation":3,"inherits":["core-dump"]},"heisenbug":{"ancestor":"deadlock","depth":3,"generation":3,"inherits":["starve"]},"recursion":{"ancestor":"offbyone","depth":4,"generation":4,"inherits":["boundary-slip"]},"nullprism":{"ancestor":"nullpointer","depth":2,"generation":2,"inherits":["null-access"]},"derefang":{"ancestor":"nullprism","depth":3,"generation":3,"inherits":["nullprism-surge"]},"voidseraph":{"ancestor":"derefang","depth":4,"generation":4,"inherits":["derefang-surge"]},"zerooracle":{"ancestor":"voidseraph","depth":5,"generation":5,"inherits":["voidseraph-surge"]},"stackwisp":{"ancestor":"stackoverflow","depth":2,"generation":2,"inherits":["trace-back"]},"callstacker":{"ancestor":"stackwisp","depth":3,"generation":3,"inherits":["stackwisp-surge"]},"overflowarchon":{"ancestor":"callstacker","depth":4,"generation":4,"inherits":["callstacker-surge"]},"stacktitan":{"ancestor":"overflowarchon","depth":5,"generation":5,"inherits":["overflowarchon-surge"]},"cachewraith":{"ancestor":"memoryleak","depth":2,"generation":2,"inherits":["heap-flood"]},"heapgolem":{"ancestor":"cachewraith","depth":3,"generation":3,"inherits":["cachewraith-surge"]},"leakhydra":{"ancestor":"heapgolem","depth":4,"generation":4,"inherits":["heapgolem-surge"]},"memoryphoenix":{"ancestor":"leakhydra","depth":5,"generation":5,"inherits":["leakhydra-surge"]},"threadlet":{"ancestor":"racecondition","depth":3,"generation":3,"inherits":["torn-read"]},"raceweaver":{"ancestor":"threadlet","depth":4,"generation":4,"inherits":["threadlet-surge"]},"temporlock":{"ancestor":"raceweaver","depth":5,"generation":5,"inherits":["raceweaver-surge"]},"quantumracer":{"ancestor":"temporlock","depth":6,"generation":6,"inherits":["temporlock-surge"]},"mutexling":{"ancestor":"deadlock","depth":3,"generation":3,"inherits":["starve"]},"lockwarden":{"ancestor":"mutexling","depth":4,"generation":4,"inherits":["mutexling-surge"]},"stalemateon":{"ancestor":"lockwarden","depth":5,"generation":5,"inherits":["lockwarden-surge"]},"foreverwait":{"ancestor":"stalemateon","depth":6,"generation":6,"inherits":["stalemateon-surge"]},"faultling":{"ancestor":"segfault","depth":3,"generation":3,"inherits":["core-dump"]},"coremaw":{"ancestor":"faultling","depth":4,"generation":4,"inherits":["faultling-surge"]},"coredrake":{"ancestor":"coremaw","depth":5,"generation":5,"inherits":["coremaw-surge"]},"crashcolossus":{"ancestor":"coredrake","depth":6,"generation":6,"inherits":["coredrake-surge"]},"indeximp":{"ancestor":"offbyone","depth":4,"generation":4,"inherits":["boundary-slip"]},"boundarybeast":{"ancestor":"indeximp","depth":5,"generation":5,"inherits":["indeximp-surge"]},"indexeater":{"ancestor":"boundarybeast","depth":6,"generation":6,"inherits":["boundarybeast-surge"]},"zerowyrm":{"ancestor":"indexeater","depth":7,"generation":7,"inherits":["indexeater-surge"]},"bufferbug":{"ancestor":"bufferoverflow","depth":4,"generation":4,"inherits":["stack-smash"]},"overflowhorn":{"ancestor":"bufferbug","depth":5,"generation":5,"inherits":["bufferbug-surge"]},"stackravager":{"ancestor":"overflowhorn","depth":6,"generation":6,"inherits":["overflowhorn-surge"]},"bufferbehemoth":{"ancestor":"stackravager","depth":7,"generation":7,"inherits":["stackravager-surge"]},"phantomtrace":{"ancestor":"heisenbug","depth":4,"generation":4,"inherits":["observation-collapse"]},"observoid":{"ancestor":"phantomtrace","depth":5,"generation":5,"inherits":["phantomtrace-surge"]},"heisenwisp":{"ancestor":"observoid","depth":6,"generation":6,"inherits":["observoid-surge"]},"quantumdebug":{"ancestor":"heisenwisp","depth":7,"generation":7,"inherits":["heisenwisp-surge"]},"basecase":{"ancestor":"recursion","depth":5,"generation":5,"inherits":["infinite-descent"]},"callwyrm":{"ancestor":"basecase","depth":6,"generation":6,"inherits":["basecase-surge"]},"recursaur":{"ancestor":"callwyrm","depth":7,"generation":7,"inherits":["callwyrm-surge"]},"infiniteancestor":{"ancestor":"recursaur","depth":8,"generation":8,"inherits":["recursaur-surge"]}};
    // <<< generated-codingmon-lineage
        const NEUTRAL_BUFF = { id: 'neutral', label: 'kein Buff', factor: 1 };
    // >>> generated-codingmon-buffs — source: assets/data/codingmon-50.json
    const BUFFS = [{"id":"linie","label":"Reine Linie","factor":1.1,"test":"inherited"},{"id":"nichts-zu-verlieren","label":"Nichts zu verlieren","factor":1.5,"test":"low-hp"},{"id":"uebertaktet","label":"Uebertaktet","factor":1.15,"test":"full-hp"}];
    // <<< generated-codingmon-buffs
        const BUFF_TESTS = {
      inherited: (ability, attacker) => attacker.inherited.includes(ability.id),
      'low-hp': (ability, attacker) => attacker.hp / Math.max(1, attacker.maxHp) < 0.25,
      'full-hp': (ability, attacker) => attacker.hp / Math.max(1, attacker.maxHp) >= 0.9,
    };
    const buffFor = (ability, attacker) => {
      for (const buff of BUFFS) {
        const test = BUFF_TESTS[buff.test];
        if (typeof test === 'function' && test(ability, attacker)) return buff;
      }
      return NEUTRAL_BUFF;
    };
    const inheritedAbilities = (speciesId) => (LINEAGE[speciesId] ?? LINEAGE[SPECIES_IDS[0]]).inherits ?? [];

    // ── Reine Funktionen (Spiegel des Host-Vertrags) ─────────────────────────
    const speciesOfFamily = (family) => SPECIES_IDS.find((id) => SPECIES[id].family === family) ?? SPECIES_IDS[0];
    const abilitiesFor = (level, speciesId) => {
      const inherited = inheritedAbilities(speciesId);
      return ABILITIES.filter((ability) => ability.minLevel <= level
        && (ability.species === null || ability.species === speciesId || inherited.includes(ability.id)));
    };
    const formOf = (level) => STAGES[stageIndex(level)];

    /**
     * Der Schaden: BaseDamage * Element * Synergie * Buff - DEF * Durchgriff.
     * Fuenf Nachschlagevorgaenge, ein Minimum von 1, keine Zufallszahl.
     */
    const resolveAttack = (ability, attacker, defender) => {
      const category = CATEGORY[ability.kind] ?? CATEGORY.physisch;
      const element = (ELEMENT_CHART[attacker.element] ?? ELEMENT_CHART.spark)[defender.element] ?? 1;
      const synergy = SYNERGY[`${attacker.element}:${ability.kind}`] ?? 1;
      const buff = buffFor(ability, attacker);
      const base = (ability.power * (attacker.stats[ability.stat] ?? 0)) / POWER_UNIT;
      const dealt = Math.max(1, Math.round(base * element * synergy * buff.factor - defender.stats.def * category.defFactor));
      return { base, element, synergy, category: ability.kind, defFactor: category.defFactor, buff, dealt };
    };
    /** Kurzform: nur der Betrag. */
    const damageOf = (ability, attacker, defender) => resolveAttack(ability, attacker, defender).dealt;
    /** XP fuer einen Sieg. Waechst mit dem Level des Gegners — multiplikativ. */
    const rewardFor = (level) => powerAt(20, Math.min(LEVEL_CAP, Math.max(1, Math.floor(level) + 1)));
    const firstStrike = (challengerStats, enemyStats) => (challengerStats.agi >= enemyStats.agi ? 'challenger' : 'enemy');
    const arenaFor = (level, round) => {
      const lvl = Math.max(1, Math.floor(level));
      const rnd = Math.max(0, Math.floor(round));
      const speciesId = SPECIES_IDS[(lvl * 3 + rnd * 7) % SPECIES_IDS.length];
      const enemyLevel = Math.min(LEVEL_CAP, Math.max(1, lvl + ((rnd % 3) - 1)));
      return { speciesId, element: SPECIES[speciesId].family, level: enemyLevel, stats: statsAt(speciesId, enemyLevel), reward: rewardFor(enemyLevel) };
    };
    /** Die staerkste Faehigkeit eines Gegners. Determinismus statt Wuerfel. */
    const bestMove = (level, speciesId) =>
      abilitiesFor(level, speciesId).slice().sort((a, b) => b.power - a.power)[0] ?? ABILITIES[0];

    // ── SPAWN (Spiegel von assets/mechanik.js: SPAWN_EVERY/spawnFor/effectiveness)
    // Bewusst dupliziert wie der Rest dieses Vertrags (siehe Abschnitt 1): das
    // Bundle teilt keinen Code mit `assets/`. `durchstich.test.mjs` vergleicht
    // beide Seiten Zahl fuer Zahl, damit die Dopplung nicht auseinanderlaeuft.
    // Der Host meldet erfolgreiche Completions ueber readActivity; der Client
    // faltet den absoluten Zaehler rein. `localSteps` ist die zuletzt
    // konsumierte Completion-Zahl und macht den Spawn idempotent.
    const SPAWN_EVERY = 3;
    const spawnFor = (completions, level) => {
      const done = Math.max(0, Math.floor(completions ?? 0));
      if (done <= 0 || done % SPAWN_EVERY !== 0) return null;
      const lvl = Math.max(1, Math.floor(level ?? 1));
      const speciesId = SPECIES_IDS[(done * 7 + 3) % SPECIES_IDS.length];
      return { speciesId, element: SPECIES[speciesId].family, level: Math.min(LEVEL_CAP, Math.max(1, lvl + ((done % 3) - 1))) };
    };
    /**
     * Die Typwirkung als Zeichen statt Tabelle: dieselbe Zahl wie
     * `resolveAttack` nachschlaegt, mit Symbol (`x1,5` + Pfeil). Die
     * Kampfansicht zeigt das, keine Matrix.
     */
    const effectiveness = (attackerElement, defenderElement) => {
      const factor = (ELEMENT_CHART[attackerElement] ?? ELEMENT_CHART.spark)[defenderElement] ?? 1;
      return { factor, symbol: factor > 1 ? '▲' : factor < 1 ? '▼' : '●' };
    };

    // ── 3. PACING (kuenstliche Rundendauer) ─────────────────────────────────
    const PACING = { delayMs: 3000, lockedText: 'Codermon ist im Kampf, warte auf das Ergebnis' };
    /**
     * Die Dauer, mit der dieser Client rechnet. Sie ist ein SPIEGEL des
     * Vertragswerts: der Host liest die effektive Zahl aus der Profil-Ebene,
     * und die kann der Browser nicht lesen. Eine Abweichung waere still —
     * deshalb steht der Spiegel hier sichtbar an genau einer Stelle.
     */
    const roundDelayMs = PACING.delayMs;

    // ── Encounter-Kern (S5) — EINE Quelle: assets/encounter.js ───────────────
    // Das Bundle ist selbststaendig und kann `assets/` nicht importieren; der
    // Kern wird deshalb WOERTLICH eingebettet (Kommentare gestrichen), nicht
    // nachgebaut. Schreiben: `node scripts/assets/build-encounter-client.mjs`,
    // pruefen: derselbe Aufruf mit `--check` — der Test
    // `test/encounter-client.test.mjs` vergleicht Block und Verhalten.
    // >>> generated-encounter-core — source: assets/encounter.js
    const ENCOUNTER_CORE = (() => {
      const ENCOUNTER_CONTRACT = 'shinon.encounter/event-v1';

      const ENCOUNTER_STATES = Object.freeze([
        'closed',
        'preflight',
        'running',
        'validating',
        'completed',
        'rejected',
        'aborted',
        'recoverable-error',
        'compact',
      ]);

      const ENCOUNTER_TERMINAL_STATES = Object.freeze([
        'completed',
        'rejected',
        'aborted',
        'recoverable-error',
      ]);

      const ENCOUNTER_EVENT_MEMORY = 64;

      const ENCOUNTER_SOURCE_KINDS = Object.freeze(['spine', 'internal', 'unavailable']);

      const isAllowedValue = (value) => value === null
        || typeof value === 'string'
        || typeof value === 'number'
        || typeof value === 'boolean'
        || (Array.isArray(value) && value.every((entry) => typeof entry === 'string'));

      const registry = {};
      const define = (type, definition) => {
        registry[type] = Object.freeze(definition);
      };

      define('encounter.turn.started', {
        from: ['closed'],
        to: 'preflight',
        source: { kind: 'spine', ref: 'turn.start', owner: '@shinon/events' },
        payload: [],
        apply: (state) => state,
      });

      define('encounter.task.classified', {
        from: ['preflight'],
        to: null,
        source: { kind: 'internal', ref: 'goal-policy', owner: '@shinon/task-router' },
        payload: ['taskClass', 'taskLabel'],
        apply: (state, payload) => ({
          ...state,
          task: { taskClass: payload.taskClass ?? null, taskLabel: payload.taskLabel ?? null },
        }),
      });

      define('encounter.index.progress', {
        from: ['preflight', 'running'],
        to: null,
        source: { kind: 'internal', ref: 'index-query', owner: '@shinon/project-index' },
        payload: ['phase', 'count'],
        apply: (state, payload) => ({
          ...state,
          index: {
            phase: typeof payload.phase === 'string' ? payload.phase : state.index.phase,
            count: Number.isSafeInteger(payload.count) ? payload.count : state.index.count,
          },
        }),
      });

      define('encounter.fact.validated', {
        from: ['preflight', 'running'],
        to: null,
        source: { kind: 'internal', ref: 'facts-snapshot', owner: '@shinon/project-index' },
        payload: ['snapshotId', 'valid', 'untrusted', 'unknown'],
        apply: (state, payload) => ({
          ...state,
          facts: {
            snapshotId: typeof payload.snapshotId === 'string' ? payload.snapshotId : state.facts.snapshotId,
            valid: Number.isSafeInteger(payload.valid) ? payload.valid : state.facts.valid,
            untrusted: Number.isSafeInteger(payload.untrusted) ? payload.untrusted : state.facts.untrusted,
            unknown: Number.isSafeInteger(payload.unknown) ? payload.unknown : state.facts.unknown,
          },
        }),
      });

      define('encounter.block.selected', {
        from: ['preflight'],
        to: null,
        source: { kind: 'internal', ref: 'block-select', owner: '@shinon/prompter' },
        payload: ['blocks'],
        apply: (state, payload) => ({
          ...state,
          preflight: { ...state.preflight, blocks: Array.isArray(payload.blocks) ? payload.blocks.slice() : state.preflight.blocks },
        }),
      });

      define('encounter.preflight.ready', {
        from: ['preflight'],
        to: null,
        source: { kind: 'internal', ref: 'pre-step', owner: '@shinon/prompter' },
        payload: [],
        apply: (state) => ({ ...state, preflight: { ...state.preflight, ready: true } }),
      });

      define('encounter.route.selected', {
        from: ['preflight', 'running'],
        to: null,
        source: { kind: 'spine', ref: 'request.header', owner: '@shinon/events' },
        payload: ['provider', 'model'],
        apply: (state, payload) => ({
          ...state,
          preflight: {
            ...state.preflight,
            route: {
              provider: typeof payload.provider === 'string' ? payload.provider : null,
              model: typeof payload.model === 'string' ? payload.model : null,
            },
          },
        }),
      });

      define('encounter.run.started', {
        from: ['preflight'],
        to: 'running',
        source: { kind: 'spine', ref: 'step.start', owner: '@shinon/events' },
        payload: ['step'],
        apply: (state, payload) => ({
          ...state,
          step: Number.isSafeInteger(payload.step) ? payload.step : state.step,
        }),
      });

      define('encounter.tool.started', {
        from: ['running'],
        to: null,
        source: { kind: 'spine', ref: 'tool.requested', owner: '@shinon/events' },
        payload: ['callId', 'name'],
        apply: (state, payload) => ({
          ...state,
          tools: {
            open: state.tools.open + 1,
            calls: state.tools.calls + 1,
            last: typeof payload.name === 'string' ? payload.name : state.tools.last,
          },
        }),
      });

      define('encounter.tool.completed', {
        from: ['running'],
        to: null,
        source: { kind: 'spine', ref: 'tool.completed', owner: '@shinon/events' },
        payload: ['callId', 'ok'],
        apply: (state) => ({
          ...state,
          tools: { ...state.tools, open: Math.max(0, state.tools.open - 1) },
        }),
      });

      define('encounter.key.rotated', {
        from: ['running', 'recoverable-error'],
        to: null,
        source: { kind: 'internal', ref: 'rotation', owner: '@shinon/key-router' },
        payload: ['reason'],
        apply: (state, payload) => ({
          ...state,
          keyRotation: {
            count: state.keyRotation.count + 1,
            reason: typeof payload.reason === 'string' ? payload.reason : state.keyRotation.reason,
          },
        }),
      });

      define('encounter.answer.received', {
        from: ['running'],
        to: 'validating',
        source: { kind: 'spine', ref: 'message.completed', owner: '@shinon/events' },
        payload: [],
        apply: (state) => state,
      });

      define('encounter.result-contract.passed', {
        from: ['running', 'validating'],
        to: 'validating',
        source: { kind: 'internal', ref: 'result-contract', owner: '@shinon/prompter' },
        payload: ['contract'],
        apply: (state, payload) => ({
          ...state,
          outcome: { kind: 'contract-passed', contract: typeof payload.contract === 'string' ? payload.contract : null, reason: null },
        }),
      });

      define('encounter.result-contract.failed', {
        from: ['running', 'validating'],
        to: 'rejected',
        source: { kind: 'internal', ref: 'result-contract', owner: '@shinon/prompter' },
        payload: ['reason'],
        apply: (state, payload) => ({
          ...state,
          outcome: { kind: 'contract-failed', contract: null, reason: typeof payload.reason === 'string' ? payload.reason : null },
        }),
      });

      define('encounter.abort', {
        from: ['preflight', 'running', 'validating'],
        to: 'aborted',
        source: { kind: 'internal', ref: 'abort-core', owner: '@shinon/prompter' },
        payload: ['reason'],
        apply: (state, payload) => ({
          ...state,
          outcome: { kind: 'aborted', contract: null, reason: typeof payload.reason === 'string' ? payload.reason : null },
        }),
      });

      define('encounter.turn.completed', {
        from: ['running', 'validating'],
        to: 'completed',
        source: { kind: 'spine', ref: 'turn.end', owner: '@shinon/events' },
        payload: ['reason'],
        apply: (state) => ({
          ...state,
          outcome: state.outcome ?? { kind: 'neutral', contract: null, reason: null },
        }),
      });

      define('encounter.turn.failed', {
        from: ['running', 'validating'],
        to: 'recoverable-error',
        source: { kind: 'spine', ref: 'turn.end', owner: '@shinon/events' },
        payload: ['reason'],
        apply: (state, payload) => ({
          ...state,
          outcome: { kind: 'error', contract: null, reason: typeof payload.reason === 'string' ? payload.reason : null },
        }),
      });

      define('encounter.salvage.available', {
        from: ['running', 'validating', 'recoverable-error'],
        to: null,
        source: { kind: 'internal', ref: 'salvage-store', owner: '@shinon/prompter' },
        payload: ['recordId'],
        apply: (state, payload) => ({
          ...state,
          salvage: { recordId: typeof payload.recordId === 'string' ? payload.recordId : null },
        }),
      });

      define('encounter.skill.proposed', {
        from: ['running', 'validating', 'completed'],
        to: null,
        source: { kind: 'internal', ref: 'skill-lifecycle', owner: '@shinon/prompter' },
        payload: ['skillId', 'status'],
        apply: (state, payload) => ({
          ...state,
          skill: {
            skillId: typeof payload.skillId === 'string' ? payload.skillId : null,
            status: 'proposed',
          },
        }),
      });

      define('encounter.receipt.compacted', {
        from: ENCOUNTER_TERMINAL_STATES,
        to: 'compact',
        source: { kind: 'internal', ref: 'receipt', owner: '@shinon/popup' },
        payload: [],
        apply: (state) => state,
      });

      const ENCOUNTER_EVENTS = Object.freeze(registry);

      const ENCOUNTER_SOURCE_MAP = Object.freeze(Object.fromEntries(
        Object.entries(ENCOUNTER_EVENTS).map(([type, definition]) => [type, Object.freeze({ ...definition.source })]),
      ));

      const ENCOUNTER_EVENT_TYPES = Object.freeze(Object.keys(ENCOUNTER_EVENTS));

      const stateIssues = (state) => {
        if (state === null || typeof state !== 'object' || Array.isArray(state)) return 'STATE_NOT_OBJECT';
        if (state.contract !== ENCOUNTER_CONTRACT) return 'STATE_CONTRACT';
        if (!ENCOUNTER_STATES.includes(state.status)) return 'STATE_STATUS';
        if (state.lastPhase !== undefined && state.lastPhase !== null
          && !ENCOUNTER_STATES.includes(state.lastPhase)) return 'STATE_LAST_PHASE';
        if (!Array.isArray(state.seen)) return 'STATE_SEEN';
        for (const key of ['preflight', 'facts', 'index', 'tools', 'keyRotation']) {
          if (state[key] === null || typeof state[key] !== 'object' || Array.isArray(state[key])) return `STATE_SHAPE:${key}`;
        }
        if (!Array.isArray(state.preflight.blocks)) return 'STATE_SHAPE:preflight.blocks';
        if (!Number.isSafeInteger(state.applied) || !Number.isSafeInteger(state.step)) return 'STATE_SHAPE:counter';
        return null;
      };

      const eventIssues = (event) => {
        if (event === null || typeof event !== 'object' || Array.isArray(event)) return 'EVENT_NOT_OBJECT';
        if (event.contract !== ENCOUNTER_CONTRACT) return 'EVENT_CONTRACT';
        for (const field of ['eventId', 'type', 'sessionId', 'turnId', 'source']) {
          if (typeof event[field] !== 'string' || event[field].trim() === '') return `EVENT_FIELD:${field}`;
        }
        const definition = ENCOUNTER_EVENTS[event.type];
        if (definition === undefined) return 'UNKNOWN_EVENT_TYPE';
        if (definition.source.owner !== event.source) return `SOURCE_MISMATCH:${event.type}`;
        const payload = event.payload;
        if (payload !== undefined && (payload === null || typeof payload !== 'object' || Array.isArray(payload))) return 'PAYLOAD_NOT_OBJECT';
        for (const key of Object.keys(payload ?? {})) {
          if (!definition.payload.includes(key)) return `PAYLOAD_UNKNOWN_FIELD:${key}`;
          if (!isAllowedValue(payload[key])) return `PAYLOAD_UNSUPPORTED_VALUE:${key}`;
        }
        return null;
      };

      const result = (state, outcome, reason = null) => ({ state, outcome, reason });

      function reduceEncounter(state, event) {
        const brokenState = stateIssues(state);
        if (brokenState !== null) return result(state, 'REJECTED', brokenState);

        const brokenEvent = eventIssues(event);
        if (brokenEvent === 'UNKNOWN_EVENT_TYPE') return result(state, 'IGNORED', brokenEvent);
        if (brokenEvent !== null) return result(state, 'REJECTED', brokenEvent);

        if (state.seen.includes(event.eventId)) return result(state, 'IGNORED', 'DUPLICATE_EVENT');
        if (state.turnId !== null && state.turnId !== event.turnId) return result(state, 'REJECTED', 'FOREIGN_TURN');

        const definition = ENCOUNTER_EVENTS[event.type];
        if (!definition.from.includes(state.status)) return result(state, 'REJECTED', 'INVALID_TRANSITION');

        const nextStatus = definition.to ?? state.status;
        const base = {
          ...state,
          status: nextStatus,
          lastPhase: nextStatus === state.status ? state.lastPhase : state.status,
          turnId: event.turnId,
          sessionId: event.sessionId,
          applied: state.applied + 1,
        };
        const applied = definition.apply(base, event.payload ?? {});
        const seen = [...state.seen, event.eventId];
        return result(
          { ...applied, seen: seen.length > ENCOUNTER_EVENT_MEMORY ? seen.slice(seen.length - ENCOUNTER_EVENT_MEMORY) : seen },
          'APPLIED',
        );
      }

      function createEncounterState() {
        return {
          contract: ENCOUNTER_CONTRACT,
          status: 'closed',
          lastPhase: null,
          turnId: null,
          sessionId: null,
          applied: 0,
          step: 0,
          seen: [],
          task: null,
          preflight: { ready: false, blocks: [], route: null },
          facts: { snapshotId: null, valid: 0, untrusted: 0, unknown: 0 },
          index: { phase: null, count: 0 },
          tools: { calls: 0, open: 0, last: null },
          keyRotation: { count: 0, reason: null },
          salvage: null,
          skill: null,
          outcome: null,
        };
      }

      function foldEncounter(state, events) {
        const journal = [];
        let current = state;
        for (const event of Array.isArray(events) ? events : []) {
          const step = reduceEncounter(current, event);
          journal.push({ type: typeof event?.type === 'string' ? event.type : null, outcome: step.outcome, reason: step.reason });
          current = step.state;
        }
        return { state: current, journal };
      }

      function encounterEvent(type, { eventId, turnId, sessionId, payload, source } = {}) {
        const definition = ENCOUNTER_EVENTS[type];
        if (definition === undefined) throw new Error(`Unbekannter Encounter-Typ: ${type}`);
        return {
          contract: ENCOUNTER_CONTRACT,
          eventId: eventId ?? `${type}#1`,
          type,
          sessionId: sessionId ?? 'session-test',
          turnId: turnId ?? 'turn-test',
          source: source ?? definition.source.owner,
          payload: payload ?? {},
        };
      }
      return Object.freeze({ ENCOUNTER_CONTRACT, ENCOUNTER_STATES, ENCOUNTER_TERMINAL_STATES, ENCOUNTER_EVENT_MEMORY, ENCOUNTER_SOURCE_KINDS, ENCOUNTER_EVENTS, ENCOUNTER_SOURCE_MAP, ENCOUNTER_EVENT_TYPES, createEncounterState, reduceEncounter, foldEncounter, encounterEvent });
    })();
    // Gebunden wird nur, was die Buehne liest — der Kern bleibt vollstaendig.
    const { ENCOUNTER_CONTRACT, ENCOUNTER_EVENTS, ENCOUNTER_EVENT_TYPES, ENCOUNTER_SOURCE_MAP, ENCOUNTER_STATES, ENCOUNTER_TERMINAL_STATES, createEncounterState, reduceEncounter, encounterEvent } = ENCOUNTER_CORE;
    // <<< generated-encounter-core

    // ── 4. LOOT (gewichteter Wurf in Basispunkten) ──────────────────────────
    // >>> generated-codingmon-loot — source: assets/data/codingmon-50.json
    const LOOT_TABLE = [{"id":"schrott","label":"Schrott","weight":8500,"xp":0},{"id":"brauchbar","label":"Brauchbares Teil","weight":1400,"xp":25},{"id":"shiny","label":"Shiny God-Tier","weight":100,"xp":2500}];
    const LOOT_TOTAL = LOOT_TABLE.reduce((sum, entry) => sum + entry.weight, 0);
    // <<< generated-codingmon-loot
        /**
     * Der Wurf: `uniform` aus [0,1) gegen die kumulierten Gewichte. Rein.
     * Dieselbe Sperrklinke wie in index.js: ein nicht endlicher Wert wird als 0
     * gelesen, damit ein kaputter Eingabewert nicht die seltenste Stufe gewinnt.
     */
    const rollLoot = (uniform) => {
      const clamped = Number.isFinite(uniform) ? Math.min(1, Math.max(0, uniform)) : 0;
      const point = Math.min(LOOT_TOTAL - 1, Math.floor(clamped * LOOT_TOTAL));
      let acc = 0;
      for (const entry of LOOT_TABLE) {
        acc += entry.weight;
        if (point < acc) return entry;
      }
      return LOOT_TABLE[LOOT_TABLE.length - 1];
    };
    const lootOdds = (entry) => Number(((entry.weight / LOOT_TOTAL) * 100).toFixed(2));

    // ── Store ───────────────────────────────────────────────────────────────
    const listeners = new Set();
    /**
     * Jede Aenderung erreicht zwei Empfaenger: die Abonnenten in diesem Bundle
     * (Panel, Marke, EXP-Leiste) und — als DOM-Ereignis — fremde Panels, die
     * den Zustand nur kennen, nicht besitzen (@shinon/dashboard). Die XP-Leiste
     * dort muss nicht pollen, um aktuell zu sein.
     */
    const emit = () => {
      if (mutationBatchDepth > 0) { pendingRender = true; return; }
      for (const fn of listeners) { try { fn(); } catch { /* ein Abnehmer darf den Rest nicht kippen */ } }
      window.dispatchEvent(new CustomEvent('shinon:exp', { detail: { xp: store.xp, level: level() } }));
    };
    const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
    const useStore = () => {
      const [, bump] = React.useState(0);
      React.useEffect(() => subscribe(() => bump((n) => n + 1)), []);
      return store;
    };

    // ── Persisted breeding state v3 (client mirror of assets/zucht*.js) ────
    const BREEDING_VERSION = 3;
    const BXP_FOUNDER = 50;
    const BXP_CHILD = 0;
    const BXP_NEUTRAL = 50;
    const BXP_BPS_PER_POINT = 40;
    const MOD_CAP_BPS = 3000;
    const GEN_STATMOD_CAP_BPS = 1500;
    const LOOTLUCK_CAP_BPS = 5000;
    const PAIR_GAIN = 10;
    const HATCH_GAIN = 20;
    const BP_PER_COMPLETION = 10;
    const HATCH_BP = 120;
    const BREEDING_EFFECTS = new Set(['statMod', 'hatchPoints', 'lootLuck']);
    const BREEDING_POOLS = {
      cycle: [
        { slots: 2, baseChanceBps: 1500, entries: [
          { id: 'tune-a', effect: 'statMod', value: 300, weight: 3 },
          { id: 'warm-a', effect: 'hatchPoints', value: 10, weight: 2 },
          { id: 'nose-a', effect: 'lootLuck', value: 1000, weight: 2 },
        ]},
        { slots: 2, baseChanceBps: 1200, entries: [
          { id: 'tune-b', effect: 'statMod', value: 400, weight: 3 },
          { id: 'warm-b', effect: 'hatchPoints', value: 15, weight: 2 },
          { id: 'nose-b', effect: 'lootLuck', value: 1500, weight: 2 },
        ]},
        { slots: 2, baseChanceBps: 1000, entries: [
          { id: 'tune-c', effect: 'statMod', value: 500, weight: 2 },
          { id: 'warm-c', effect: 'hatchPoints', value: 20, weight: 1 },
          { id: 'nose-c', effect: 'lootLuck', value: 2000, weight: 2 },
        ]},
      ],
      scaleFromGen: 7,
      scaleStepBps: 200,
      scaleCapBps: 20000,
    };
    const fnv1a32 = (text) => {
      let hash = 0x811c9dc5;
      for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
      }
      return hash >>> 0;
    };
    function breedingStream(key) {
      const seed = fnv1a32(key);
      let a = seed, b = seed ^ 0x9e3779b9, c = seed ^ 0x85ebca6b, d = seed ^ 0xc2b2ae35;
      const next = () => {
        a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
        const t = (a + b) | 0;
        a = b ^ (b >>> 9);
        b = (c + (c << 3)) | 0;
        c = (c << 21) | (c >>> 11);
        d = (d + 1) | 0;
        const value = (t + d) | 0;
        c = (c + value) | 0;
        return value >>> 0;
      };
      for (let i = 0; i < 12; i += 1) next();
      return next;
    }
    function breedingRandInt(next, limit) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 0x100000000) throw new RangeError('Zuchtzufall: ungültige Grenze');
      const cutoff = Math.floor(0x100000000 / limit) * limit;
      for (;;) {
        const value = next();
        if (!Number.isInteger(value) || value < 0 || value >= 0x100000000) throw new TypeError('Zuchtzufall: ungültiger uint32-Wert');
        if (value < cutoff) return value % limit;
      }
    }
    function breedingWeightedPick(next, entries) {
      if (!Array.isArray(entries) || entries.length === 0) throw new Error('Zuchtzufall: leerer Pool');
      const total = entries.reduce((sum, entry) => {
        if (!Number.isSafeInteger(entry.weight) || entry.weight <= 0) throw new Error('Zuchtzufall: ungültiges Gewicht');
        return sum + entry.weight;
      }, 0);
      if (!Number.isSafeInteger(total) || total > 0x100000000) throw new RangeError('Zuchtzufall: Gewichtssumme außerhalb uint32');
      let cursor = breedingRandInt(next, total);
      for (const entry of entries) {
        if (cursor < entry.weight) return entry;
        cursor -= entry.weight;
      }
      throw new Error('Zuchtzufall: Auswahl außerhalb des Pools');
    }
    const breedClamp = (value, low, high) => Math.min(high, Math.max(low, value));
    function breedingMods(bonuses = []) {
      if (!Array.isArray(bonuses) || bonuses.some((bonus) => !BREEDING_EFFECTS.has(bonus?.effect)
        || !Number.isSafeInteger(bonus.value) || bonus.value < 0)) throw new Error('Zuchtboni sind ungültig');
      const sum = (effect) => bonuses.filter((bonus) => bonus.effect === effect).reduce((total, bonus) => total + bonus.value, 0);
      return {
        statMod: breedClamp(sum('statMod'), 0, GEN_STATMOD_CAP_BPS),
        lootLuck: breedClamp(sum('lootLuck'), 0, LOOTLUCK_CAP_BPS),
        hatchPoints: sum('hatchPoints'),
      };
    }
    function rollBreedingBonuses({ seed, eggId, gen, bxpA, bxpB }) {
      if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Zucht-Seed muss uint32 sein');
      if (!/^e[1-9]\d*$/.test(eggId)) throw new TypeError('Ei-ID ist ungültig');
      for (const value of [bxpA, bxpB]) if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('ZE muss nichtnegativ sein');
      const pool = gen < 2 ? null : {
        ...BREEDING_POOLS.cycle[(gen - 2) % BREEDING_POOLS.cycle.length],
        entries: BREEDING_POOLS.cycle[(gen - 2) % BREEDING_POOLS.cycle.length].entries.map((entry) => ({ ...entry })),
        scale: gen < BREEDING_POOLS.scaleFromGen ? 10000
          : Math.min(BREEDING_POOLS.scaleCapBps, 10000 + (gen - BREEDING_POOLS.scaleFromGen) * BREEDING_POOLS.scaleStepBps),
      };
      if (pool === null) return [];
      const avg = Math.floor((bxpA + bxpB) / 2);
      const luckFactor = Math.min(25000, 10000 + Math.max(0, avg - BXP_NEUTRAL) * 100);
      const chance = Math.min(6000, Math.floor((pool.baseChanceBps * luckFactor) / 10000));
      const next = breedingStream(`zucht.bonus|${seed}|${eggId}`);
      const out = [];
      for (let slot = 0; slot < pool.slots; slot += 1) {
        if (breedingRandInt(next, 10000) >= chance) continue;
        const picked = breedingWeightedPick(next, pool.entries);
        out.push({ slot, id: picked.id, effect: picked.effect, value: Math.floor((picked.value * pool.scale) / 10000) });
      }
      return out;
    }
    function legacyLevelFor(xp) {
      let level = 1;
      while (level < 2000 && Math.round((250 * (Math.pow(1.35, level) - 1)) / 0.35) <= xp) level += 1;
      return level;
    }
    function createBreedingState(speciesId, source = {}) {
      const xp = Number.isFinite(source.xp) && source.xp >= 0 ? source.xp : 0;
      const wins = Number.isSafeInteger(source.wins) && source.wins >= 0 ? source.wins : 0;
      const losses = Number.isSafeInteger(source.losses) && source.losses >= 0 ? source.losses : 0;
      const round = Number.isSafeInteger(source.round) && source.round >= 0 ? source.round : 0;
      const hits = Number.isSafeInteger(source.hits) && source.hits >= 0 ? source.hits : 0;
      const damageTotal = /^\d+$/.test(String(source.damageTotal ?? '0')) ? String(source.damageTotal ?? '0') : '0';
      const level = legacyLevelFor(xp);
      const bxp = BXP_FOUNDER + Math.min(150, 10 * Math.max(0, level - 50));
      return {
        schemaVersion: BREEDING_VERSION,
        seed: fnv1a32(`codingmon-seed|${xp}|${wins}|${losses}|${source.completions ?? 0}`),
        nextId: 2,
        active: 'c1',
        creatures: [{
          id: 'c1', species: SPECIES[speciesId] ? speciesId : SPECIES_IDS[0],
          xp, bxp, gen: 1, bonuses: [], clutch: 0, wins, losses, round, hits, damageTotal,
          hp: Number.isFinite(source.hp) && source.hp > 0 ? source.hp : statsAt(speciesId, levelFor(xp)).hp,
        }],
        eggs: [],
        completions: Number.isSafeInteger(source.completions) && source.completions >= 0 ? source.completions : 0,
      };
    }
    function normalizeBreeding(raw, legacyState) {
      if (raw?.schemaVersion !== BREEDING_VERSION || !Array.isArray(raw.creatures) || !Array.isArray(raw.eggs)) {
        return createBreedingState(legacyState.species, legacyState);
      }
      const creatures = [];
      const ids = new Set();
      for (const value of raw.creatures) {
        if (!value || typeof value !== 'object' || !/^c[1-9]\d*$/.test(value.id ?? '')
          || ids.has(value.id) || !SPECIES[value.species]) continue;
        const bonuses = Array.isArray(value.bonuses) ? value.bonuses.filter((bonus) =>
          Number.isSafeInteger(bonus?.slot) && bonus.slot >= 0 && typeof bonus.id === 'string'
          && BREEDING_EFFECTS.has(bonus.effect) && Number.isSafeInteger(bonus.value) && bonus.value >= 0)
          .map((bonus) => ({ slot: bonus.slot, id: bonus.id, effect: bonus.effect, value: bonus.value })) : [];
        const creature = {
          id: value.id, species: value.species,
          xp: Number.isFinite(value.xp) && value.xp >= 0 ? value.xp : 0,
          bxp: Number.isSafeInteger(value.bxp) && value.bxp >= 0 ? value.bxp : BXP_FOUNDER,
          gen: Number.isSafeInteger(value.gen) && value.gen >= 1 ? value.gen : 1,
          bonuses, clutch: Number.isSafeInteger(value.clutch) && value.clutch >= 0 ? value.clutch : 0,
          wins: Number.isSafeInteger(value.wins) && value.wins >= 0 ? value.wins : 0,
          losses: Number.isSafeInteger(value.losses) && value.losses >= 0 ? value.losses : 0,
          round: Number.isSafeInteger(value.round) && value.round >= 0 ? value.round : 0,
          hits: Number.isSafeInteger(value.hits) && value.hits >= 0 ? value.hits : 0,
          damageTotal: /^\d+$/.test(String(value.damageTotal ?? '')) ? String(value.damageTotal) : '0',
          hp: Number.isFinite(value.hp) && value.hp >= 0 ? value.hp : statsAt(value.species, levelFor(value.xp ?? 0)).hp,
        };
        ids.add(creature.id);
        creatures.push(creature);
      }
      if (creatures.length === 0) return createBreedingState(legacyState.species, legacyState);
      const creatureIds = new Set(creatures.map((creature) => creature.id));
      const eggs = [];
      for (const egg of raw.eggs) {
        if (!egg || typeof egg !== 'object' || !/^e[1-9]\d*$/.test(egg.id ?? '') || ids.has(egg.id)
          || !SPECIES[egg.species] || !Array.isArray(egg.parents) || egg.parents.length !== 2
          || egg.parents[0] === egg.parents[1] || egg.parents.some((id) => !creatureIds.has(id))
          || !Number.isSafeInteger(egg.gen) || egg.gen < 2 || !Number.isSafeInteger(egg.bp) || egg.bp < 0) continue;
        const bonuses = Array.isArray(egg.bonuses) ? egg.bonuses.filter((bonus) =>
          Number.isSafeInteger(bonus?.slot) && bonus.slot >= 0 && typeof bonus.id === 'string'
          && BREEDING_EFFECTS.has(bonus.effect) && Number.isSafeInteger(bonus.value) && bonus.value >= 0)
          .map((bonus) => ({ slot: bonus.slot, id: bonus.id, effect: bonus.effect, value: bonus.value })) : [];
        ids.add(egg.id);
        eggs.push({
          id: egg.id, seed: Number.isSafeInteger(egg.seed) && egg.seed >= 0 ? egg.seed : raw.seed >>> 0,
          parents: egg.parents.slice(), species: egg.species, gen: egg.gen, bonuses, bp: egg.bp,
        });
      }
      const maxId = [...ids].reduce((max, id) => Math.max(max, Number(id.slice(1)) || 0), 0);
      const completions = Number.isSafeInteger(raw.completions) && raw.completions >= 0 ? raw.completions : legacyState.completions;
      return {
        schemaVersion: BREEDING_VERSION,
        seed: Number.isSafeInteger(raw.seed) && raw.seed >= 0 && raw.seed <= 0xffffffff ? raw.seed : 0,
        nextId: Math.max(maxId + 1, Number.isSafeInteger(raw.nextId) && raw.nextId >= 1 ? raw.nextId : 1),
        active: creatureIds.has(raw.active) ? raw.active : creatures[0].id,
        creatures, eggs,
        completions: Math.max(completions, legacyState.completions ?? 0),
      };
    }
    let mutationBatchDepth = 0;
    let pendingPersistence = false;
    let pendingHostSnapshot = false;
    let pendingRender = false;
    function withMutationBatch(fn) {
      mutationBatchDepth += 1;
      try { return fn(); }
      finally {
        mutationBatchDepth -= 1;
        if (mutationBatchDepth === 0) {
          const writeLocal = pendingPersistence;
          const sendHost = pendingHostSnapshot;
          const render = pendingRender;
          pendingPersistence = false;
          pendingHostSnapshot = false;
          pendingRender = false;
          if (writeLocal) persistNow();
          if (sendHost) sendSnapshotNow();
          if (render) emit();
        }
      }
    }
    function activeCreature() {
      const breeding = typeof store === 'undefined' ? null : store?.breeding;
      return breeding?.creatures?.find((creature) => creature.id === breeding.active) ?? null;
    }
    function syncActiveCreature() {
      const creature = activeCreature();
      if (!creature) return;
      creature.species = store.species;
      creature.xp = Math.max(0, store.xp);
      creature.wins = store.wins;
      creature.losses = store.losses;
      creature.round = store.round;
      creature.hits = store.hits;
      creature.damageTotal = store.damageTotal.toString();
      creature.hp = store.hp;
    }
    function effectiveStatsFor(speciesId, lvl, creature = null) {
      const raw = statsAt(speciesId, lvl);
      if (!creature || creature.species !== speciesId) return raw;
      const bonuses = breedingMods(creature.bonuses);
      const bxpMod = breedClamp((creature.bxp - BXP_NEUTRAL) * BXP_BPS_PER_POINT, -MOD_CAP_BPS, MOD_CAP_BPS);
      const combined = breedClamp(bxpMod + bonuses.statMod, -MOD_CAP_BPS, MOD_CAP_BPS);
      return Object.fromEntries(Object.entries(raw).map(([key, value]) => [
        key, Math.floor((value * (10000 + combined)) / 10000),
      ]));
    }
    function breedingCandidates(a, b) {
      if (!a || !b) return [];
      const set = new Set([
        ...Object.keys(LINEAGE).filter((id) => LINEAGE[id]?.ancestor === a.species),
        ...Object.keys(LINEAGE).filter((id) => LINEAGE[id]?.ancestor === b.species),
      ]);
      const species = [...set];
      if (species.length === 0) return [...new Set([a.species, b.species])].sort();
      return species.sort();
    }
    function breedingPairCore(state, idA, idB, selectedSpecies) {
      if (!state || state.schemaVersion !== BREEDING_VERSION || !Array.isArray(state.creatures) || !Array.isArray(state.eggs) || !state.loot) {
        throw new Error('Zucht: Spielstand v3 ist unvollständig');
      }
      if (typeof idA !== 'string' || typeof idB !== 'string' || idA === idB) throw new Error('Zucht benötigt zwei verschiedene Eltern');
      const a = state.creatures.find((creature) => creature.id === idA);
      const b = state.creatures.find((creature) => creature.id === idB);
      if (!a || !b) throw new Error('Zucht: Elternteil nicht gefunden');
      const cost = 1 + Math.max(a.clutch, b.clutch);
      if (!Number.isSafeInteger(state.loot.brauchbar) || state.loot.brauchbar < cost) throw new Error(`Zucht kostet ${cost} brauchbare Teile`);
      const candidates = breedingCandidates(a, b);
      if (candidates.length > 1 && selectedSpecies === undefined) throw new Error('Nachkommenart muss ausdrücklich ausgewählt werden');
      const species = selectedSpecies ?? candidates[0];
      if (!candidates.includes(species)) throw new Error('Die ausgewählte Art ist kein gültiger Nachkomme');
      const used = new Set([...state.creatures.map((creature) => creature.id), ...state.eggs.map((egg) => egg.id)]);
      const maxId = [...used].reduce((max, id) => Math.max(max, Number(id.slice(1)) || 0), 0);
      if (!Number.isSafeInteger(state.nextId) || state.nextId <= maxId || state.nextId >= Number.MAX_SAFE_INTEGER) {
        throw new Error('Zucht: nächster ID-Zähler ist ungültig');
      }
      const eggId = `e${state.nextId}`;
      const gen = Math.max(a.gen, b.gen) + 1;
      const bonuses = rollBreedingBonuses({ seed: state.seed, eggId, gen, bxpA: a.bxp, bxpB: b.bxp });
      const bp = breedingMods(bonuses).hatchPoints;
      state.nextId += 1;
      state.loot.brauchbar -= cost;
      a.bxp += PAIR_GAIN;
      b.bxp += PAIR_GAIN;
      a.clutch += 1;
      b.clutch += 1;
      state.eggs.push({ id: eggId, seed: state.seed, parents: [a.id, b.id], species, gen, bonuses, bp });
      return eggId;
    }
    function hatchReadyEggs() {
      const breeding = store.breeding;
      const ready = breeding.eggs.filter((egg) => egg.bp >= HATCH_BP)
        .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
      const creatureIds = new Set(breeding.creatures.map((creature) => creature.id));
      if (ready.some((egg) => egg.parents.some((id) => !creatureIds.has(id)))) {
        note('Schlupf angehalten: ein Eltern-Datensatz fehlt');
        return [];
      }
      if (breeding.nextId >= Number.MAX_SAFE_INTEGER - ready.length) {
        note('Schlupf angehalten: Kreatur-ID-Zähler erschöpft');
        return [];
      }
      const hatched = [];
      for (const egg of ready) {
        for (const parentId of egg.parents) {
          const parent = breeding.creatures.find((creature) => creature.id === parentId);
          parent.bxp += HATCH_GAIN;
        }
        const creature = {
          id: `c${breeding.nextId}`, species: egg.species, xp: 0, bxp: BXP_CHILD,
          gen: egg.gen, bonuses: egg.bonuses.map((bonus) => ({ ...bonus })), clutch: 0,
          wins: 0, losses: 0, round: 0, hits: 0, damageTotal: '0', hp: statsAt(egg.species, 1).hp,
        };
        breeding.creatures.push(creature);
        breeding.nextId += 1;
        hatched.push({ eggId: egg.id, creatureId: creature.id, species: creature.species, gen: creature.gen });
      }
      const hatchedIds = new Set(hatched.map((result) => result.eggId));
      breeding.eggs = breeding.eggs.filter((egg) => !hatchedIds.has(egg.id));
      for (const result of hatched) note(`SCHLUPF ${result.eggId} — ${SPECIES[result.species].label} (Gen ${result.gen}) ist jetzt ${result.creatureId}`);
      return hatched;
    }
    function advanceBreedingCompletions(absoluteCount) {
      const breeding = store.breeding;
      if (!Number.isSafeInteger(absoluteCount) || absoluteCount < 0) return 0;
      const previous = Number.isSafeInteger(breeding.completions) && breeding.completions >= 0 ? breeding.completions : 0;
      if (absoluteCount <= previous) return 0;
      const delta = absoluteCount - previous;
      breeding.completions = absoluteCount;
      for (const egg of breeding.eggs) egg.bp += BP_PER_COMPLETION * delta;
      hatchReadyEggs();
      return delta;
    }
    function addCapturedCreature(speciesId, lvl) {
      if (!SPECIES[speciesId]) return null;
      const breeding = store.breeding;
      const nextId = Number.isSafeInteger(breeding.nextId) && breeding.nextId > 0 ? breeding.nextId : 1;
      if (nextId >= Number.MAX_SAFE_INTEGER) return null;
      const xp = threshold(Math.min(LEVEL_CAP, Math.max(1, Math.floor(lvl))));
      const creature = {
        id: `c${nextId}`, species: speciesId, xp, bxp: BXP_FOUNDER, gen: 1,
        bonuses: [], clutch: 0, wins: 0, losses: 0, round: 0, hits: 0,
        damageTotal: '0', hp: statsAt(speciesId, levelFor(xp)).hp,
      };
      breeding.creatures.push(creature);
      breeding.nextId = nextId + 1;
      note(`FANG — ${SPECIES[speciesId].label} ist der Sammlung beigetreten (${creature.id})`);
      return creature.id;
    }

    const freshState = (speciesId = SPECIES_IDS[0]) => ({
      version: STORE_VERSION,
      name: 'Codingmon',
      species: speciesId,
      xp: 0,
      hp: statsAt(speciesId, 1).hp,
      wins: 0,
      losses: 0,
      round: 0,
      battle: null,
      breeding: createBreedingState(speciesId),
      /**
       * Erfolgreiche Agent-Completions (J3) und das wilde Codemon (J2): Der Host
       * zaehlt bestaetigte `turn/end`-Ereignisse, der Client waendet die Differenz
       * aus `readActivity` an und spiegelt den Stand zurueck. `wild`
       * ist `null` oder `{ speciesId, level, hp, maxHp }`; der KAMPF (`battle`)
       * bleibt Browsersache und geht nie auf die Platte des Hosts.
       */
      completions: 0,
      wild: null,
      /**
       * Letzter Host-Completion-Zaehler und Verbrauchsstand des Spawns.
       * `spawnedAt` verhindert die Dauerschleife: Nach Kampf oder Flucht steht
       * der Zaehler noch auf dem Vielfachen — ohne Marke kaeme der Ball sofort wieder.
       */
      localSteps: 0,
      spawnedAt: 0,
      /** Das letzte Kampfergebnis fuer `conversation.chat.turnTail` (oder null). */
      lastResult: null,
      log: [],
      /**
       * Der Lebenslauf. `damageTotal` ist die Summe allen Schadens und wird als
       * BigInt gefuehrt: bei Level 50 stehen hier Betraege in Millionenhöhe, und
       * eine Zahl, die man nachrechnen will, darf nicht ab 2^53 runden. JSON
       * kennt kein BigInt — persist() schreibt den Dezimaltext, revive() liest
       * ihn zurueck.
       */
      damageTotal: 0n,
      hits: 0,
      peakHit: 0,
      digits: 1,
      milestones: [],
      /** Beutezaehler und die letzten Funde. Reine Zahlen, keine Deutung. */
      loot: { schrott: 0, brauchbar: 0, shiny: 0 },
      drops: [],
      sinceShiny: 0,
      /** Die Sperre. Nicht null = ein Zug laeuft und nimmt keinen Input an. */
      lock: null,
      rejections: 0,
    });

    /**
     * Einen gelesenen Stand BRAUCHBAR machen: ein Pet aus einer aelteren Fassung
     * (die drei Spezies spark/byte/feral, kein Regelwerk, kein BigInt) darf den
     * Client nicht mit `undefined`-Werten in die Arena schicken. Unbekannte
     * Spezies fallen auf die erste zurueck, ein Kampf mit unbekanntem Gegner
     * wird verworfen — XP, Siege, Beute und Log bleiben.
     */
    function revive(raw) {
      const state = { ...freshState(), ...(raw ?? {}) };
      if (!SPECIES[state.species]) state.species = SPECIES_IDS[0];
      if (!Number.isFinite(state.xp) || state.xp < 0) state.xp = 0;
      if (!Number.isFinite(state.round) || state.round < 0) state.round = 0;
      if (!Number.isInteger(state.completions) || state.completions < 0) state.completions = 0;
      if (!Number.isInteger(state.localSteps) || state.localSteps < 0) state.localSteps = 0;
      if (!Number.isInteger(state.spawnedAt) || state.spawnedAt < 0) state.spawnedAt = 0;
      // Ein Ergebnis aus einer fremden Fassung ist kein Ergebnis: Ausgang,
      // Art und Stufe muessen stimmen, sonst steht im Chat ein Sieg ueber nichts.
      const result = state.lastResult;
      const resultOk = result !== null && typeof result === 'object'
        && (result.outcome === 'win' || result.outcome === 'loss' || result.outcome === 'flee')
        && SPECIES[result.speciesId] !== undefined
        && Number.isInteger(result.level) && result.level >= 1;
      state.lastResult = resultOk
        ? { outcome: result.outcome, speciesId: result.speciesId, level: result.level, reward: Math.max(0, Math.floor(result.reward ?? 0)), at: result.at ?? null }
        : null;
      // Ein Wild aus einer fremden Fassung ist kein Wild: Art, Stufe und HP
      // muessen stimmen, sonst steht hier ein Kampf gegen nichts (J2 ohne Luege).
      const wild = state.wild;
      const wildOk = wild !== null && typeof wild === 'object'
        && SPECIES[wild.speciesId] !== undefined
        && Number.isInteger(wild.level) && wild.level >= 1
        && Number.isFinite(wild.hp) && wild.hp >= 0
        && Number.isFinite(wild.maxHp) && wild.maxHp >= 1;
      state.wild = wildOk
        ? { speciesId: wild.speciesId, level: wild.level, hp: Math.min(wild.hp, wild.maxHp), maxHp: wild.maxHp }
        : null;
      try {
        state.damageTotal = BigInt(raw?.damageTotal ?? 0);
      } catch {
        state.damageTotal = 0n;
      }
      if (state.damageTotal < 0n) state.damageTotal = 0n;
      // Siege/Niederlagen stroemen in Anzeige UND Host-Spiegel: ein Stand mit
      // `{wins:'viele'}` ergab sonst den Zaehler „viele1" (String-Concat statt
      // Sieg) und fiel beim Host durch die Ganzzahl-Pruefung. Wie die Beute
      // wird auch hier WERT geprueft, nicht nur Existenz.
      for (const key of ['wins', 'losses', 'hits', 'peakHit', 'digits', 'sinceShiny', 'rejections']) {
        if (!Number.isFinite(state[key]) || state[key] < 0) state[key] = 0;
      }
      if (state.digits < 1) state.digits = 1;
      // Die Beute wird WERT FUER WERT geprueft, nicht nur auf Existenz: ein
      // Stand mit `{schrott:'viele'}` ergab sonst den Zaehler „viele1" und die
      // Panel-Zeile „Schrott: 85 % — viele1 gefunden". Nur die Schluessel des
      // Vertrags zaehlen, alles andere faellt auf 0 zurueck.
      const rawLoot = (state.loot !== null && typeof state.loot === 'object') ? state.loot : {};
      state.loot = Object.fromEntries(Object.entries(freshState().loot).map(([id, fallback]) => {
        const value = rawLoot[id];
        return [id, Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback];
      }));
      state.milestones = Array.isArray(state.milestones) ? state.milestones : [];
      state.drops = Array.isArray(state.drops) ? state.drops : [];
      const battle = state.battle;
      const usable = battle !== null && typeof battle === 'object' && SPECIES[battle.speciesId]
        && Number.isFinite(battle.hp) && Number.isFinite(battle.maxHp);
      state.battle = usable ? battle : null;
      // Das Log ist Anzeige, kein Vertrag: ein korrupter Eintrag (keine
      // Zeichenkette, kein Array) wuerde die naechste Mutation (`note` streut
      // das Log) oder die Kampf-Textbox (`TypeLine` schneidet zu) werfen
      // lassen. Fremde Zeilen fallen weg, echte bleiben — vor dem Sperr-Zweig,
      // der das Log ebenfalls streut.
      state.log = Array.isArray(state.log)
        ? state.log.filter((line) => typeof line === 'string').slice(0, 40)
        : [];
      // Eine Sperre haengt an einem Timer, und der ueberlebt das Neuladen nicht.
      // Ein Stand mit gesetzter Sperre waere eine Wartezeit ohne Uhr: der Spieler
      // wartete fuer immer. Also faellt der Zug, und das Log sagt es.
      if (state.lock !== null && state.lock !== undefined) {
        const pending = state.lock.action;
        state.lock = null;
        state.log = [`${new Date().toLocaleTimeString('de-DE')}  Neuladen mitten im Zug (${pending}) — der Zug ist verfallen`, ...(state.log ?? [])].slice(0, 40);
      }
      if (!Number.isFinite(state.hp) || state.hp <= 0) state.hp = statsAt(state.species, levelFor(state.xp)).hp;
      state.breeding = normalizeBreeding(raw?.breeding, state);
      state.version = STORE_VERSION;
      if (!state.breeding.creatures.some((creature) => creature.id === state.breeding.active)) {
        state.breeding.active = state.breeding.creatures[0]?.id ?? 'c1';
      }
      const active = state.breeding.creatures.find((creature) => creature.id === state.breeding.active);
      if (active) {
        state.species = active.species;
        state.xp = active.xp;
        state.wins = active.wins;
        state.losses = active.losses;
        state.round = active.round;
        state.hits = active.hits;
        try { state.damageTotal = BigInt(active.damageTotal); } catch { state.damageTotal = 0n; }
        const activeMaxHp = effectiveStatsFor(active.species, levelFor(active.xp), active).hp;
        state.hp = Number.isFinite(active.hp) ? Math.max(0, Math.min(activeMaxHp, active.hp)) : activeMaxHp;
        if (state.hp <= 0) state.hp = activeMaxHp;
      }
      state.completions = Math.max(state.completions, state.breeding.completions);
      return state;
    }

    /** Der Stand, wie er auf die Platte geht: BigInt als Dezimaltext. */
    const portable = () => ({ ...store, damageTotal: store.damageTotal.toString() });

    let store = freshState();
    try {
      const raw = window.localStorage?.getItem(STORAGE_KEY);
      if (raw) store = revive(JSON.parse(raw));
    } catch { /* kein Storage: das Pet lebt dann nur in dieser Sitzung */ }

    function persistNow() {
      try { window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(portable())); } catch { /* siehe oben */ }
    }
    const persist = () => {
      syncActiveCreature();
      if (mutationBatchDepth > 0) { pendingPersistence = true; return; }
      persistNow();
    };

    /**
     * ── Uebergabe (Client -> Host) ─────────────────────────────────────────
     * Der Stand liegt in `localStorage` und haengt damit am BROWSER-Profil; der
     * Host haelt daneben einen dauerhaften Spiegel (`assets/pet-store.js`).
     * Diese Funktion ist der ABSENDER und wirft nie, wartet nie, aendert nie
     * den Spielstand: ohne Kanal bleibt alles wie vorher, und der Zustand merkt
     * sich die Absage. Die Namen sind LITERAL (das Bundle kann nichts aus
     * `assets/` laden); Quelle ist `assets/uebergabe.js` und
     * `test/uebergabe.test.mjs` vergleicht beide Seiten Zeichen fuer Zeichen.
     */
    const HOST_NAMESPACE = 'codingmon';
    const HOST_METHOD = 'writeSnapshot';
    const HOST_ACTIVITY_METHOD = 'readActivity';
    const HOST_PARAMETER = 'snapshot';
    const HOST_SERVICE = 'codingmonRemote';
    const strict = (type) => ({ mode: 'strict', typeSymbol: `${PLUGIN}#${type}`, create: () => null });
    /** Der eigene Remote-Beitrag (Form: `assets/uebergabe.js`; der Browser kennt nur seine Liste). */
    const CONTRIBUTION = { package: PLUGIN, descriptors: [
      { id: `${PLUGIN}#${HOST_NAMESPACE}/${HOST_METHOD}`, service: HOST_SERVICE, namespace: HOST_NAMESPACE, method: HOST_METHOD, invocation: { kind: 'direct' }, parameters: [{ name: HOST_PARAMETER, wire: HOST_PARAMETER, source: 'json', codec: strict('Snapshot') }], result: strict('SnapshotAck') },
      { id: `${PLUGIN}#${HOST_NAMESPACE}/${HOST_ACTIVITY_METHOD}`, service: HOST_SERVICE, namespace: HOST_NAMESPACE, method: HOST_ACTIVITY_METHOD, invocation: { kind: 'direct' }, parameters: [], result: strict('Activity') },
    ] };
    let clientCtx = null;
    let hostMirror = { sent: 0, lastAt: null, lastLevel: null, error: null, reason: 'kein Kanal' };

    /** Den Namensraum des Beitrags finden — als Cordis-Dienst `remote.<namespace>`. */
    function hostNamespace() {
      const remote = clientCtx?.remote;
      if (remote === null || remote === undefined) return null;
      const viaCtx = typeof clientCtx.get === 'function' ? clientCtx.get(`remote.${HOST_NAMESPACE}`) : undefined;
      return viaCtx ?? remote[HOST_NAMESPACE] ?? null;
    }

    function toHost() {
      if (mutationBatchDepth > 0) { pendingHostSnapshot = true; return true; }
      return sendSnapshotNow();
    }
    function sendSnapshotNow() {
      try {
        const namespace = hostNamespace();
        const send = namespace?.[HOST_METHOD];
        if (typeof send !== 'function') {
          hostMirror = { ...hostMirror, reason: 'kein Kanal' };
          return false;
        }
        const snapshot = {
          schemaVersion: STORE_VERSION,
          species: store.species,
          xp: Math.floor(store.xp),
          wins: store.wins,
          losses: store.losses,
          round: store.round,
          damageTotal: store.damageTotal.toString(),
          hits: store.hits,
          loot: { ...store.loot },
          savedAt: new Date().toISOString(),
          completions: Math.max(0, Math.floor(store.completions)),
          wild: store.wild === null ? null : {
            speciesId: store.wild.speciesId,
            level: store.wild.level,
            hp: store.wild.hp,
            maxHp: store.wild.maxHp,
          },
          breeding: store.breeding,
        };
        // Die Methode liefert ein RemoteResult: { ok: true, value } oder
        // { ok: false, error }. Der Fehlerzweig ist ein ERGEBNIS, kein Wurf —
        // ein abwesender oder ablehnender Host darf das Spiel nicht anhalten.
        Promise.resolve(send(snapshot)).then(
          (result) => {
            if (result?.ok === true) {
              hostMirror = {
                sent: hostMirror.sent + 1,
                lastAt: result.value?.storedAt ?? null,
                lastLevel: result.value?.level ?? null,
                error: null,
                reason: 'gespiegelt',
              };
            } else {
              hostMirror = { ...hostMirror, error: result?.error?.message ?? 'abgelehnt', reason: 'abgelehnt' };
            }
          },
          (error) => { hostMirror = { ...hostMirror, error: error?.message ?? String(error), reason: 'kein Kanal' }; },
        );
        return true;
      } catch (error) {
        hostMirror = { ...hostMirror, error: error?.message ?? String(error), reason: 'kein Kanal' };
        return false;
      }
    }
    const note = (text) => {
      store.log = [`${new Date().toLocaleTimeString('de-DE')}  ${text}`, ...store.log].slice(0, 40);
    };

    const level = () => levelFor(store.xp);
    const stats = () => effectiveStatsFor(store.species, level(), activeCreature());
    const maxHp = () => stats().hp;

    /**
     * Der Praesentationszustand — ABGELEITET aus dem Zustand, nie gesetzt.
     *
     * `idle`    kein Kampf, keine Sperre: der Sprite darf wandern.
     * `combat`  ein Kampf steht offen, es ist nichts in Arbeit.
     * `action`  der Zug laeuft (die Sperre steht): etwas wird getan.
     * `victory` / `defeat` / `flee`  das Ergebnis ist gerade gefallen.
     *
     * Die REIHENFOLGE ist die Aussage: die Sperre zuerst. Waehrend eines
     * Zuges steht die Sperre, und der Kampf steht waehrenddessen oft noch
     * nicht einmal offen (der Gegner wird erst im Zug aufgestellt). Ohne
     * diese Reihenfolge stuende die Figur im wichtigsten Moment als "idle"
     * da und liefe spazieren, waehrend gespielt wird.
     *
     * Zwei Regeln, die das Timing betreffen und nicht das Ergebnis: der
     * Praesentationszustand aendert NICHTS an HP, XP, Beute oder Skillstatus —
     * die Mechanik steht in `finish()`, und die steht nicht in einer Animation.
     * Und der Endzustand ist ein Fenster, kein Zustand: nach 1,6 Sekunden
     * faellt er auf `idle` zurueck, damit eine alte Schlacht nicht ewig als
     * Sieg herumsteht.
     */
    const PRESENTATION_WINDOW_MS = 1600;
    function presentationState(s, now = Date.now()) {
      if (s.lock !== null) return 'action';
      if (s.battle !== null) return 'combat';
      const result = s.lastResult;
      if (result && Number.isFinite(result.at) && now - result.at < PRESENTATION_WINDOW_MS) {
        if (result.outcome === 'win') return 'victory';
        if (result.outcome === 'flee') return 'flee';
        return 'defeat';
      }
      return 'idle';
    }

    // XP stammen ausschliesslich aus erfolgreichen Host-Completions; Tokens
    // werden weder aus dem DOM gelesen noch als Fortschritt interpretiert.

    /**
     * Einen Meilenstein feiern — aber nur, wenn wirklich eine Stelle dazukommt.
     * `kind` trennt, WELCHER Wert gewachsen ist (Lebenslauf, Einzeltreffer, XP,
     * Beute), damit die Anzeige nicht alles in einen Topf wirft.
     */
    function celebrate(kind, before, after, label) {
      const mark = milestoneFor(before, after);
      if (mark === null) return null;
      const digits = digitsOf(after);
      store.milestones = [{ at: Date.now(), kind, mark, value: exactText(after), digits, label }, ...store.milestones].slice(0, 20);
      note(`MEILENSTEIN ${formatNumber(mark)}+ (${kind}) — ${label}: ${formatNumber(after)} (${digits} Stellen)`);
      return mark;
    }

    function award(xp, reason) {
      const before = level();
      const xpBefore = store.xp;
      store.xp += Math.max(0, Math.round(xp));
      store.digits = Math.max(store.digits, digitsOf(store.xp));
      const after = level();
      if (after > before) {
        const learned = abilitiesFor(after, store.species)
          .filter((ability) => ability.minLevel > before);
        store.hp = stats().hp;
        note(`LEVEL ${after} — ${formOf(after).label}!${learned.length ? ` Gelernt: ${learned.map((a) => a.label).join(', ')}` : ''}`);
      } else if (reason) {
        note(reason);
      }
      celebrate('xp', xpBefore, store.xp, `Level ${after}`);
      persist();
      emit();
    }

    function readActivity() {
      try {
        const namespace = hostNamespace();
        const read = namespace?.[HOST_ACTIVITY_METHOD];
        if (typeof read !== 'function') return;
        Promise.resolve(read()).then((result) => {
          if (result?.ok !== true || !Number.isInteger(result.value?.completions)) return;
          const total = Math.max(0, result.value.completions);
          const gained = Math.max(0, total - store.completions);
          if (gained === 0) return;
          withMutationBatch(() => {
            store.completions = total;
            store.localSteps = total;
            advanceBreedingCompletions(total);
            award(gained, null);
            checkSpawn();
            persist();
            toHost();
            emit();
          });
        }).catch(() => {});
      } catch { /* ohne Remote-Beitrag bleibt der Spielstand unveraendert */ }
    }

    // ── Completion-Spawn und Herausforderung ──────────────────────────────
    /**
     * Die Spawn-Pruefung: deterministisch aus (`localSteps`, Stufe). Gibt es
     * ein Wild, steht kein anderes, laeuft kein Kampf und ist dieser Stand
     * noch nicht verbraucht, faellt der Ball. Reine Auswertung plus EIN
     * Schreibvorgang — dieselbe Funktion treibt der Takt wie der Hand-Trigger.
     */
    function checkSpawn() {
      const wild = spawnFor(store.localSteps, level());
      if (wild === null || store.localSteps <= store.spawnedAt) return null;
      if (store.wild !== null || store.battle !== null || store.lock !== null) return null;
      const stats = statsAt(wild.speciesId, wild.level);
      store.wild = { speciesId: wild.speciesId, level: wild.level, hp: stats.hp, maxHp: stats.hp };
      store.spawnedAt = store.localSteps;
      note(`Ein wilder ${SPECIES[wild.speciesId].label} L${wild.level} erscheint!`);
      persist();
      toHost();
      emit();
      return { ...store.wild };
    }

    /**
     * Die Herausforderung: ein Klick auf das Wild oeffnet den Kampf — als Zug
     * ueber die bestehende Sperre (`beginTurn('start', …)`), mit derselben
     * verzoegerten Eroeffnung wie `startBattle`. Der Ball ist verbraucht,
     * sobald der Zug steht.
     */
    function challengeWild() {
      if (store.wild === null || store.battle !== null) return null;
      if (!guard('challenge')) return null;
      const wild = store.wild;
      const stats = statsAt(wild.speciesId, wild.level);
      const arena = {
        speciesId: wild.speciesId,
        element: SPECIES[wild.speciesId].family,
        level: wild.level,
        stats,
        reward: rewardFor(wild.level),
        source: 'wild',
      };
      const lock = beginTurn('start', { arena });
      if (lock === null) return null;
      store.wild = null;
      store.round += 1;
      note(`Du forderst ${SPECIES[wild.speciesId].label} L${wild.level} heraus!`);
      persist();
      return { locked: true, until: lock.until, arena };
    }

    /** Flucht vor dem Wilden: der Ball bleibt aus, bis der Zaehler weitergeht. */
    function fleeWild() {
      if (store.wild === null || store.battle !== null || store.lock !== null) return null;
      const wild = store.wild;
      store.wild = null;
      note(`${SPECIES[wild.speciesId].label} entkommt — der Wald ist wieder still`);
      persist();
      emit();
      return { fled: wild.speciesId };
    }

    /**
     * Rueckzug aus dem Kampf (J4): abbrechbar, sobald der Agent fertig ist —
     * und davor. Kein Sieg, keine Niederlage, volle HP. Nur ausserhalb eines
     * laufenden Zuges.
     */
    function fleeBattle() {
      const battle = store.battle;
      if (battle === null || battle.over !== null || store.lock !== null) return null;
      store.battle = null;
      store.hp = maxHp();
      store.lastResult = { outcome: 'flee', speciesId: battle.speciesId, level: battle.level, reward: 0, at: Date.now() };
      note(`Rueckzug gegen ${SPECIES[battle.speciesId].label} L${battle.level} — das Codemon rappelt sich wieder auf`);
      persist();
      emit();
      return { fled: battle.speciesId };
    }

    // ── 3. PACING: der Zug sperrt den Zustand ───────────────────────────────
    /** Rundendauer aus dem Vertrag; eine kaputte Zahl wird zu 0, nicht zu NaN. */
    const roundDelay = () => Math.max(0, Number(roundDelayMs) || 0);
    /** Timer je Zug. Ausserhalb des Zustands, weil ein Handle nicht auf die Platte gehoert. */
    const timers = new Map();

    /**
     * Ein Input WAEHREND der Sperre wird kalt abgewiesen, nicht eingereiht und
     * nicht verrechnet. Das ist die eine Stelle, die die Luecke schliesst: wer
     * zehnmal klickt, bekommt neun Absagen und genau ein Ergebnis.
     */
    function guard(action) {
      if (store.lock === null) return true;
      store.rejections += 1;
      note(`${PACING.lockedText} (abgewiesen: ${action})`);
      persist();
      emit();
      return false;
    }

    /**
     * Einen Zug beginnen: SYNCHRON, in derselben Millisekunde wie der Klick,
     * wird der Schnappschuss eingefroren, den das Ergebnis benutzen darf — und
     * erst danach wird gewartet. Diese Reihenfolge ist der ganze Punkt: waere
     * die Sperre erst nach dem `await` gesetzt, koennte ein zweiter Klick im
     * selben Tick ein zweites Ergebnis buchen (Race Condition). Der eingefrorene
     * Stand ist die EINZIGE Quelle des Ergebnisses; was der Nutzer waehrend der
     * Wartezeit sieht, ist die Wartezeit selbst.
     */
    function beginTurn(action, payload) {
      if (!guard(action)) return null;
      const now = Date.now();
      const lock = {
        id: `${now}-${store.round}-${store.hits}-${action}`,
        action,
        payload,
        at: now,
        until: now + roundDelay(),
        frozen: {
          level: level(),
          species: store.species,
          hp: store.hp,
          stats: stats(),
          inherited: inheritedAbilities(store.species),
          battle: store.battle === null ? null : { ...store.battle, stats: { ...store.battle.stats } },
        },
      };
      store.lock = lock;
      persist();
      emit();
      timers.set(lock.id, window.setTimeout(() => settle(lock.id), roundDelay()));
      return lock;
    }

    /**
     * Das Ergebnis ausspielen. Der Timer prueft ZUERST seine Kennung: ein Zug,
     * der schon ersetzt wurde, darf nicht mehr schreiben (sonst wuerde ein
     * spaeter Zuendender den aktuellen Kampf ueberschreiben). Alles Folgende
     * laeuft in einem Block — waehrend der Sperre konnte nichts anderes den
     * Zustand bewegen.
     */
    function settle(lockId) {
      const timer = timers.get(lockId);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        timers.delete(lockId);
      }
      const lock = store.lock;
      if (lock === null || lock.id !== lockId) return null;
      const { frozen, action, payload } = lock;
      store.lock = null;
      const result = action === 'start' ? openBattle(frozen, payload) : action === 'use' ? strike(frozen, payload) : null;
      persist();
      // Jeder BEENDETE Zug geht an den Host — nicht jeder Klick: die Sperre hat
      // den Zug schon auf einen Ausgang festgelegt, und ein Zwischenstand waere
      // ein Stand, den der Client selbst nie hatte.
      toHost();
      emit();
      return result;
    }

    /** Der Zug, wie ihn der Client nach aussen meldet (fuer Proben und Anzeige). */
    const lockStatus = () => (store.lock === null ? null : { ...store.lock.frozen, id: store.lock.id, action: store.lock.action, until: store.lock.until });

    // ── 1./2. Arena: ein Klick = ein Zug, Ergebnis verzoegert ───────────────
    /**
     * Den Treffer buchen: der Lebenslauf waechst als BigInt, Einzeltreffer und
     * Stellenzahl werden nachgezogen, und ein Stellensprung wird gefeiert.
     * Alle Ausgaben sind formatiert — der Sprung von zwei- auf fuenfstellig ist
     * die Aussage, nicht die Animation.
     */
    function bookHit(dealt, label) {
      const before = store.damageTotal;
      const peakBefore = store.peakHit;
      store.damageTotal += BigInt(Math.max(0, Math.round(dealt)));
      store.hits += 1;
      if (dealt > store.peakHit) store.peakHit = dealt;
      store.digits = Math.max(store.digits, digitsOf(store.damageTotal));
      celebrate('lebenslauf', before, store.damageTotal, label);
      celebrate('treffer', peakBefore, store.peakHit, label);
    }

    /** Einen Gegner stellen — als Zug, nicht sofort. */
    function startBattle() {
      if (store.battle !== null) return store.battle;
      const arena = arenaFor(level(), store.round);
      const lock = beginTurn('start', { arena });
      if (lock === null) return null;
      store.round += 1;
      persist();
      return { locked: true, until: lock.until, arena };
    }

    /** Den eingefrorenen Gegner aufstellen; schlaegt er zuerst, tut er es sofort. */
    function openBattle(frozen, payload) {
      const arena = payload.arena;
      store.battle = {
        speciesId: arena.speciesId,
        element: arena.element,
        level: arena.level,
        hp: arena.stats.hp,
        maxHp: arena.stats.hp,
        stats: arena.stats,
        reward: arena.reward,
        turn: firstStrike(frozen.stats, arena.stats),
        source: arena.source ?? 'arena',
        over: null,
      };
      note(`Runde ${store.round}: ${SPECIES[arena.speciesId].label} L${arena.level} erscheint (${formatNumber(arena.reward)} XP)`);
      if (store.battle.turn === 'enemy') enemyAnswer();
      return { locked: false, battle: { ...store.battle } };
    }

    /**
     * Die gewaehlte Faehigkeit aus dem EINGEFRORENEN Stand ausfuehren. Der
     * Gegner antwortet im selben Block: ein Klick ergibt genau eine Runde, nie
     * zwei halbe.
     */
    function strike(frozen, payload) {
      const battle = store.battle;
      if (battle === null || battle.over !== null) return null;
      const known = abilitiesFor(frozen.level, frozen.species);
      const move = known.find((ability) => ability.id === payload.abilityId) ?? known[0];
      const attacker = {
        element: SPECIES[frozen.species].family,
        stats: frozen.stats,
        hp: frozen.hp,
        maxHp: frozen.stats.hp,
        inherited: frozen.inherited,
      };
      const result = resolveAttack(move, attacker, battle);
      battle.hp = Math.max(0, battle.hp - result.dealt);
      bookHit(result.dealt, `${move.label} gegen ${SPECIES[battle.speciesId].label}`);
      note(`${move.label} —${formatNumber(result.dealt)} (Element ${result.element}x${result.category === 'speziell' ? `, Durchgriff ${result.defFactor}` : ''}`
        + `${result.buff.id === 'neutral' ? '' : `, ${result.buff.label} ${result.buff.factor}x`}) — Gegner ${formatNumber(battle.hp)}/${formatNumber(battle.maxHp)} HP`);
      let outcome = null;
      if (battle.hp <= 0) outcome = finish('win', battle);
      else {
        battle.turn = 'enemy';
        outcome = enemyAnswer();
      }
      return { move: move.id, dealt: result.dealt, factors: result, battle: { ...battle }, outcome };
    }

    /** Der Gegner schlaegt zurueck — dieselbe reine Kette, sein Stand. */
    function enemyAnswer() {
      const battle = store.battle;
      if (battle === null || battle.over !== null) return null;
      const move = bestMove(battle.level, battle.speciesId);
      const attacker = {
        element: battle.element ?? SPECIES[battle.speciesId].family,
        stats: battle.stats,
        hp: battle.hp,
        maxHp: battle.maxHp,
        inherited: [],
      };
      const result = resolveAttack(move, attacker, { element: SPECIES[store.species].family, stats: stats() });
      store.hp = Math.max(0, store.hp - result.dealt);
      note(`${SPECIES[battle.speciesId].label} nutzt ${move.label} —${formatNumber(result.dealt)} (Element ${result.element}x) — eigenes HP ${formatNumber(store.hp)}/${formatNumber(maxHp())}`);
      if (store.hp <= 0) return finish('loss', battle);
      battle.turn = 'challenger';
      return null;
    }

    /**
     * Eine Faehigkeit waehlen: sie wird nicht gerechnet, sie wird als Zug
     * begonnen. Die Sperre wird ZUERST geprueft — auch ein Klick auf einen
     * ausgegrauten Knopf ist ein Klick und bekommt die Absage, nicht ein
     * stilles Nichts.
     */
    function useAbility(abilityId) {
      if (!guard('use')) return null;
      const battle = store.battle;
      if (battle === null || battle.over !== null || battle.turn !== 'challenger') return null;
      const lock = beginTurn('use', { abilityId });
      return lock === null ? null : { locked: true, until: lock.until, abilityId };
    }

    /**
     * Kampfende. Der Sieg zahlt XP (die einzige XP-Quelle neben den Token) UND
     * rollt die Beute: ein Wurf, ein Ergebnis. Der Zaehler `sinceShiny` macht
     * die Quote sichtbar, ohne sie zu verbessern — es gibt keine Gnade, nur
     * eine Zahl, die zeigt, wie lange man schon leer ausgeht.
     */
    function finish(outcome, battle) {
      battle.over = outcome;
      // Das Ergebnis endet im Chat (`conversation.chat.turnTail` liest es).
      store.lastResult = {
        outcome,
        speciesId: battle.speciesId,
        level: battle.level,
        reward: outcome === 'win' ? battle.reward : 0,
        at: Date.now(),
      };
      if (outcome === 'win') {
        store.wins += 1;
        const reward = battle.reward;
        const shinyBefore = store.loot.shiny;
        store.battle = null;
        const drop = rollLoot(Math.random());
        store.loot[drop.id] += 1;
        store.sinceShiny = drop.id === 'shiny' ? 0 : store.sinceShiny + 1;
        store.drops = [{ at: Date.now(), id: drop.id, label: drop.label, level: battle.level }, ...store.drops].slice(0, 20);
        note(`Sieg gegen ${SPECIES[battle.speciesId].label} L${battle.level} — +${formatNumber(reward)} XP · Beute: ${drop.label} (${lootOdds(drop)} %)`
          + `${drop.id === 'shiny' ? ' — SHINY!' : ` · ${store.sinceShiny} Siege seit dem letzten Shiny`}`);
        if (drop.id === 'shiny') celebrate('beute', shinyBefore, store.loot.shiny, drop.label);
        if (battle.source === 'wild') addCapturedCreature(battle.speciesId, battle.level);
        award(reward + drop.xp, null);
      } else {
        store.losses += 1;
        store.battle = null;
        store.hp = maxHp();
        note(`K.o. gegen ${SPECIES[battle.speciesId].label} L${battle.level} — das Codemon rappelt sich wieder auf`);
      }
      return outcome;
    }

    /** Rast: HP auffuellen. Kein Sieg, kein XP — und waehrend eines Zuges nichts. */
    function rest() {
      if (!guard('rest')) return null;
      if (store.battle !== null) return null;
      store.hp = maxHp();
      note('Rast — HP aufgefrischt');
      persist();
      emit();
      return { hp: store.hp };
    }

    /** Spezies wechseln. Der Fortschritt (XP, Siege, Beute) bleibt, der Kampf endet. */
    function pickSpecies(speciesId) {
      if (!SPECIES[speciesId]) return null;
      if (!guard('pick')) return null;
      store.species = speciesId;
      store.battle = null;
      store.hp = statsAt(speciesId, level()).hp;
      note(`Gewechselt zu ${SPECIES[speciesId].label} (Abstammungstiefe ${(LINEAGE[speciesId] ?? {}).depth ?? 1})`);
      persist();
      emit();
      return { species: speciesId };
    }

    function selectCreature(creatureId) {
      if (!guard('pick')) return null;
      const target = store.breeding.creatures.find((creature) => creature.id === creatureId);
      if (!target) return null;
      syncActiveCreature();
      store.breeding.active = target.id;
      store.species = target.species;
      store.xp = target.xp;
      store.wins = target.wins;
      store.losses = target.losses;
      store.round = target.round;
      store.hits = target.hits;
      try { store.damageTotal = BigInt(target.damageTotal ?? '0'); } catch { store.damageTotal = 0n; }
      const maximum = effectiveStatsFor(target.species, levelFor(target.xp), target).hp;
      store.hp = Number.isFinite(target.hp) ? Math.max(0, Math.min(maximum, target.hp)) : maximum;
      if (store.hp <= 0) store.hp = maximum;
      store.battle = null;
      note(`Aktiv: ${SPECIES[target.species].label} · Gen ${target.gen} · ZE ${target.bxp}`);
      persist();
      toHost();
      emit();
      return { active: target.id, species: target.species };
    }
    function pairCreatures(idA, idB, selectedSpecies) {
      if (!guard('breed')) return null;
      const breeding = {
        ...store.breeding,
        creatures: store.breeding.creatures.map((creature) => ({ ...creature, bonuses: creature.bonuses.map((bonus) => ({ ...bonus })) })),
        eggs: store.breeding.eggs.map((egg) => ({ ...egg, parents: egg.parents.slice(), bonuses: egg.bonuses.map((bonus) => ({ ...bonus })) })),
        loot: { ...store.loot },
      };
      const eggId = breedingPairCore(breeding, idA, idB, selectedSpecies);
      const { loot, ...breedingState } = breeding;
      store.breeding = breedingState;
      store.loot = loot;
      const egg = store.breeding.eggs.find((entry) => entry.id === eggId);
      note(`PAARUNG — Ei ${eggId} · ${SPECIES[egg.species].label} · Gen ${egg.gen} · Brut ${egg.bp}/${HATCH_BP}`);
      persist();
      toHost();
      emit();
      return { eggId, species: egg.species, gen: egg.gen, bp: egg.bp };
    }

    /** Die Figur eines Codemons: Familie aus der Spezies, Farbe aus dem Farbton. */
    function speciesGlyph(speciesId, lvl, size) {
      const species = SPECIES[speciesId] ?? SPECIES[SPECIES_IDS[0]];
      const key = `${species.family}:${stageIndex(lvl)}:${size}:${species.hue}`;
      const cached = spriteCache.get(key);
      if (cached !== undefined) return cached;
      const svg = spriteSvg(species.family, stageIndex(lvl), size)
        .replace('<svg ', `<svg data-species="${speciesId}" `);
      // Der Farbton ist Teil der Spezies: die Familie liefert die Form, die
      // Spezies die Farbe. Damit teilen sich nicht alle zehn ein Aussehen.
      const tinted = svg.replace(/hsl\((\d+)/g, `hsl(${species.hue}`);
      spriteCache.set(key, tinted);
      return tinted;
    }

    /**
     * Die Kunst einer Art als fertiges Markup (Quelle
     * `assets/art/<art>.svg`, Generator `scripts/assets/build-sprites.mjs`,
     * Drift-Test `sprites.test.mjs`). Groesse wird gesetzt, der Rest steht schon
     * in der Datei.
     *
     * Zwei Entscheidungen, die man dem Markup nicht ansieht:
     *
     *   `aria-hidden` + `focusable="false"` — die Kunst traegt im ArtPack ein
     *   `aria-label` mit dem Artnamen. Im Panel steht dieser Name ohnehin als
     *   Text daneben; ihn zweimal vorzulesen ist Laerm, nicht Zugaenglichkeit.
     *   Das Bild ist hier Schmuck, die Aussage steht im Text.
     *
     *   `back` wird gespiegelt, nicht neu gemalt — das ArtPack hat EINE Ansicht
     *   je Art. Eine erfundene Rueckseite waere eine zweite Zeichnung, die es
     *   nicht gibt; eine Spiegelung ist sichtbar dieselbe Figur.
     */
    function artMarkup(speciesId, side, size) {
      const raw = SPRITE_ART[speciesId];
      if (raw === undefined) return null;
      const key = `art:${speciesId}:${side}:${size}`;
      const cached = spriteCache.get(key);
      if (cached !== undefined) return cached;
      const end = raw.indexOf('>') + 1;
      const head = raw.slice(0, end).replace(' width="512" height="512"', ` width="${size}" height="${size}"`);
      const body = raw.slice(end, raw.lastIndexOf('</svg>'));
      const tag = head.replace('<svg ', `<svg class="__cm_sprite __cm_art" data-species="${speciesId}" data-side="${side}" aria-hidden="true" focusable="false" `);
      const mirrored = side === 'back' ? `<g transform="scale(-1 1) translate(-${ART_VIEW} 0)">${body}</g>` : body;
      const markup = `${tag}${mirrored}</svg>`;
      spriteCache.set(key, markup);
      return markup;
    }

    const GRID_PALETTE = { K: '#0B0F14', V: '#A855F7', P: '#7C3AED', I: '#6366F1', W: '#E0E7FF' };
    /** Die Kantenlaenge, auf die jede Kunstdatei gemalt ist (Generator: `ART_VIEW`). */
    const ART_VIEW = 512;
    /**
     * Welches Gitter eine Art wirklich benutzt — die Aufloesung in einer
     * Stelle, damit sie pruefbar ist.
     *
     * Die Reihenfolge ist eine Zusage: eigenes Sprite, dann das Sprite der
     * FAMILIE, dann der Notfall. Vorher sprang der Notfall direkt auf die
     * ERSTE Art der Liste — jede Art ohne eigenes Sprite sah aus wie
     * NullPointer, gleichgueltig ob sie zu einem anderen Elementkreis
     * gehoert. Die Familie ist die naechstliegende Aussage, die das Bild
     * ueberhaupt noch tragen kann.
     */
    function resolveGridKey(speciesId, side) {
      const familyId = speciesOfFamily((SPECIES[speciesId] ?? {}).family);
      const own = `${speciesId}-${side}`;
      if (SPRITE_GRIDS[own] !== undefined) return own;
      const family = `${familyId}-${side}`;
      if (SPRITE_GRIDS[family] !== undefined) return family;
      const first = `${SPECIES_IDS[0]}-${side}`;
      if (SPRITE_GRIDS[first] !== undefined) return first;
      return `${SPECIES_IDS[0]}-front`;
    }
    /**
     * Das Sprite einer Spezies: die Kunst, wenn es sie gibt, sonst das
     * eingebettete 32x32-Gitter (`SPRITE_GRIDS`, Quelle `assets/sprites/*.grid`).
     * Ein `<rect>` je horizontalem Lauf — dieselbe Verdichtung wie der
     * Generator. Die Palette ist hier als Literal wiederholt (Bundle ohne
     * Import, siehe Abschnitt 1); Quelle: `scripts/assets/build-sprites.mjs`
     * (PALETTE).
     *
     * Der Gitter-Zweig ist kein toter Code: er ist der dokumentierte Rueckfall
     * fuer eine Art ohne Kunstdatei (und fuer die drei Familiengitter, die die
     * 16-px-Marke traegt).
     */
    function speciesSprite(speciesId, side, size) {
      const art = artMarkup(speciesId, side, size);
      if (art !== null) return art;
      const key = `grid:${speciesId}:${side}:${size}`;
      const cached = spriteCache.get(key);
      if (cached !== undefined) return cached;
      const grid = SPRITE_GRIDS[resolveGridKey(speciesId, side)];
      const rows = grid.split('\n');
      let pixels = '';
      for (let y = 0; y < rows.length; y += 1) {
        const row = rows[y];
        let x = 0;
        while (x < row.length) {
          const ch = row[x];
          if (ch === '.' || GRID_PALETTE[ch] === undefined) { x += 1; continue; }
          let end = x + 1;
          while (end < row.length && row[end] === ch) end += 1;
          pixels += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${GRID_PALETTE[ch]}"/>`;
          x = end;
        }
      }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" `
        + `shape-rendering="crispEdges" class="__cm_sprite" data-species="${speciesId}" data-side="${side}">${pixels}</svg>`;
      spriteCache.set(key, svg);
      return svg;
    }
    /** Das UI-SVG als Bild (`ball`, `spiral`, Schritt-Symbole aus UI_SVG). */
    function uiSvg(name, size) {
      const raw = UI_SVG[name] ?? UI_SVG.ball;
      return raw.replace('<svg ', `<svg width="${size}" height="${size}" `);
    }

    // ── Das Pet als Marke ───────────────────────────────────────────────────
    function PetMark({ size = 24 }) {
      const s = useStore();
      const lvl = levelFor(s.xp);
      return h('span', {
        className: '__cm_mark',
        title: `${s.name} · ${SPECIES[s.species].label} · Level ${lvl} · ${formOf(lvl).label}`,
        dangerouslySetInnerHTML: { __html: speciesGlyph(s.species, lvl, size) },
      });
    }

    function CodingmonIcon() {
      const s = useStore();
      return h('span', {
        className: '__cm_mark',
        dangerouslySetInnerHTML: { __html: speciesGlyph(s.species, levelFor(s.xp), 18) },
      });
    }

    /** Ein Balken. `tone` faerbt ihn (xp | hp | enemy). */
    function Bar({ value, max, tone }) {
      const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((value / max) * 100)));
      return h('div', { className: '__cm_bar', 'data-tone': tone ?? 'xp' },
        h('div', { className: '__cm_bar-fill', style: { width: `${pct}%` } }));
    }

    // ── GLOBALE EXP-LEISTE ──────────────────────────────────────────────────
    /**
     * Die EXP-Leiste steht im Composer-Dock und damit in JEDER Sitzung, nicht
     * nur im Panel: Level, Fortschritt zum naechsten Level, HP. Sie liest
     * denselben Store wie das Panel — eine Quelle, zwei Ansichten.
     */
    function ExpBar() {
      const s = useStore();
      const lvl = levelFor(s.xp);
      const next = threshold(lvl + 1);
      const prev = threshold(lvl);
      const pct = Math.max(0, Math.min(100, Math.round(((s.xp - prev) / Math.max(1, next - prev)) * 100)));
      // Idle-Wander: der Sprite laeuft HIN UND HER, wenn kein Kampf laeuft und
      // keine Sperre steht (also wirklich idle). Bei Kampf/Sperre steht er.
      // `data-state` traegt den vollen Praesentationszustand; `data-wander`
      // bleibt die Traegerbit fuer die Wander-Animation (idle an, sonst aus).
      const state = presentationState(s);
      // Das Hoechst-HP kommt aus DERSELBEN Fachfunktion wie im Panel — also mit
      // Zuchtboni. Vorher stand hier die Basisleiter, waehrend der Kampf und
      // das Panel die effektiven Werte rechneten: drei Ansichten, zwei Zahlen.
      const maximum = BigInt(stats().hp);
      return h('div', {
        className: '__cm_expbar',
        title: `${s.name} · ${SPECIES[s.species].label} · Level ${lvl} · ${s.wins} Siege`,
        'data-plugin': PLUGIN,
      },
        h('span', {
          className: '__cm_expbar-wander',
          'data-wander': state === 'idle' ? 'on' : 'off',
          'data-state': state,
          'aria-hidden': 'true',
        }, h('span', { className: '__cm_expbar-pet', dangerouslySetInnerHTML: { __html: speciesGlyph(s.species, lvl, 18) } })),
        h('span', { className: '__cm_expbar-lvl' }, `LV ${lvl}`),
        h('span', { className: '__cm_expbar-track' },
          h('span', { className: '__cm_expbar-fill', style: { width: `${pct}%` } })),
        h('span', { className: '__cm_expbar-meta' },
          // Hoechst-HP aus der effektiven Leiter (mit Zuchtboni): sonst stuende
          // hier ab Stufe ~120 die Exponentialschreibweise einer Zahl, die es so
          // nicht gibt — und der Balken zeigte eine andere Zahl als der Kampf.
          `${formatNumber(s.xp)} XP · HP ${formatNumber(Math.max(0, s.hp))}/${formatNumber(maximum)} · ${s.wins} Siege · Beute ${s.loot.shiny} shiny`),
      );
    }

    // ── Panel-Bausteine (Kopf / Werte / Arena / Liste / Bilanz) ─────────────
    /** Kopf: Figur, Kreatur-Wahl (alle erreichbar), Level und Fortschritt. */
    function PetHead({ s, lvl, onPick }) {
      const cur = Object.fromEntries(Object.entries(stats()).map(([key, value]) => [key, BigInt(value)]));
      const next = threshold(lvl + 1);
      const prev = threshold(lvl);
      const lineage = LINEAGE[s.species] ?? {};
      return h('header', { className: '__cm_panel-head' },
        h('span', { className: '__cm_panel-stage' },
          h('span', { dangerouslySetInnerHTML: { __html: speciesGlyph(s.species, lvl, 72) } }),
          h('span', { className: '__cm_sub' }, formOf(lvl).label)),
        h('div', { className: '__cm_panel-id' },
          h('h2', null, `${s.name} — ${SPECIES[s.species].label}`),
          h('p', { className: '__cm_sub' },
            `Level ${lvl} · ${s.wins} Siege / ${s.losses} K.o. · Runde ${s.round} · ${ELEMENTS[SPECIES[s.species].family].label} · Abstammungstiefe ${lineage.depth ?? 1}`),
          h('p', { className: '__cm_xp' },
            `${formatNumber(s.xp)} XP (${digitsOf(s.xp)} Stellen) · ${lvl >= LEVEL_CAP ? 'Level-Cap erreicht' : `${formatNumber(Math.max(0, next - s.xp))} XP bis Level ${lvl + 1}`}`),
          h(Bar, { value: s.xp - prev, max: Math.max(1, next - prev), tone: 'xp' }),
          h('label', { className: '__cm_pick' },
            h('span', null, 'Codemon'),
            h('select', {
              value: s.breeding?.active ?? 'c1',
              onChange: (event) => onPick(event.target.value),
            }, (s.breeding?.creatures ?? []).map((creature) => h('option', { key: creature.id, value: creature.id }, `${SPECIES[creature.species].label} · Gen ${creature.gen} · L${levelFor(creature.xp)}`)))),
          // Ist-HP steht im Zustand (Number), Soll-HP in der exakten Leiter.
          // Oberhalb von 2^53 koennen sich die letzten Stellen unterscheiden —
          // die Leiter ist die Wahrheit, der Zustand ist der Spielstand.
          h('p', { className: '__cm_sub' }, `HP ${formatNumber(Math.max(0, s.hp))}/${formatNumber(cur.hp)}`),
        ),
      );
    }

    /**
     * Werte in einer Zeile — dieselben fuenf Zahlen wie im Vertrag, aber aus
     * der EXAKTEN Leiter (BigInt) und durch `formatNumber`: in Millionenhöhe mit
     * Trennzeichen, in Billionenhöhe immer noch als Ziffern und nicht als
     * „4.7e+298". Der Spieler soll die Nullen zaehlen koennen, nicht raten.
     */
    function StatsGrid({ stats }) {
      return h('div', { className: '__cm_stats' },
        [['HP', stats.hp], ['ATK', stats.atk], ['DEF', stats.def], ['AGI', stats.agi], ['INT', stats.int]]
          .map(([label, value]) => h('div', { className: '__cm_stat', key: label },
            h('span', { className: '__cm_stat-k' }, label),
            h('span', { className: '__cm_stat-v' }, formatNumber(value)))));
    }

    // ENTFERNT (WEG b): `Arena` + `ArenaSide` (`__cm_arena` im Panel `main`)
    // sind ins Dock gezogen (`WildDock`/`DockBattle`) — der Kampf laeuft im
    // Chat-Bereich. `startBattle`, `rest` und `useAbility` bleiben: als
    // Fenster-API und fuer den Dock-Kampf.
    // ENTFERNT (WEG b): `Arena` + `ArenaSide` (`__cm_arena` im Panel `main`)
    // sind ins Dock gezogen (`WildDock`/`DockBattle`) — der Kampf laeuft im
    // Chat-Bereich. `startBattle`, `rest` und `useAbility` bleiben: als
    // Fenster-API und fuer den Dock-Kampf.
    /**
     * ESKALATION: was eine Stufe ausmacht. Die Zahlen stehen formatiert da,
     * weil die Aussage die Zahl ist: Schwelle, Werte und Lohn wachsen
     * multiplikativ (x1,35 je Stufe), und der Lebenslauf steht daneben als
     * BigInt — in Millionenhöhe exakt und nicht gerundet. Der Stellensprung
     * (zwei- auf fuenfstellig) ist damit der Beweis der investierten Zeit und
     * keine Behauptung: er steht als Meilenstein mit Wert und Datum im Log.
     */
    function EscalationBlock({ s, lvl }) {
      const next = threshold(lvl + 1);
      const base = statsAtExact(s.species, 1);
      const ladder = statsAtExact(s.species, lvl);
      const peak = Math.max(0, Math.round(s.peakHit));
      const upcoming = MILESTONES.find((mark) => BigInt(mark) > s.damageTotal) ?? null;
      return h('div', { className: '__cm_block' },
        h('h3', null, `Eskalation — ${ESCALATION.perLevel} je Stufe`),
        h('ul', { className: '__cm_facts' },
          h('li', { key: 'threshold' },
            `Schwelle L${lvl + 1}: ${formatNumber(next)} XP (L1 ${formatNumber(threshold(1))}, L20 ${formatNumber(threshold(20))}, L50 ${formatNumber(threshold(50))})`),
          h('li', { key: 'stats' },
            `Werte L${lvl}: HP ${formatNumber(ladder.hp)} · ATK ${formatNumber(ladder.atk)} — auf L1: HP ${formatNumber(base.hp)} · ATK ${formatNumber(base.atk)} (Basislleiter, exakt)`),
          h('li', { key: 'cap' },
            `Decke: Level ${formatNumber(LEVEL_CAP)} — die Werte skalieren linear; darüber bleibt das Level auf der Decke`),
          h('li', { key: 'hit' }, `Groesster Treffer: ${formatNumber(peak)} (${digitsOf(peak)} Stellen)`),
          h('li', { key: 'total' }, `Lebenslauf: ${formatNumber(s.damageTotal)} Schaden in ${formatNumber(s.hits)} Treffern (BigInt, exakt)`),
          h('li', { key: 'digits' }, `Stellen: ${digitsOf(s.damageTotal)}`
            + (upcoming === null ? ' — alle Meilensteine erreicht' : ` — naechster Meilenstein ${formatNumber(upcoming)}`))),
        s.milestones.length === 0 ? null : h('ol', { className: '__cm_milestones' },
          s.milestones.slice(0, 5).map((entry, index) => h('li', { key: `${index}-${entry.at}` },
            `MEILENSTEIN ${formatNumber(entry.mark)}+ · ${entry.kind} · ${entry.label} → ${formatNumber(entry.value)} (${entry.digits} Stellen)`))));
    }

    /**
     * DAS REGELWERK, offen lesbar: Elementkreis, Synergie, Durchgriff, Buffs und
     * der Vererbungsbaum. Das System rechnet nicht klug, es schlaegt nach — wer
     * gewinnen will, muss die Tabelle lesen. Deshalb steht sie im Panel und
     * nicht in einer Hilfe.
     */
    function Rulebook({ s }) {
      const element = SPECIES[s.species].family;
      const lineage = LINEAGE[s.species] ?? {};
      const chain = [];
      let cursor = s.species;
      while (cursor !== undefined && cursor !== null && LINEAGE[cursor] !== undefined) {
        chain.push(cursor);
        cursor = LINEAGE[cursor].ancestor;
      }
      const abilityLabel = (id) => (ABILITIES.find((ability) => ability.id === id) ?? { label: id }).label;
      // Keine Matrix: die eigene Zeile als Zeichen (`×1,5 ▲` statt Tabelle).
      const row = Object.keys(ELEMENTS).map((defender) => {
        const hit = effectiveness(element, defender);
        return `${ELEMENTS[defender].label} ×${String(hit.factor).replace('.', ',')} ${hit.symbol}`;
      }).join(' · ');
      return h('div', { className: '__cm_block' },
        h('h3', null, 'Regelwerk (statisch)'),
        h('ul', { className: '__cm_facts' },
          h('li', { key: 'wirkung' }, `Wirkung (${ELEMENTS[element].label}): ${row}`),
          h('li', { key: 'own' },
            `Eigenes Element: ${ELEMENTS[element].label} — schlaegt ${ELEMENTS[ELEMENTS[element].beats].label}, verliert gegen ${ELEMENTS[ELEMENTS[element].losesTo].label}`),
          h('li', { key: 'synergy' },
            `Synergie: speziell ${SYNERGY[`${element}:speziell`]}x · physisch ${SYNERGY[`${element}:physisch`]}x`),
          h('li', { key: 'category' },
            `Durchgriff: physisch ${CATEGORY.physisch.defFactor} · speziell ${CATEGORY.speziell.defFactor}`),
          h('li', { key: 'buff' }, `Buffs: ${BUFFS.map((buff) => `${buff.label} ${buff.factor}x`).join(' · ')}`),
          h('li', { key: 'line' },
            `Linie: ${chain.map((id) => SPECIES[id].label).join(' → ')} (Abstammungstiefe ${lineage.depth ?? 1})`),
          h('li', { key: 'inherits' },
            `Erbfaehigkeiten: ${(lineage.inherits ?? []).map(abilityLabel).join(', ') || 'keine'}`)),
        h('p', { className: '__cm_sub' },
          'Der Schaden ist BaseDamage x Element x Synergie x Buff - DEF x Durchgriff — fuenf Nachschlagevorgaenge, kein Zweig.'));
    }

    /**
     * DIE SKINNER-BOX, offen: Quoten und Zaehler stehen da. Es gibt keine Gnade
     * und keinen Pity-Timer — nur die Zahl der Siege seit dem letzten Shiny,
     * damit die irrationale Erwartung eine Anzeige hat.
     */
    function DropLedger({ s }) {
      return h('div', { className: '__cm_block' },
        h('h3', null, `Beute — ${formatNumber(s.loot.shiny)} shiny`),
        h('ul', { className: '__cm_facts' },
          LOOT_TABLE.map((entry) => h('li', { key: entry.id },
            `${entry.label}: ${lootOdds(entry)} % — ${formatNumber(s.loot[entry.id] ?? 0)} gefunden`)),
          h('li', { key: 'streak' }, `${formatNumber(s.sinceShiny)} Siege seit dem letzten Shiny`)),
        s.drops.length === 0 ? null : h('ul', { className: '__cm_log' },
          s.drops.slice(0, 5).map((drop, index) => h('li', { key: `${index}-${drop.at}` }, `${drop.label} (Gegner L${drop.level})`))));
    }

    /** Bilanz und Log. Die Zahlen kommen aus dem Store, nicht aus der Darstellung. */
    function Ledger({ s }) {
      return h('div', { className: '__cm_block' },
        h('h3', null, `Bilanz — ${s.wins} Siege / ${s.losses} K.o.`),
        h('p', { className: '__cm_sub' },
          '1 XP pro Token · Sieg XP nach Gegner-Level (multiplikativ) · jede Runde verzoegert, kein Input waehrend eines Zuges'),
        h('ul', { className: '__cm_log' },
          s.log.slice(0, 12).map((line, index) => h('li', { key: `${index}-${line}` }, line))));
    }

    /**
     * Die Kampf-Textbox: tippt die letzte Log-Zeile Zeichen fuer Zeichen
     * (Gen-1), mit blinkendem Cursor. Reine Darstellung — der Text steht,
     * bevor das erste Zeichen faellt. Mit `prefers-reduced-motion` oder ohne
     * Timer-Umgebung steht die Zeile sofort da.
     */
    function TypeLine({ text }) {
      const [shown, setShown] = React.useState(text);
      React.useEffect(() => {
        if (shown !== text) return undefined;
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
        setShown('');
        let i = 0;
        const timer = window.setInterval(() => {
          i += 1;
          setShown(text.slice(0, i));
          if (i >= text.length) window.clearInterval(timer);
        }, 24);
        return () => window.clearInterval(timer);
      }, [text]);
      return h('p', { className: '__cm_type' }, shown, h('span', { className: '__cm_cursor' }, '▌'));
    }

    /**
     * Die Sperre als eigene Zeile: Balken ueber die Vertragsdauer, Absagesatz
     * aus dem Vertrag, Zaehler der kalten Abweisungen. Auch ohne Kampf — ein
     * beginnender Zug (`start`, `challenge`) hat noch kein `battle`.
     */
    function LockNotice({ s }) {
      if (s.lock === null) return null;
      return h('div', { className: '__cm_lock' },
        h('span', { className: '__cm_lock-text' }, PACING.lockedText),
        h('span', { className: '__cm_lock-track' },
          h('span', { className: '__cm_lock-fill', style: { animationDuration: `${roundDelayMs}ms` } })),
        h('span', { className: '__cm_sub' },
          `Zug ${s.lock.action} — ${s.rejections} abgewiesene Eingabe${s.rejections === 1 ? '' : 'n'}`));
    }

    /**
     * Der Kampf im Dock (Gen-1): Gegner von vorn, eigenes von hinten — ECHTE
     * Sprites aus den Gittern, keine Familien-Platzhalter. Der HP-Balken
     * leert sich ueber die Breiten-Transition, der Treffer schuettelt ueber
     * einen Neuaufbau (`key` = HP: neues HP, neue Einblendung, Wackeln plus
     * Blinken). Ergebnis, Schaden und Log kommen aus `damage` — hier steht
     * nur, was der Zustand schon weiss.
     */
    function DockBattle({ s, lvl }) {
      const battle = s.battle;
      // Die Arena rechnet mit den EFFEKTIVEN Werten (mit Zuchtboni) — wie der
      // Kampf selbst und wie das Panel. Vorher stand hier die Basisleiter, und
      // der eigene Balken war kleiner als das, was der Kampf abzog.
      const mine = stats();
      const learned = abilitiesFor(lvl, s.species);
      const locked = s.lock !== null;
      const myTurn = battle.over === null && battle.turn === 'challenger';
      const eff = effectiveness(SPECIES[s.species].family, battle.element);
      const factor = String(eff.factor).replace('.', ',');
      return h('div', { className: '__cm_dock __cm_fight', 'data-plugin': PLUGIN },
        h(LockNotice, { s }),
        h('div', { className: '__cm_board' },
          h('div', { className: '__cm_side __cm_side--enemy' },
            h('span', {
              key: `enemy-${battle.hp}`,
              className: '__cm_hit',
              dangerouslySetInnerHTML: { __html: speciesSprite(battle.speciesId, 'front', 64) },
            }),
            h('div', { className: '__cm_side-id' },
              h('strong', null, `${SPECIES[battle.speciesId].label} L${battle.level}`),
              h(Bar, { value: battle.hp, max: battle.maxHp, tone: 'enemy' }),
              h('span', { className: '__cm_sub' }, `HP ${formatNumber(Math.max(0, battle.hp))}/${formatNumber(battle.maxHp)}`))),
          h('span', { className: '__cm_vs' }, 'VS'),
          h('div', { className: '__cm_side __cm_side--own' },
            h('span', {
              key: `own-${s.hp}`,
              className: '__cm_hit',
              dangerouslySetInnerHTML: { __html: speciesSprite(s.species, 'back', 64) },
            }),
            h('div', { className: '__cm_side-id' },
              h('strong', null, `${s.name} L${lvl}`),
              h(Bar, { value: s.hp, max: mine.hp, tone: 'hp' }),
              h('span', { className: '__cm_sub' }, `HP ${formatNumber(Math.max(0, s.hp))}/${formatNumber(mine.hp)}`))),
        ),
        h('p', { className: '__cm_sub' },
          `Wirkung ${ELEMENTS[SPECIES[s.species].family].label} → ${ELEMENTS[battle.element].label}: ×${factor} ${eff.symbol}`),
        h('div', { className: '__cm_actions' },
          learned.map((ability) => h('button', {
            key: ability.id,
            type: 'button',
            className: '__cm_move',
            disabled: locked || !myTurn,
            title: `${ability.kind} · ${ability.stat.toUpperCase()} ${ability.power}`,
            onClick: () => useAbility(ability.id),
          },
            h('span', { className: '__cm_move-name' }, ability.label),
            h('span', { className: '__cm_move-meta' }, `${ability.kind} · ${ability.stat.toUpperCase()} ${ability.power}`))),
        ),
        h('div', { className: '__cm_actions' },
          h('button', {
            type: 'button',
            className: '__cm_btn',
            disabled: locked || battle.over !== null,
            onClick: () => fleeBattle(),
          }, 'Rückzug'),
          h('span', { className: '__cm_sub' }, locked
            ? 'gesperrt — das Ergebnis kommt verzoegert'
            : (battle.turn === 'challenger' ? 'Du bist am Zug' : 'Gegner ist am Zug'))),
        h(TypeLine, { text: s.log[0] ?? '…' }),
      );
    }

    /**
     * Ball, Wurf und Wild im Dock: Der Ball (Shinon-Ball aus UI_SVG) fliegt
     * per CSS ein und verblasst, das Wilde blendet verzoegert ein — ohne einen
     * einzigen Timer im Zustand. Ein Klick fordert heraus, der zweite Knopf
     * laesst entkommen. Leerstand rendert nichts.
     */
    function WildDock() {
      const s = useStore();
      const lvl = levelFor(s.xp);
      if (s.battle !== null) return h(DockBattle, { s, lvl });
      // Ein beginnender Zug hat noch keinen Kampf, aber eine Sperre — und die
      // ist sichtbar, nicht ein leeres Dock. Die Knoepfe stehen dabei, kalt
      // gesperrt: kein Klick wird eingereiht.
      if (s.lock !== null) {
        const learned = abilitiesFor(lvl, s.species);
        return h('div', { className: '__cm_dock __cm_fight', 'data-plugin': PLUGIN },
          h(LockNotice, { s }),
          h('div', { className: '__cm_actions' },
            learned.map((ability) => h('button', {
              key: ability.id,
              type: 'button',
              className: '__cm_move',
              disabled: true,
              title: 'Gesperrt — das Ergebnis kommt verzoegert',
              onClick: () => useAbility(ability.id),
            },
              h('span', { className: '__cm_move-name' }, ability.label),
              h('span', { className: '__cm_move-meta' }, `${ability.kind} · ${ability.stat.toUpperCase()} ${ability.power}`))),
          ));
      }
      if (s.wild === null) return null;
      const wild = s.wild;
      const label = SPECIES[wild.speciesId].label;
      return h('div', { className: '__cm_dock', 'data-plugin': PLUGIN },
        h('button', {
          type: 'button',
          className: '__cm_wild',
          title: `${label} L${wild.level} herausfordern`,
          onClick: () => challengeWild(),
        },
          h('span', { className: '__cm_ball', dangerouslySetInnerHTML: { __html: uiSvg('ball', 40) } }),
          h('span', { className: '__cm_wild-sprite', dangerouslySetInnerHTML: { __html: speciesSprite(wild.speciesId, 'front', 64) } }),
          h('span', { className: '__cm_sub' }, `Ein wilder ${label} L${wild.level} erscheint!`),
          h('span', { className: '__cm_sub' }, 'Klicken zum Kämpfen')),
        h('button', {
          type: 'button',
          className: '__cm_btn',
          onClick: () => fleeWild(),
        }, 'Fliehen'),
      );
    }

    /**
     * Das Kampfergebnis fuer `conversation.chat.turnTail`: eine Zeile je
     * beendeten Kampf, gelesen aus `lastResult`. Kein Kampf, keine Zeile.
     */
    function BattleResult() {
      const s = useStore();
      if (s.lastResult === null) return null;
      const result = s.lastResult;
      const label = SPECIES[result.speciesId].label;
      const text = result.outcome === 'win'
        ? `Sieg gegen ${label} L${result.level} — +${formatNumber(result.reward)} XP`
        : result.outcome === 'loss'
          ? `K.o. gegen ${label} L${result.level} — das Codemon rappelt sich wieder auf`
          : `Rückzug gegen ${label} L${result.level}`;
      return h('div', { className: '__cm_result', 'data-plugin': PLUGIN },
        h('span', { className: '__cm_result-mark', dangerouslySetInnerHTML: { __html: speciesGlyph(result.speciesId, result.level, 18) } }),
        h('span', null, text));
    }

    function BreedingPanel({ s }) {
      const breeding = s.breeding ?? { creatures: [], eggs: [] };
      const creatures = breeding.creatures ?? [];
      const [parentA, setParentA] = React.useState(creatures[0]?.id ?? '');
      const [parentB, setParentB] = React.useState(creatures[1]?.id ?? '');
      const [selectedSpecies, setSelectedSpecies] = React.useState('');
      const [notice, setNotice] = React.useState('');
      const a = creatures.find((creature) => creature.id === parentA);
      const b = creatures.find((creature) => creature.id === parentB);
      const candidates = breedingCandidates(a, b);
      const effectiveChoice = candidates.includes(selectedSpecies) ? selectedSpecies : (candidates[0] ?? '');
      const clutch = a && b ? 1 + Math.max(a.clutch, b.clutch) : 0;
      const canPair = Boolean(a && b && a.id !== b.id && candidates.length > 0
        && s.loot.brauchbar >= clutch && (candidates.length === 1 || candidates.includes(effectiveChoice))
        && s.lock === null && s.battle === null);
      return h('section', { className: '__cm_block __cm_breeding', 'aria-label': 'Sammlung und Zucht' },
        h('h3', null, `Sammlung & Zucht · ${creatures.length}/50 · ${breeding.eggs?.length ?? 0} Eier`),
        h('div', { className: '__cm_roster' }, creatures.map((creature) => h('button', {
          key: creature.id, type: 'button',
          className: `__cm_roster-card${creature.id === breeding.active ? ' is-active' : ''}`,
          onClick: () => selectCreature(creature.id),
          'aria-pressed': creature.id === breeding.active,
        },
          h('span', { className: '__cm_roster-art', dangerouslySetInnerHTML: { __html: speciesGlyph(creature.species, levelFor(creature.xp), 42) } }),
          h('span', { className: '__cm_roster-label' }, SPECIES[creature.species].label),
          h('span', { className: '__cm_roster-meta' }, `Gen ${creature.gen} · L${levelFor(creature.xp)} · ZE ${creature.bxp}`),
          creature.id === breeding.active ? h('span', { className: '__cm_roster-active' }, 'AKTIV') : null))),
        h('div', { className: '__cm_breed-form' },
          h('label', { className: '__cm_pick' }, h('span', null, 'Elternteil A'),
            h('select', { value: a?.id ?? '', onChange: (event) => { setParentA(event.target.value); setSelectedSpecies(''); } },
              creatures.map((creature) => h('option', { key: creature.id, value: creature.id }, `${SPECIES[creature.species].label} · ${creature.id}`)))),
          h('label', { className: '__cm_pick' }, h('span', null, 'Elternteil B'),
            h('select', { value: b?.id ?? '', onChange: (event) => { setParentB(event.target.value); setSelectedSpecies(''); } },
              creatures.map((creature) => h('option', { key: creature.id, value: creature.id }, `${SPECIES[creature.species].label} · ${creature.id}`)))),
          candidates.length > 1 ? h('label', { className: '__cm_pick' },
            h('span', null, 'Nachkomme'),
            h('select', { value: effectiveChoice, onChange: (event) => setSelectedSpecies(event.target.value) },
              candidates.map((id) => h('option', { key: id, value: id }, SPECIES[id].label)))) : null,
          h('p', { className: '__cm_sub' },
            a && b ? `Kosten: ${clutch} brauchbare Teile · ${candidates.length} gültige Art(en) · Brut je Completion +${BP_PER_COMPLETION} BP`
              : 'Zwei verschiedene Kreaturen auswählen, um die gültigen Nachkommen zu sehen.'),
          h('button', { type: 'button', className: '__cm_btn', disabled: !canPair,
            onClick: () => {
              try {
                const result = pairCreatures(parentA, parentB, candidates.length > 1 ? effectiveChoice : undefined);
                setNotice(result ? `Ei ${result.eggId} angelegt: ${SPECIES[result.species].label}` : 'Zucht wartet, bis kein Zug läuft.');
                setSelectedSpecies('');
              } catch (error) { setNotice(error?.message ?? 'Paarung abgelehnt'); }
            } }, 'Paarung starten'),
          h('span', { className: '__cm_sub' }, `${s.loot.brauchbar} brauchbare Teile verfügbar`),
          notice ? h('p', { className: '__cm_breed-notice', role: 'status' }, notice) : null),
        (breeding.eggs ?? []).length === 0 ? h('p', { className: '__cm_sub' }, 'Keine Eier in Brut. Ein Ei erhält pro bestätigter Completion genau +10 BP und schlüpft ab 120 BP.')
          : h('div', { className: '__cm_eggs' }, breeding.eggs.map((egg) => h('div', { className: '__cm_egg', key: egg.id },
            h('div', { className: '__cm_egg-heading' },
              h('strong', null, `${egg.id} · ${SPECIES[egg.species].label}`),
              h('span', { className: '__cm_sub' }, `Gen ${egg.gen} · ${egg.bonuses.length} Bonus${egg.bonuses.length === 1 ? '' : 'e'}`)),
            h(Bar, { value: Math.min(HATCH_BP, egg.bp), max: HATCH_BP, tone: 'xp' }),
            h('p', { className: '__cm_sub' }, `${egg.bp}/${HATCH_BP} Brutpunkte · ${Math.max(0, Math.ceil((HATCH_BP - egg.bp) / BP_PER_COMPLETION))} bestätigte Completions bis Schlupf`),
            egg.bonuses.length ? h('p', { className: '__cm_sub' }, egg.bonuses.map((bonus) => `${bonus.id} +${bonus.value}`).join(' · ')) : null))));
    }

    // ── Encounter-Buehne (S5) ────────────────────────────────────────────────
    /**
     * Die Buehne haelt KEINEN zweiten Zustand. `encounter` ist genau das, was
     * `reduceEncounter` zurueckgibt — jede Aenderung geht durch den Reducer,
     * und gerendert wird, was er liefert. `encounterLog` ist das Protokoll der
     * EINGABEN (Typ, Ergebnis, Grund), keine Zustandsquelle: wer den Zustand
     * sucht, liest ihn aus `encounter`, nicht aus der Liste.
     *
     * Der Uebungszug ist ein LOKALER Erzeuger von Vertragsereignissen, kein
     * Modell-Turn: der Host meldet echte Signale erst in einem spaeteren
     * Schnitt. Deshalb steht "Uebungszug" an der Buehne, und deshalb kann die
     * Buehne auch still bleiben, wenn niemand sie startet.
     */
    let encounter = createEncounterState();
    let encounterLog = [];
    let encounterSeq = 0;
    /** Timer des Uebungszugs. Ausserhalb des Zustands, wie jeder Handle. */
    const encounterTimers = new Set();

    const ENCOUNTER_TITLES = {
      closed: 'bereit',
      preflight: 'Vorflug',
      running: 'läuft',
      validating: 'Prüfung',
      completed: 'abgeschlossen',
      rejected: 'abgewiesen',
      aborted: 'abgebrochen',
      'recoverable-error': 'Fehler',
      compact: 'verdichtet',
    };
    const ENCOUNTER_RAIL = [
      { status: 'preflight', label: 'Vorflug' },
      { status: 'running', label: 'Lauf' },
      { status: 'validating', label: 'Prüfung' },
      { status: 'completed', label: 'Abschluss' },
    ];
    /** Die Bilanz in Worten — der Vertragsname bleibt im `title`, nicht im Satz. */
    const ENCOUNTER_OUTCOMES = {
      'contract-passed': 'Vertrag bestanden',
      'contract-failed': 'Vertrag verfehlt',
      neutral: 'neutral abgeschlossen',
      aborted: 'abgebrochen',
      error: 'Fehler',
    };
    const ENCOUNTER_VERDICTS = { APPLIED: 'angewandt', IGNORED: 'ignoriert', REJECTED: 'abgewiesen' };
    // Die Schiene liest den Zustand, nicht die Terminal-Farbe: `aborted` und
    // `rejected` tragen ihre Herkunft in `lastPhase` (Vertrag, nicht Buehnen-
    // Wissen). Vorher stand hier fuer jedes Terminal pauschal "Pruefung" — eine
    // Anzeige, die einen Abbruch im Vorflug als Pruefungsabbruch verkaufte.
    const ENCOUNTER_PHASE = {
      closed: -1, preflight: 0, running: 1, validating: 2, completed: 3, compact: 3,
      rejected: -1, aborted: -1, 'recoverable-error': -1,
    };

    /**
     * Der Uebungszug als DATEN. Jede Zeile ist ein Vertragsereignis aus der
     * Tabelle; die Buehne erfindet keines und schreibt keine zweite Liste —
     * `ENCOUNTER_EVENTS` bleibt die Quelle, hier steht nur die Reihenfolge.
     * Die Nutzlast haelt sich an die Allowlist des jeweiligen Ereignisses.
     */
    const ENCOUNTER_DRILL = [
      ['encounter.turn.started', {}],
      ['encounter.task.classified', { taskClass: 'fix', taskLabel: 'Reparatur' }],
      ['encounter.index.progress', { phase: 'scan', count: 12 }],
      ['encounter.fact.validated', { snapshotId: 'snap-uebung', valid: 3, untrusted: 1, unknown: 0 }],
      ['encounter.block.selected', { blocks: ['persona-identity-core', 'enhancer-system-policy'] }],
      ['encounter.preflight.ready', {}],
      ['encounter.route.selected', { provider: 'lokal', model: 'uebungszug' }],
      ['encounter.run.started', { step: 1 }],
      ['encounter.tool.started', { callId: 'call-1', name: 'read_file' }],
      ['encounter.tool.completed', { callId: 'call-1', ok: true }],
      ['encounter.answer.received', {}],
      ['encounter.result-contract.passed', { contract: 'shinon.result/v1' }],
      ['encounter.turn.completed', { reason: 'completed' }],
      ['encounter.receipt.compacted', {}],
    ];
    const ENCOUNTER_TICK_MS = 650;

    /**
     * Ein Ereignis durch den Reducer schicken. Das Ergebnis (outcome, reason)
     * ist die Antwort an den Aufrufer; der Zustand selbst ist danach der neue
     * `encounter`. Kein Wurf, kein stiller Fall: ein abgewiesenes Ereignis
     * nennt seinen Grund.
     */
    function encounterFeed(event) {
      const step = reduceEncounter(encounter, event);
      encounter = step.state;
      encounterLog = [{
        id: typeof event?.eventId === 'string' ? event.eventId : null,
        type: typeof event?.type === 'string' ? event.type : '?',
        outcome: step.outcome,
        reason: step.reason,
        at: Date.now(),
      }, ...encounterLog].slice(0, 8);
      emit();
      return { outcome: step.outcome, reason: step.reason, status: encounter.status };
    }

    /** Die naechste Huelle — gebaut vom Kern, damit Form und ID-Regel eine Quelle haben. */
    const encounterNext = (type, turnId, payload) => encounterEvent(type, {
      eventId: `enc-${(encounterSeq += 1)}`,
      turnId,
      sessionId: typeof store.sessionId === 'string' ? store.sessionId : 'lokal',
      payload,
    });

    /** Jeden laufenden Timer des Uebungszugs abraeumen (Abbruch, Neustart, Abbau). */
    function encounterStop() {
      for (const id of encounterTimers) window.clearTimeout(id);
      encounterTimers.clear();
    }

    /** Den Uebungszug starten. Nur aus `closed` — sonst gibt es nichts zu starten. */
    function encounterStart() {
      // `encounterTimers.size` ist die Wache gegen den Doppelklick: der Status
      // steht in den ersten Millisekunden noch auf `closed`, waehrend der
      // Uebungszug schon laeuft. Ein zweiter Klick wuerde einen zweiten Zug mit
      // fremder turnId starten — der Reducer wiese jedes zweite Ereignis als
      // FOREIGN_TURN ab, und der Nutzer saehe eine Absage fuer seinen eigenen
      // Klick. Also: solange etwas laeuft, gibt es nichts zu starten.
      if (encounter.status !== 'closed' || encounterTimers.size > 0) return null;
      encounterStop();
      const turnId = `turn-${Date.now()}`;
      ENCOUNTER_DRILL.forEach(([type, payload], index) => {
        const id = window.setTimeout(() => {
          encounterTimers.delete(id);
          encounterFeed(encounterNext(type, turnId, payload));
        }, index * ENCOUNTER_TICK_MS + 1);
        encounterTimers.add(id);
      });
      return { turnId, steps: ENCOUNTER_DRILL.length, tickMs: ENCOUNTER_TICK_MS };
    }

    /** Abbrechen: der Reducer entscheidet `aborted`, die Buehne raeumt nur die Timer. */
    function encounterAbort() {
      if (encounter.status === 'closed' || ENCOUNTER_TERMINAL_STATES.includes(encounter.status)) return null;
      encounterStop();
      return encounterFeed(encounterNext('encounter.abort', encounter.turnId ?? 'turn-abort', { reason: 'Nutzer' }));
    }

    /** Zurueck auf Anfang. `silent` fuer den Start, der ohnehin gleich rendert. */
    function encounterReset(silent = false) {
      encounterStop();
      encounter = createEncounterState();
      encounterLog = [];
      if (!silent) emit();
    }

    /** Die Kurzzeile unter dem Titel — was der Zustand hergibt, nichts daneben. */
    function encounterSummary(s) {
      const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
      if (s.status === 'closed') return `Übungszug · ${ENCOUNTER_DRILL.length} Schritte · wartet auf Start`;
      if (s.status === 'compact') {
        return `Bilanz: ${ENCOUNTER_OUTCOMES[s.outcome?.kind] ?? 'ohne Ergebnis'} · ${count(s.applied, 'Ereignis', 'Ereignisse')}`;
      }
      const parts = [count(s.applied, 'Ereignis', 'Ereignisse')];
      if (s.preflight.route !== null) parts.push(`${s.preflight.route.provider}/${s.preflight.route.model}`);
      if (s.preflight.blocks.length > 0) parts.push(count(s.preflight.blocks.length, 'Block', 'Blöcke'));
      if (s.tools.calls > 0) parts.push(`${count(s.tools.calls, 'Werkzeug', 'Werkzeuge')}${s.tools.open > 0 ? ` (${s.tools.open} offen)` : ''}`);
      if (s.facts.valid > 0) parts.push(count(s.facts.valid, 'Fakt', 'Fakten'));
      return parts.join(' · ');
    }

    /**
     * Die Buehne: eine Kopfzeile mit Status und Bedienung, eine Vier-Stufen-
     * Schiene und das letzte Ereignis mit seinem Ausgang. Sie steht im
     * Composer-Dock, also in jeder Sitzung; sie ist trotzdem still, solange
     * niemand einen Zug startet.
     */
    function EncounterStage() {
      useStore();
      const s = encounter;
      const finished = s.status === 'completed' || s.status === 'compact';
      const terminal = s.status === 'compact' || ENCOUNTER_TERMINAL_STATES.includes(s.status);
      const phase = finished ? 3 : (ENCOUNTER_PHASE[s.status] ?? -1) >= 0
        ? ENCOUNTER_PHASE[s.status]
        : (ENCOUNTER_PHASE[s.lastPhase] ?? -1);
      const last = encounterLog[0] ?? null;
      const buttons = [];
      if (s.status === 'closed') {
        buttons.push(h('button', {
          key: 'start', type: 'button', className: '__cm_enc-btn',
          title: 'Übungszug starten: 14 Vertragsereignisse durch den Reducer',
          onClick: () => encounterStart(),
        }, 'Zug starten'));
      } else if (!terminal) {
        buttons.push(h('button', {
          key: 'abort', type: 'button', className: '__cm_enc-btn',
          title: 'Zug abbrechen (encounter.abort)',
          onClick: () => encounterAbort(),
        }, 'Abbrechen'));
      } else {
        buttons.push(h('button', {
          key: 'reset', type: 'button', className: '__cm_enc-btn',
          title: 'Bühne zurücksetzen (neuer Zustand, keine Altlast)',
          onClick: () => encounterReset(),
        }, 'Neu'));
      }
      return h('div', {
        className: '__cm_enc',
        'data-plugin': PLUGIN,
        'data-status': s.status,
        title: 'Encounter: der Lauf eines Auftrags in vier Stufen (Vorflug, Lauf, Prüfung, Abschluss). Der Übungszug zeigt die Bühne ohne Modell-Turn.',
      },
        h('div', { className: '__cm_enc-head' },
          h('span', { className: '__cm_enc-title' }, 'Encounter'),
          h('span', { className: '__cm_enc-chip', 'data-status': s.status }, ENCOUNTER_TITLES[s.status] ?? s.status),
          h('span', { className: '__cm_enc-meta', role: 'status', 'aria-live': 'polite' }, encounterSummary(s)),
          h('span', { className: '__cm_enc-actions' }, buttons)),
        h('ol', { className: '__cm_enc-rail' },
          ENCOUNTER_RAIL.map((step, index) => h('li', {
            key: step.status,
            className: '__cm_enc-step',
            'data-state': finished ? 'done' : index < phase ? 'done' : index === phase ? 'active' : 'open',
          },
            h('span', { className: '__cm_enc-dot', 'aria-hidden': 'true' }),
            h('span', null, step.label)))),
        last === null ? null : h('p', {
          className: '__cm_enc-log',
          title: `${last.type} · ${last.outcome}${last.reason === null ? '' : ` (${last.reason})`}`,
        }, `${last.type.replace('encounter.', '')} · ${ENCOUNTER_VERDICTS[last.outcome] ?? last.outcome}${last.reason === null ? '' : ` · ${last.reason}`}`),
      );
    }

    function CodingmonPanel() {
      const s = useStore();
      const lvl = levelFor(s.xp);
      // Angezeigt wird die EXAKTE Leiter, gerechnet die schnelle Number-Fassung.
      const exact = Object.fromEntries(Object.entries(stats()).map(([key, value]) => [key, BigInt(value)]));

      // Der Kampf wohnt im Dock (WildDock), nicht hier: `main` zeigt Stand,
      // Regelwerk ohne Tabelle, Beute und Bilanz.
      return h('div', { className: '__cm_panel' },
        h(PetHead, { s, lvl, onPick: selectCreature }),
        h(StatsGrid, { stats: exact }),
        h(BreedingPanel, { s }),
        h(EscalationBlock, { s, lvl }),
        h(Rulebook, { s }),
        h(DropLedger, { s }),
        h(Ledger, { s }),
      );
    }

    // ── Styles ──────────────────────────────────────────────────────────────
    function insertStyles(tag, css) {
      if (document.querySelector(`style[data-plugin-css="${tag}"]`) !== null) return;
      const style = document.createElement('style');
      style.dataset.plugin = PLUGIN;
      style.dataset.pluginCss = tag;
      style.textContent = css;
      document.head.appendChild(style);
    }

    insertStyles(`${PLUGIN}/codingmon.css`, `
      .__cm_mark { display: inline-flex; align-items: center; }
      .__cm_panel { padding: 14px; height: 100%; overflow: auto; color: var(--dsw-alias-label-primary, #E0E7FF);
        font-family: var(--shinon-font-body, ui-sans-serif, system-ui, sans-serif); }
      .__cm_panel-head { display: flex; gap: 14px; align-items: center; margin-bottom: 14px; }
      .__cm_panel-stage { display: flex; flex-direction: column; align-items: center; gap: 6px; }
      .__cm_panel-id { flex: 1; }
      .__cm_panel-id h2 { margin: 0; font-family: var(--shinon-font-head, ui-sans-serif); letter-spacing: .06em; }
      .__cm_sub { margin: 2px 0; font-size: 12px; color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_xp { margin: 6px 0 4px; font-size: 12px; }
      .__cm_pick { display: flex; align-items: center; gap: 6px; margin: 6px 0; font-size: 12px; }
      .__cm_pick select { flex: 1; background: rgba(255,255,255,.05); color: inherit; border-radius: 5px;
        border: 1px solid rgba(124,58,237,.45); padding: 3px 6px; font: inherit; }
      .__cm_bar { height: 6px; border-radius: 3px; background: rgba(255,255,255,.12); overflow: hidden; min-width: 120px; margin: 2px 0; }
      .__cm_bar-fill { height: 100%; background: var(--shinon-gradient, linear-gradient(115deg,#7C3AED,#6366F1)); transition: width .25s ease; }
      .__cm_bar[data-tone="hp"] .__cm_bar-fill { background: linear-gradient(90deg,#22c55e,#84cc16); }
      .__cm_bar[data-tone="enemy"] .__cm_bar-fill { background: linear-gradient(90deg,#ef4444,#f59e0b); }
      .__cm_btn, .__cm_move { font-size: 11px; padding: 4px 9px; border-radius: 5px; cursor: pointer;
        background: rgba(124,58,237,.18); color: inherit; border: 1px solid rgba(124,58,237,.45); }
      .__cm_btn:disabled, .__cm_move:disabled { opacity: .45; cursor: not-allowed; }
      .__cm_move { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 132px; }
      .__cm_stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(64px,1fr)); gap: 8px; margin-bottom: 14px; }
      .__cm_stat { display: flex; flex-direction: column; gap: 2px; padding: 6px 8px; border-radius: 6px;
        background: var(--dsw-alias-bg-layer-1, rgba(255,255,255,.04)); }
      .__cm_stat-k { font-size: 10px; letter-spacing: .1em; color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_stat-v { font-size: 15px; font-weight: 700; }
      .__cm_block { margin-bottom: 14px; }
      .__cm_block h3 { margin: 0 0 6px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase;
        color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_breeding { border-top: 1px solid rgba(124,58,237,.25); padding-top: 12px; }
      .__cm_roster { display: grid; grid-template-columns: repeat(auto-fit,minmax(135px,1fr)); gap: 8px; margin: 8px 0 12px; }
      .__cm_roster-card { display: grid; grid-template-columns: 42px 1fr; grid-template-rows: auto auto auto; gap: 2px 7px; align-items: center; text-align: left; padding: 7px; color: inherit; background: rgba(255,255,255,.035); border: 1px solid rgba(124,58,237,.23); border-radius: 8px; cursor: pointer; min-width: 0; }
      .__cm_roster-card.is-active { border-color: var(--cm-spark, #57e8ff); box-shadow: inset 0 0 0 1px rgba(87,232,255,.25); }
      .__cm_roster-art { grid-row: 1 / span 3; display: block; width: 42px; height: 42px; }
      .__cm_roster-art svg { width: 42px !important; height: 42px !important; }
      .__cm_roster-label { font-size: 11px; font-weight: 700; overflow-wrap: anywhere; }
      .__cm_roster-meta, .__cm_roster-active { font-size: 10px; color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_roster-active { color: #57e8ff; letter-spacing: .08em; }
      .__cm_breed-form { display: grid; gap: 4px; padding: 8px; border: 1px solid rgba(124,58,237,.22); border-radius: 8px; }
      .__cm_breed-notice { margin: 4px 0 0; font-size: 12px; }
      .__cm_eggs { display: grid; gap: 8px; margin-top: 8px; }
      .__cm_egg { padding: 8px; border: 1px solid rgba(87,232,255,.25); border-radius: 8px; }
      .__cm_egg-heading { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px; font-size: 12px; }
      @media (max-width: 420px) { .__cm_board { grid-template-columns: 1fr; } .__cm_vs { text-align: center; } }
      .__cm_board { display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; align-items: center;
        padding: 10px; border-radius: 8px; background: var(--dsw-alias-bg-layer-1, rgba(255,255,255,.04));
        border: 1px solid rgba(124,58,237,.25); }
      .__cm_side { display: flex; gap: 10px; align-items: center; }
      .__cm_side--enemy { flex-direction: row-reverse; text-align: right; }
      .__cm_side-id { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .__cm_side-id strong { font-size: 13px; }
      .__cm_vs { font-size: 11px; letter-spacing: .2em; color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; }
      .__cm_move-name { font-weight: 600; }
      .__cm_move-meta { font-size: 10px; color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_log { list-style: none; margin: 0; padding: 0; font-size: 12px; }
      .__cm_log li { padding: 2px 0; color: var(--dsw-alias-label-secondary, #9aa); }

      /* Encounter-Buehne (S5): eine Zeile Kopf, eine Schiene, ein Log. */
      .__cm_enc { display: flex; flex-direction: column; gap: 5px; width: 100%;
        padding: 6px 8px; margin-bottom: 6px; border-radius: 6px;
        background: color-mix(in srgb, var(--shinon-void, #0B0F14) 45%, transparent);
        border: 1px solid color-mix(in srgb, var(--shinon-violet, #7C3AED) 35%, transparent);
        font-family: var(--shinon-font-body, ui-sans-serif, system-ui, sans-serif); font-size: 11px; }
      .__cm_enc-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .__cm_enc-title { font-weight: 700; letter-spacing: .08em; text-transform: uppercase; font-size: 10px; }
      .__cm_enc-chip { padding: 1px 7px; border-radius: 999px; font-size: 10px; letter-spacing: .06em;
        text-transform: uppercase; border: 1px solid rgba(255,255,255,.18); color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_enc-chip[data-status="running"], .__cm_enc-chip[data-status="validating"] {
        color: #A855F7; border-color: rgba(168,85,247,.55); }
      .__cm_enc-chip[data-status="completed"], .__cm_enc-chip[data-status="compact"] {
        color: #22c55e; border-color: rgba(34,197,94,.55); }
      .__cm_enc-chip[data-status="aborted"], .__cm_enc-chip[data-status="rejected"],
      .__cm_enc-chip[data-status="recoverable-error"] { color: #f59e0b; border-color: rgba(245,158,11,.55); }
      .__cm_enc-meta { flex: 1; min-width: 120px; color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_enc-actions { display: flex; gap: 6px; }
      .__cm_enc-btn { font-size: 11px; padding: 3px 9px; border-radius: 5px; cursor: pointer;
        background: rgba(124,58,237,.18); color: inherit; border: 1px solid rgba(124,58,237,.45); }
      .__cm_enc-rail { display: flex; gap: 6px; list-style: none; margin: 0; padding: 0; }
      .__cm_enc-step { display: flex; align-items: center; gap: 4px; font-size: 10px;
        color: var(--dsw-alias-label-secondary, #9aa); }
      .__cm_enc-dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,.2); }
      .__cm_enc-step[data-state="done"] { color: var(--dsw-alias-label-primary, #E0E7FF); }
      .__cm_enc-step[data-state="done"] .__cm_enc-dot { background: #7C3AED; }
      .__cm_enc-step[data-state="active"] { color: #A855F7; }
      .__cm_enc-step[data-state="active"] .__cm_enc-dot { background: #A855F7; box-shadow: 0 0 6px #A855F7; }
      .__cm_enc-log { margin: 0; font-size: 10px; color: var(--dsw-alias-label-secondary, #9aa);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

      /* Globale EXP-Leiste im Composer-Dock: sichtbar in jeder Sitzung. */
      .__cm_expbar { display: flex; align-items: center; gap: 8px; width: 100%;
        padding: 4px 8px; margin-bottom: 6px; border-radius: 6px;
        background: color-mix(in srgb, var(--shinon-void, #0B0F14) 45%, transparent);
        border: 1px solid color-mix(in srgb, var(--shinon-violet, #7C3AED) 35%, transparent);
        font-family: var(--shinon-font-body, ui-sans-serif, system-ui, sans-serif); font-size: 11px; }
      .__cm_expbar-pet { display: inline-flex; }
      .__cm_expbar-lvl { font-weight: 700; letter-spacing: .08em; color: var(--shinon-violet-light, #A855F7); }
      .__cm_expbar-track { flex: 1; height: 7px; border-radius: 4px; overflow: hidden; background: rgba(255,255,255,.12); }
      .__cm_expbar-fill { display: block; height: 100%; background: var(--shinon-gradient, linear-gradient(115deg,#7C3AED,#6366F1)); transition: width .3s ease; }
      .__cm_expbar-meta { color: var(--dsw-alias-label-secondary, #9aa); white-space: nowrap; }
      /* Idle-Wander: das Pet laeuft im XP-Leisten-Block hin und her.
         NUR transform (Compositor-Regel, siehe animation.test.mjs) —
         kein left/top/margin im Keyframe. prefers-reduced-motion schaltet
         es ab. */
      .__cm_expbar-wander { position: relative; width: 72px; height: 28px; flex: none; overflow: hidden; }
      .__cm_expbar-wander svg { position: absolute; left: 4px; top: 4px; }
      .__cm_expbar-wander[data-wander="on"] svg {
        animation-name: __cm_wander; animation-duration: 7s;
        animation-timing-function: ease-in-out; animation-iteration-count: infinite;
        transform: translateX(0); }
      @keyframes __cm_wander {
        0%   { transform: translateX(0) scaleX(1); }
        42%  { transform: translateX(34px) scaleX(1); }
        50%  { transform: translateX(34px) scaleX(-1); }
        92%  { transform: translateX(0) scaleX(-1); }
        100% { transform: translateX(0) scaleX(1); } }
      /* Praesentationszustand: combat, action, victory, defeat und flee sind
         ABGELEITET (siehe presentationState) und aendern nichts an der
         Mechanik — die steht in finish(), nicht in einer Animation. Die
         Endzustaende sind ein Fenster von 1,6 Sekunden, kein Zustand.
         Nur transform und opacity (Compositor-Regel, siehe animation.test.mjs).
         Jede Regel traegt [data-state], damit der Schalter
         prefers-reduced-motion (siehe unten) mit GLEICHER Spezifitaet
         gewinnen kann — siehe animation.test.mjs. */
      .__cm_expbar-wander[data-state="combat"] svg {
        animation-name: __cm_ready; animation-duration: 1.6s;
        animation-timing-function: ease-in-out; animation-iteration-count: infinite; }
      @keyframes __cm_ready {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); } }
      .__cm_expbar-wander[data-state="action"] svg {
        animation-name: __cm_lean; animation-duration: .5s; animation-timing-function: ease-in-out;
        animation-iteration-count: infinite; }
      @keyframes __cm_lean {
        0%, 100% { transform: translateX(0) scaleX(1); }
        50% { transform: translateX(3px) scaleX(1.04); } }
      .__cm_expbar-wander[data-state="victory"] svg {
        animation-name: __cm_victory; animation-duration: .6s; animation-timing-function: ease-out; }
      @keyframes __cm_victory {
        0% { transform: translateY(0) scale(1); }
        40% { transform: translateY(-5px) scale(1.12); }
        100% { transform: translateY(0) scale(1); } }
      .__cm_expbar-wander[data-state="defeat"] svg {
        animation-name: __cm_defeat; animation-duration: .6s; animation-timing-function: ease-in; }
      @keyframes __cm_defeat {
        0% { transform: translateY(0) scale(1); opacity: 1; }
        40% { transform: translateY(4px) scale(.94); opacity: .55; }
        100% { transform: translateY(0) scale(1); opacity: 1; } }
      .__cm_expbar-wander[data-state="flee"] svg {
        animation-name: __cm_flee; animation-duration: .5s; animation-timing-function: ease-in; }
      @keyframes __cm_flee {
        0% { transform: translateX(0); opacity: 1; }
        100% { transform: translateX(26px); opacity: 0; } }
      /* Die Sperre: Balken, Absagesatz, Zaehler der kalten Abweisungen. */
      .__cm_lock { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; margin-bottom: 10px;
        border-radius: 6px; background: rgba(239,68,68,.12); border: 1px solid rgba(239,68,68,.35); }
      .__cm_lock-text { font-size: 12px; font-weight: 600; color: #fca5a5; }
      .__cm_lock-track { height: 6px; border-radius: 3px; overflow: hidden; background: rgba(255,255,255,.14); }
      .__cm_lock-fill { display: block; height: 100%; width: 100%; transform: scaleX(0); transform-origin: left center;
        background: linear-gradient(90deg,#ef4444,#f59e0b); animation-name: __cm_lock-grow;
        animation-timing-function: linear; animation-fill-mode: forwards; }
      @keyframes __cm_lock-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      .__cm_facts { list-style: none; margin: 0 0 8px; padding: 0; font-size: 12px; }
      .__cm_facts li { padding: 2px 0; color: var(--dsw-alias-label-secondary, #9aa); }
      /* Dock: Ball, Wild und Kampf im Chat-Bereich (Gen-1). Alle Keyframes
         bewegen nur transform und opacity (Compositor-Regel, siehe
         animation.test.mjs) — kein margin/top/left im Keyframe. */
      .__cm_dock { display: flex; align-items: center; gap: 10px; width: 100%;
        padding: 6px 8px; margin-bottom: 6px; border-radius: 8px;
        background: #0B0F14; border: 1px solid rgba(168,85,247,.45);
        color: #E0E7FF;
        font-family: var(--shinon-font-body, ui-sans-serif, system-ui, sans-serif); font-size: 12px; }
      .__cm_fight { flex-direction: column; align-items: stretch; }
      .__cm_wild { display: flex; align-items: center; gap: 10px; background: none; border: none;
        color: inherit; font: inherit; cursor: pointer; padding: 0; text-align: left; }
      .__cm_ball { display: inline-flex; transform-origin: center;
        animation-name: __cm_throw; animation-duration: 1.1s; animation-timing-function: ease-in;
        animation-fill-mode: forwards; }
      @keyframes __cm_throw {
        0% { transform: translate(26px, -10px) rotate(-40deg); opacity: 0; }
        30% { transform: translate(12px, -4px) rotate(-12deg); opacity: 1; }
        70% { transform: translate(0, 2px) rotate(8deg); opacity: 1; }
        100% { transform: translate(0, 0) rotate(0); opacity: 0; } }
      .__cm_wild-sprite { display: inline-flex; opacity: 0;
        animation-name: __cm_wild-in; animation-duration: .4s; animation-timing-function: ease-out;
        animation-delay: 1s; animation-fill-mode: forwards; }
      @keyframes __cm_wild-in {
        from { opacity: 0; transform: scale(.6); }
        to { opacity: 1; transform: scale(1); } }
      .__cm_sprite { image-rendering: pixelated; }
      .__cm_art { image-rendering: auto; max-width: 100%; height: auto; }
      .__cm_hit { display: inline-flex; animation-name: __cm_hit; animation-duration: .45s; }
      @keyframes __cm_hit {
        0% { transform: translateX(0); opacity: 1; }
        25% { transform: translateX(-6px); opacity: .2; }
        50% { transform: translateX(5px); opacity: 1; }
        75% { transform: translateX(-3px); opacity: .4; }
        100% { transform: translateX(0); opacity: 1; } }
      .__cm_type { margin: 6px 0 0; padding: 6px 8px; border-radius: 6px; min-height: 2.2em;
        background: rgba(255,255,255,.05); border: 1px solid rgba(168,85,247,.35);
        font-size: 12px; color: #E0E7FF; }
      .__cm_cursor { color: #A855F7; animation-name: __cm_blink; animation-duration: 1s;
        animation-iteration-count: infinite; }
      @keyframes __cm_blink { 50% { opacity: 0; } }
      .__cm_result { display: flex; align-items: center; gap: 8px; padding: 4px 8px;
        font-size: 12px; color: #E0E7FF; }
      .__cm_milestones { margin: 6px 0 0; padding-left: 18px; font-size: 12px;
        color: var(--shinon-violet-light, #A855F7); }
      @media (prefers-reduced-motion: reduce) {
        .__cm_bar-fill, .__cm_expbar-fill { transition: none; }
        .__cm_lock-fill { animation: none; transform: scaleX(1); }
        .__cm_ball, .__cm_wild-sprite, .__cm_hit, .__cm_cursor,
        .__cm_expbar-wander svg { animation: none; }
        /* Gleiche Spezifitaet wie die Zustandsregeln oben — sonst gewinnt
           [data-state] (0,2,1) gegen diesen Schalter (0,1,1) und die
           reduzierte Bewegung laeuft trotzdem. */
        .__cm_expbar-wander[data-wander="on"] svg,
        .__cm_expbar-wander[data-state] svg { animation: none; }
        .__cm_ball { opacity: 0; }
        .__cm_wild-sprite { opacity: 1; }
      }
    `);

    // ── Seams ────────────────────────────────────────────────────────────────
    return {
      inject: ['slots'],
      /**
       * Fenster-API — die Stelle, an der eine andere Client-Haelfte oder eine
       * Probe den Zustand liest (dasselbe Muster wie window.__mk bei
       * @shinon/markers): der Client gibt unter `window.__codingmon` seinen
       * Zustand heraus, keine Marke.
       */
      apply(ctx) {
        // Sichtbarkeit: jede Client-Haelfte meldet sich in der gemeinsamen Liste
        // an, damit @shinon/dashboard sie zeigen kann. Kein Hintergrundprozess
        // ohne Zeile in der UI.
        const registry = (window.__shinonPlugins ??= new Map());
        registry.set(PLUGIN, { label: 'Codingmon', kind: 'client', panel: PANEL_ID });
        window.dispatchEvent(new CustomEvent('shinon:plugin', { detail: { id: PLUGIN } }));
        // Der Context des Client-Bundles: an ihm haengt (oder haengt nicht) der
        // Remote-Beitrag. Er wird nicht kopiert und nicht gehalten ueber den
        // Abbau hinaus — der Zustand des Spiegels ist der Zustand, nicht der Context.
        clientCtx = ctx;
        let remoteMount = 'offen'; // offen | laeuft | bereit
        const mountRemote = (holder) => { // holder traegt `remote`, der Wurzel-Context nicht
          const remote = holder?.get?.('remote');
          if (remoteMount !== 'offen' || typeof remote?.$mount !== 'function') return; // Dienstwechsel feuert erneut
          if (holder.get(`remote.${HOST_NAMESPACE}`) !== undefined) return void (remoteMount = 'bereit');
          remoteMount = 'laeuft';
          clientCtx = holder;
          const fail = (e) => { remoteMount = 'offen'; hostMirror = { ...hostMirror, reason: 'abgelehnt', error: e?.message ?? String(e) }; };
          try { Promise.resolve(remote.$mount(CONTRIBUTION)).then(() => { remoteMount = 'bereit'; }, fail); } catch (error) { fail(error); }
        };
        if (typeof ctx.inject === 'function') ctx.inject(['remote'], mountRemote);
        else mountRemote(ctx);

        window.__codingmon = {
          plugin: PLUGIN,
          state: () => ({ ...store, level: level(), stats: stats(), form: formOf(level()).label }),
          species: () => SPECIES_IDS.slice(),
          abilities: () => abilitiesFor(level(), store.species),
          arena: (round) => arenaFor(level(), round ?? store.round),
          start: () => startBattle(),
          use: (id) => useAbility(id),
          /** WEG b: lokale Trigger-Funktion — dieselbe Pruefung wie der Takt. */
          trigger: () => checkSpawn(),
          /** Ein Klick auf das Wilde: der Kampf oeffnet sich im Dock. */
          challenge: () => challengeWild(),
          /** Flucht vor dem Wilden / Rueckzug aus dem Kampf (J4). */
          flee: () => fleeWild(),
          fleeBattle: () => fleeBattle(),
          rest,
          pick: (id) => pickSpecies(id),
          selectCreature: (id) => selectCreature(id),
          /**
           * Welche Bildquelle eine Art benutzt: `art:<art>` wenn es eine eigene
           * Kunstdatei gibt, sonst der Schluessel des Gitters. Seit dem 2026-10-21
           * haben alle 50 Arten eine eigene Datei — der Rueckfall bleibt trotzdem
           * im Code, weil eine 51. Art ohne Bild sonst wieder auf einer fremden
           * Figur landen wuerde.
           */
          spriteFor: (id, side = 'front') => (SPRITE_ART[id] !== undefined ? `art:${id}` : resolveGridKey(id, side)),
          /** Die Gitter-Aufloesung allein (eigenes Gitter, sonst Familie, sonst Notfall). */
          spriteKey: (id, side = 'front') => resolveGridKey(id, side),
          /** Das fertige Markup — genau das, was die Arena einsetzt. */
          spriteMarkup: (id, side = 'front', size = 64) => speciesSprite(id, side, size),
          pair: (idA, idB, species) => pairCreatures(idA, idB, species),
          breeding: () => ({ ...store.breeding, creatures: store.breeding.creatures.map((creature) => ({ ...creature, bonuses: creature.bonuses.map((bonus) => ({ ...bonus })) })), eggs: store.breeding.eggs.map((egg) => ({ ...egg, parents: egg.parents.slice(), bonuses: egg.bonuses.map((bonus) => ({ ...bonus })) })) }),
          breedCandidates: (idA, idB) => breedingCandidates(store.breeding.creatures.find((creature) => creature.id === idA), store.breeding.creatures.find((creature) => creature.id === idB)),
          addXp: (xp) => award(xp, `+${xp} XP (manuell)`),
          /** Die laufende Sperre (null = kein Zug). */
          lock: () => lockStatus(),
          /** Wie viele Eingaben die Sperre kalt abgewiesen hat. */
          rejections: () => store.rejections,
          /** Der Lebenslauf als Dezimaltext (BigInt ueberlebt JSON nicht). */
          damageTotal: () => store.damageTotal.toString(),
          milestones: () => store.milestones.slice(),
          /** Der Zustand der Uebergabe (Client -> Host): gespiegelt, abgelehnt, kein Kanal. */
          host: () => ({ ...hostMirror }),
          /** Die Uebergabe von Hand ausloesen — dieselbe Naht, die jeder Zug nimmt. */
          mirror: () => toHost(),
          /**
           * Die Encounter-Buehne, wie eine Probe sie faehrt: Zustand lesen,
           * Ereignisse schicken, den Uebungszug starten. `state()` gibt eine
           * KOPIE (JSON-Form), damit kein Aufrufer den Reducer-Zustand von
           * aussen veraendert — der einzige Weg hinein ist `feed`.
           */
          encounter: {
            contract: ENCOUNTER_CONTRACT,
            state: () => JSON.parse(JSON.stringify(encounter)),
            log: () => encounterLog.map((entry) => ({ ...entry })),
            events: () => ENCOUNTER_EVENT_TYPES.slice(),
            sourceMap: () => JSON.parse(JSON.stringify(ENCOUNTER_SOURCE_MAP)),
            feed: (event) => encounterFeed(event),
            start: () => encounterStart(),
            abort: () => encounterAbort(),
            reset: () => encounterReset(),
          },
          /** Das Regelwerk, wie das Panel es liest. */
          rulebook: () => ({
            elements: Object.keys(ELEMENTS),
            chart: ELEMENT_CHART,
            category: CATEGORY,
            synergy: SYNERGY,
            buffs: BUFFS,
            lineage: LINEAGE,
            pacing: { ...PACING, delayMs: roundDelayMs },
          }),
          /** Die Loot-Tabelle samt Quote und der reine Wurf. */
          loot: () => ({ table: LOOT_TABLE.map((entry) => ({ ...entry, odds: lootOdds(entry) })), total: LOOT_TOTAL, roll: rollLoot }),
          /**
           * Der Vertrag, wie ihn nur der Client nachrechnen kann — dieselben
           * Funktionen, die der Host exportiert. Eine Probe vergleicht beide
           * Seiten Zahl fuer Zahl, damit die Dopplung nicht auseinanderlaeuft.
           */
          contract: () => ({
            threshold: (level) => threshold(level),
            levelFor: (xp) => levelFor(xp),
            statsAt: (speciesId, level) => statsAt(speciesId, level),
            /** Dieselben Werte EXAKT, als Dezimaltext (JSON kennt kein BigInt). */
            statsAtExact: (speciesId, level) => Object.fromEntries(
              Object.entries(statsAtExact(speciesId, level)).map(([key, value]) => [key, value.toString()]),
            ),
            /** Die Decke der Leiter. */
            levelCap: () => LEVEL_CAP,
            rewardFor: (level) => rewardFor(level),
            arenaFor: (level, round) => arenaFor(level, round),
            abilitiesFor: (level, speciesId) => abilitiesFor(level, speciesId).map((ability) => ability.id),
            inherited: (speciesId) => inheritedAbilities(speciesId).slice(),
            chart: () => ELEMENT_CHART,
            ladder: (base, level) => powerAtExact(base, level).toString(),
            describeValue: (base, level) => {
              const value = describeValue(base, level);
              return { text: value.text, digits: value.digits, safe: value.safe };
            },
            rollLoot: (uniform) => rollLoot(uniform).id,
            /** Der Wild-Spawn als reine Funktion (Spiegel von mechanik.js). */
            spawnFor: (done, level) => spawnFor(done, level),
            /** Die Typwirkung als Zeichen (Spiegel von mechanik.js). */
            effectiveness: (attacker, defender) => effectiveness(attacker, defender),
            resolveAttack: (abilityId, speciesId, defenderSpeciesId, level) => {
              const ability = ABILITIES.find((entry) => entry.id === abilityId) ?? ABILITIES[0];
              const own = statsAt(speciesId, level);
              const attacker = {
                element: SPECIES[speciesId].family,
                stats: own,
                hp: own.hp,
                maxHp: own.hp,
                inherited: inheritedAbilities(speciesId),
              };
              const defender = { element: SPECIES[defenderSpeciesId].family, stats: statsAt(defenderSpeciesId, level) };
              const result = resolveAttack(ability, attacker, defender);
              return { ...result, buff: result.buff.id };
            },
          }),
          reset: () => {
            for (const timer of timers.values()) window.clearTimeout(timer);
            timers.clear();
            store = freshState(store.species);
            persist();
            emit();
          },
        };

        // KEINE Marken-Slots mehr: `sidebar.brand.mark` und
        // `conversation.hero.brand.mark` sind Single-Slots und gehoeren @shinon/core,
        // das dort Shinons gezeichnetes Zeichen haelt. Zwei Besetzer auf einem
        // Single-Slot entscheidet die Ladeordnung — also besetzt hier genau einer.
        // Das Pet bleibt in seinen eigenen Flaechen (Panel, XP-Leiste, Arena);
        // eine Marke gibt dieser Client nach aussen nicht heraus.
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, CodingmonPanel));
        // >>> shinon:dsh-idiom locale-fallback/menu — EINE Quelle: scripts/lib/plugin-idioms.mjs (generiert; schreiben: `npm run idioms`, prüfen: Gate + dsh-test) params={"table":"MENU_DE","key":"menu.codingmon","label":"Codingmon"}
        // Menü-Label aus der Registry (Besitzer: @shinon/locale-de); ohne
        // Locale-Dienst gilt die deutsche Tabelle.
        const MENU_DE = { 'menu.codingmon': 'Codingmon' };
        // Gelesen wird `ctx.get?.('locale')`, NICHT `ctx.locale`: ein direkter
        // Dienst-Zugriff ist am Cordis-Proxy durch `inject` gesperrt und wirft
        // ('cannot get property "locale" without inject') — das kostete dieser
        // Hälfte die Aktivierung. `ctx.get` ist die dokumentierte optionale
        // Abfrage (undefined, wenn der Dienst fehlt), und die `?.` tragen einen
        // Context ganz ohne `get` (die Attrappen in durchstich/uebergabe); dann
        // gilt MENU_DE.
        const t = (key) => {
          const locale = ctx.get?.('locale');
          const hit = typeof locale?.bind === 'function' ? locale.bind('shinon')(key) : undefined;
          return hit === undefined || hit === key ? (MENU_DE[key] ?? key) : hit;
        };
        // <<< shinon:dsh-idiom locale-fallback/menu
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 25,
          label: () => t('menu.codingmon'),
        }, CodingmonIcon));
        // Die globale EXP-Leiste: derselbe Store, andere Ansicht.
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'shinon-exp-bar',
          order: 20,
        }, ExpBar));
        // SLOT-ENTSCHEIDUNG (belegt vor Code): Ball, Wild und Kampf wohnen in
        // `conversation.composer.dock` (live sichtbar, geteilt mit der EXP-Leiste);
        // `conversation.chat.node` bleibt aus (shadows-shipped-ui).
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'shinon-wild-dock',
          order: 21,
        }, WildDock));
        // Die Encounter-Buehne (S5): Ereignisse rein, Zustand raus. Sie steht
        // im selben Dock wie Ball und EXP-Leiste, weil der Zustand dorthin
        // gehoert, wo gearbeitet wird — und nicht in ein eigenes Panel.
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'shinon-encounter-stage',
          order: 22,
        }, EncounterStage));
        ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
          name: 'conversation.chat.turnTail',
          id: 'shinon-battle-result',
          order: 5,
        }, BattleResult));

        // Nur der Host kann erfolgreiche Completions bestaetigen; fehlende
        // Remote-Kopplung vergibt folgerichtig keine XP.
        const activityTimer = window.setInterval(readActivity, 2000);

        ctx.effect?.(() => () => {
          window.clearInterval(activityTimer);
          // Die Buehne raeumt ihre Timer mit: ein abgebautes Bundle darf keinen
          // Uebungszug weiterlaufen lassen, der in ein fremdes Panel malt.
          encounterStop();
          // Ein laufender Zug haengt an einem Timer, und der Abbau nimmt ihn mit.
          // Sonst feuerte `settle` in ein Bundle, das es nicht mehr gibt, und der
          // Zustand behauptete eine Sperre ohne Uhr — eine Wartezeit ohne Ende.
          for (const timer of timers.values()) window.clearTimeout(timer);
          timers.clear();
          if (store.lock !== null) {
            store.lock = null;
            persist();
          }
          // Der Context des Client-Bundles, an dem der Beitrag haengt, wird NICHT
          // abgeraeumt (er gehoert der Composition, nicht diesem Bundle) — aber
          // die Referenz darauf: ein abgebautes Bundle darf keinen Context halten.
          clientCtx = null;
          delete window.__codingmon;
        });

        console.log(`[shinon-codingmon] Arena aktiv — ${SPECIES_IDS.length} Codemons, Level ${level()}, ${abilitiesFor(level(), store.species).length} Faehigkeiten`);
      },
    };
  },
});
