/**
 * @shinon/codingmon — Client-Hälfte (Codemons + Arena).
 *
 * Die Marken-Slots der Sidebar und des Hero haelt @shinon/core: es zeigt dort
 * Shinons gezeichnetes Zeichen (eine Marke, eine Formensprache). Dieser Client
 * besetzt keinen Marken-Slot und gibt auch keine Marke heraus — die Figur
 * bleibt in ihren eigenen Flaechen (Panel, XP-Leiste, Arena). Nach aussen
 * lesbar ist allein der ZUSTAND, ueber eine Fenster-Konvention statt ueber
 * → Kanon: docs/COMMENT-KANON.md#k-a552c23582de
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
 * → Kanon: docs/COMMENT-KANON.md#k-10be308a1da3
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
     * Der Stand liegt in `localStorage` und haengt damit am BROWSER-Profil: ist
     * das weg, ist der Grind weg. Der Host haelt daneben einen dauerhaften
     * Spiegel (`assets/pet-store.js`), und diese Funktion ist der ABSENDER —
     * sie schickt den Stand ueber den Typert-RPC von DSH an den Host, sofern
     * das Client-Bundle den Beitrag dieses Pakets gemountet hat.
     *
 * → Kanon: docs/COMMENT-KANON.md#k-8a3e82b5bc53
 */
    const HOST_NAMESPACE = 'codingmon';
    const HOST_METHOD = 'writeSnapshot';
    /** Die Lese-Methode derselben Naht (Quelle: `assets/uebergabe.js`). */
    const HOST_ACTIVITY_METHOD = 'readActivity';
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
     * Das ECHTE Sprite einer Spezies (Gen-1): Vorder-/Rueckseite aus dem
     * eingebetteten 32x32-Gitter (`SPRITE_GRIDS`, Quelle:
     * `assets/sprites/*.grid`, Drift-Test `sprites.test.mjs`). Ein `<rect>` je
     * horizontalem Lauf — dieselbe Verdichtung wie der Generator. Die Palette
     * ist hier als Literal wiederholt (Bundle ohne Import, siehe Abschnitt 1);
     * Quelle: `scripts/assets/build-sprites.mjs` (PALETTE).
     */
    const GRID_PALETTE = { K: '#0B0F14', V: '#A855F7', P: '#7C3AED', I: '#6366F1', W: '#E0E7FF' };
    function gridSvg(speciesId, side, size) {
      const key = `grid:${speciesId}:${side}:${size}`;
      const cached = spriteCache.get(key);
      if (cached !== undefined) return cached;
      const grid = SPRITE_GRIDS[`${speciesId}-${side}`] ?? SPRITE_GRIDS[`${SPECIES_IDS[0]}-${side}`] ?? SPRITE_GRIDS[`${SPECIES_IDS[0]}-front`];
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
      const idle = s.battle === null && s.lock === null;
      return h('div', {
        className: '__cm_expbar',
        title: `${s.name} · ${SPECIES[s.species].label} · Level ${lvl} · ${s.wins} Siege`,
        'data-plugin': PLUGIN,
      },
        h('span', {
          className: '__cm_expbar-wander',
          'data-wander': idle ? 'on' : 'off',
          'aria-hidden': 'true',
        }, h('span', { className: '__cm_expbar-pet', dangerouslySetInnerHTML: { __html: speciesGlyph(s.species, lvl, 18) } })),
        h('span', { className: '__cm_expbar-lvl' }, `LV ${lvl}`),
        h('span', { className: '__cm_expbar-track' },
          h('span', { className: '__cm_expbar-fill', style: { width: `${pct}%` } })),
        h('span', { className: '__cm_expbar-meta' },
          // Hoechst-HP aus der exakten Leiter: sonst stuende hier ab Stufe ~120
          // die Exponentialschreibweise einer Zahl, die es so nicht gibt.
          `${formatNumber(s.xp)} XP · HP ${formatNumber(Math.max(0, s.hp))}/${formatNumber(statsAtExact(s.species, lvl).hp)} · ${s.wins} Siege · Beute ${s.loot.shiny} shiny`),
      );
    }

    // ── Panel-Bausteine (Kopf / Werte / Arena / Liste / Bilanz) ─────────────
    /** Kopf: Figur, Spezies-Wahl (alle ZEHN erreichbar), Level und Fortschritt. */
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
    /**
     * ESKALATION: was eine Stufe ausmacht. Die Zahlen stehen formatiert da,
     * weil die Aussage die Zahl ist: Schwelle, Werte und Lohn wachsen
     * multiplikativ (x1,35 je Stufe), und der Lebenslauf steht daneben als
// → Kanon: docs/COMMENT-KANON.md#k-c83e791235d1
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
            `Werte L${lvl}: HP ${formatNumber(ladder.hp)} · ATK ${formatNumber(ladder.atk)} — auf L1: HP ${formatNumber(base.hp)} · ATK ${formatNumber(base.atk)} (exakte BigInt-Leiter)`),
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
      const mine = statsAt(s.species, lvl);
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
              dangerouslySetInnerHTML: { __html: gridSvg(battle.speciesId, 'front', 64) },
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
              dangerouslySetInnerHTML: { __html: gridSvg(s.species, 'back', 64) },
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
          h('span', { className: '__cm_wild-sprite', dangerouslySetInnerHTML: { __html: gridSvg(wild.speciesId, 'front', 64) } }),
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

    function CodingmonPanel() {
      const s = useStore();
      const lvl = levelFor(s.xp);
      // Angezeigt wird die EXAKTE Leiter, gerechnet die schnelle Number-Fassung.
      const exact = Object.fromEntries(Object.entries(stats()).map(([key, value]) => [key, BigInt(value)]));

      // Der Kampf wohnt im Dock (WildDock), nicht hier: `main` zeigt Stand,
      // Regelwerk ohne Tabelle, Beute und Bilanz.
      return h('div', { className: '__cm_panel' },
        h(PetHead, { s, lvl, onPick: pickSpecies }),
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
        // SLOT-ENTSCHEIDUNG (Auftrag Abschnitt 4, Schritt 2 — belegt vor Code):
        // Ball, Wild und Kampf wohnen in `conversation.composer.dock` — live
        // sichtbar, waehrend der Agent arbeitet, geteilt mit der EXP-Leiste
        // (kein Single-Slot-Konflikt). Das Ergebnis liegt zusaetzlich in
        // `conversation.chat.turnTail` (Liste, erscheint nach dem Turn).
        // `conversation.chat.node` (`keyed`) ist ausgeschlossen:
        // `replaceRisk: shadows-shipped-ui` — keine Begruendung, kein Knoten.
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'shinon-wild-dock',
          order: 21,
        }, WildDock));
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
