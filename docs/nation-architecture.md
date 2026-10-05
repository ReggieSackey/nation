# Nation architecture

This document records how this Pyrogenesis tree is structured and where Nation code should go. It describes the repository as inspected on branch `nation-dev`. A gameplay system is described here only after it exists in the tree.

## Upstream architecture

```text
source/                         C++ engine (Pyrogenesis)
binaries/data/mods/mod/         engine mod, always mounted
binaries/data/mods/public/      0 A.D. game data
binaries/data/mods/nation/      Nation
```

`source/` is the engine: renderer, networking, pathfinding, the virtual filesystem, and the simulation component host. Game rules that can live in JavaScript should stay out of this tree.

`binaries/data/mods/mod/` has no `mod.json`. The engine always inserts the folder name `mod` at the front of the enabled list. It supplies shaders, fonts, common GUI widgets, and the mod selector (`gui/page_modmod.xml`). It is not a selectable game mod.

`binaries/data/mods/public/` is the 0 A.D. game. Its `mod.json` `name` is `0ad` and its `version` is `0.29.0`. The folder name `public` is the load id. The `name` field is what dependency checks compare. Empty `dependencies` means it loads on its own.

`binaries/data/mods/nation/` is the Nation game. It is recognized only because it contains a `mod.json` the current parser accepts.

### How mods are discovered

`Mod::UpdateAvailableMods` scans `binaries/data/mods/` and the user mods directory. A directory is an available mod when `mod.json` parses and contains `name`, `version`, and `dependencies`. The GUI validator in `binaries/data/mods/mod/gui/modmod/validatemod.js` also requires `label` and `description`. `url` is optional. `ignoreInCompatibilityChecks` is an optional boolean read by C++; leave it unset so replays and multiplayer include Nation.

The folder name identifies the mod on the command line and in `mod.enabledmods`. `name` must match `[A-Za-z0-9_-]+`. `version` must be numbers with at most two dots, such as `0.1.0`. There is no author field. The project author is recorded in `AGENTS.md`.

A dependency is either a mod `name` or `name` plus one of `=`, `<`, `>`, `<=`, `>=` plus a version. The C++ compatibility check only enforces the versioned form, and it checks enabled mods. Nation declares `0ad=0.29.0`, which is the `name` and `version` in `public/mod.json`. That pin has to be updated when `public/mod.json` changes. A bare name would pass the GUI validator and then be ignored by the compatibility check.

Enabling a mod does not automatically enable its dependencies. `public` must be enabled alongside `nation`.

### Load order and overrides

Default config is `mod.enabledmods = "mod public"` in `binaries/data/config/default.cfg`. The normal game does not insert `public` by itself. Atlas does. The engine always inserts `mod` at the front if it is missing.

`-mod=NAME` may be repeated. It replaces the config list. Order is mount order. Later entries get a higher virtual-filesystem priority and replace earlier files with the same path. `.DELETED` in a higher-priority mod removes a lower-priority file. In a development copy the writable `user` mod is mounted at the lowest priority, so it does not override `nation`.

For Nation to override 0 A.D. files, the enabled order must be:

```text
mod public nation
```

Launch that with:

```text
-mod=public -mod=nation
```

The engine adds `mod` at the front.

Directories are merged. A new file under `nation/simulation/components/` is loaded with the public component scripts. A file at the same relative path replaces the public file. Prefer new files. Replacing a large upstream file couples Nation to that file's current text.

ES module appendices (`filename~suffix.append.js`) apply to the module loader. Simulation component scripts are classic scripts loaded by `CComponentManager::LoadScript`, so that appendix mechanism does not extend them.

### Simulation

On startup the simulation loads, non-recursively, every `*.js` file in:

```text
simulation/components/interfaces/
simulation/helpers/
simulation/components/
```

A JavaScript interface is one file:

```javascript
Engine.RegisterInterface("Example");
```

That defines `IID_Example`. Interfaces registered this way use the generic script wrapper. They do not need a C++ change. A component is a constructor with a `prototype`, an optional Relax NG `Schema` string, optional `Init` and `Deinit`, and optional `OnMessage` or `OnGlobalMessage` handlers. Registration is:

```javascript
Engine.RegisterComponentType(IID_Example, "Example", Example);
Engine.RegisterSystemComponentType(IID_Example, "Example", Example);
```

`RegisterSystemComponentType` attaches the component to the system entity (`SYSTEM_ENTITY`, id 1), which exists before other entities. `PlayerManager`, `Timer`, `Trigger`, `GuiInterface`, and `Barter` are system components. `Player`, `Diplomacy`, `Market`, `ProductionQueue`, `Population`, and `StatisticsTracker` are entity components. One entity can have many components. `Engine.QueryInterface(ent, IID_Example)` returns that entity's implementation. `Engine.PostMessage` and `Engine.BroadcastMessage` deliver messages synchronously.

JavaScript component state is serialized automatically. Stored values must be strings, numbers, booleans, null, undefined, arrays, or plain objects. Functions and closures are not serialized. Custom `Serialize` and `Deserialize` exist when some fields must be omitted, as `Player` does for GUI-only display data.

Templates are XML under `simulation/templates/`. The root element is `<Entity parent="template_name">`. Child elements override the parent. Files named `template_*.xml`, and everything under `special/` and `mixins/`, are inherited or applied and are not placeable entity types. A template name may also use `foo|bar` composition, or `actor|path` for a visual with no simulation template. Components are configured by child elements whose names match component types. `Identity` carries civ and classes. `VisualActor` references an actor. `Position`, `Obstruction`, and `Footprint` place the entity in the world. `Ownership` is a C++ component.

Representative upstream pieces, and what they actually are:

| Piece | Role in this tree |
| --- | --- |
| `Player` / `PlayerManager` | Per-player entity plus the list of player entities. Resources are numbers on the player. |
| `Diplomacy` | Per-player stance array, team, and shared vision or dropsites. |
| `CCmpTerritoryManager` | One player id per tile, plus connected and blinking flags. Influence spreads from `TerritoryInfluence` entities. |
| `Settlement` | Empty script component. Its comment describes hiding a civic-centre site under a building. |
| `ResourceGatherer`, `Market`, `Barter`, `ProductionQueue` | Ancient gathering, markets, barter prices, and training or construction queues. |
| `Population` | A numeric population-cap bonus on an entity. The cap itself lives on `Player`. |
| `StatisticsTracker` | Match statistics for the summary screen. |
| `CCmpOwnership` | Which player id owns an entity. |
| `GuiInterface` | The only bridge from GUI scripts into simulation queries. |

`globalscripts/Resources.js` loads every `simulation/data/resources/*.json`. A new JSON file in the Nation mod is picked up because the directory listing is merged. Current resources are food, wood, stone, and metal.

### Maps

`binaries/data/mods/public/gui/common/settings.js` hardcodes three map types and says modding that list needs major changes. Each type is discovered by listing a virtual-filesystem directory, so a mod can add maps without editing `public`:

| Type | Path | File | What is fixed |
| --- | --- | --- | --- |
| Skirmish | `maps/skirmishes/` | `.xml` | Landscape and player count. Other match settings stay free. |
| Random | `maps/random/` | `.json` pointing at a `.js` generator | Generated landscape. |
| Scenario | `maps/scenarios/` | `.xml` | Landscape and match settings. |

Scenario and skirmish XML also reference a `.pmp` terrain. `ScriptSettings` inside the XML holds the display name, description, and player data. Atlas writes these files. The game launches Atlas with `-editor`.

The first fictional African country should be a scenario under `binaries/data/mods/nation/maps/scenarios/`. A scenario can fix borders, settlements, and participants. A random map cannot. Do not add a fourth map type unless the hardcoded list is deliberately overridden.

### GUI

Pages are XML files such as `gui/page_pregame.xml` and `gui/page_session.xml`. `CGUIManager::SwitchPage` loads a page from the virtual filesystem. A higher-priority mod can replace a page or a widget file.

The session UI lives in `binaries/data/mods/public/gui/session/`. `gui/session/top_panel/CounterResource.js` draws resource counters from player state. `gui/session/selection_panels.js` defines `g_SelectionPanels` for the selected unit or building. Diplomacy and trade dialogs are siblings of those files.

GUI scripts read simulation state with `Engine.GuiInterfaceCall(name, data)`. That call lands on the system `GuiInterface` component. `ScriptCall` only dispatches names listed in `exposedFunctions`, and the comment at the top of `GuiInterface.js` forbids those functions from changing serialized state. Commands that must change the simulation use `Engine.PostNetworkCommand`.

Future Nation screens (treasury, budget, trade, diplomacy, debt, settlement statistics, state capacity, infrastructure, population and welfare) should be new files under `binaries/data/mods/nation/gui/`, included by a Nation override of the session page or a new page. Simulation data for those screens should be a small Nation component. Exposing it means extending `GuiInterface.prototype` and `exposedFunctions` from a Nation script loaded after `GuiInterface.js`, or, if that proves insufficient, a justified replacement of that one bridge. Copying the whole upstream file is the last option, because every upstream GUI change becomes a merge conflict.

## Nation architecture

```text
Pyrogenesis
    ↓
upstream engine systems (source/, mods/mod/)
    ↓
0 A.D. game data used as a temporary base (mods/public/)
    ↓
Nation mod (mods/nation/)
    ↓
Nation simulation systems
    ↓
Nation content, maps, UI, and assets
```

Nation-specific behavior is added as new files inside `nation`. Upstream files stay in place so the game still runs and so later 0 A.D. merges stay possible.

### Dependency strategy

Nation depends on `public`, pinned as `0ad=0.29.0`.

This is a deliberate temporary dependency. `public` contains the session GUI, the simulation components, entity templates, actors, and maps required to launch a game. Reimplementing that stack inside `nation` before any Nation rules exist would copy thousands of files and freeze them away from upstream fixes.

The dependency is temporary in intent. Nation logic stays in `nation`. As Nation content replaces 0 A.D. content, individual public files can stop being relied on. Removing the dependency entirely is a later distribution task, after Nation can boot from `mod` plus its own data. Do not start that removal now.

`mod` stays mandatory. The engine mounts it even if the command line omits it.

### Where future systems go

Create these directories when a file needs to live there. Empty directories are not useful and Git will not track them.

```text
binaries/data/mods/nation/simulation/components/interfaces/
binaries/data/mods/nation/simulation/components/
binaries/data/mods/nation/simulation/helpers/
binaries/data/mods/nation/simulation/templates/
binaries/data/mods/nation/simulation/data/
binaries/data/mods/nation/gui/
binaries/data/mods/nation/maps/scenarios/
binaries/data/mods/nation/art/
```

Use the same shapes as `public`: one interface file, one component file, Relax NG schemas on the prototype, system components only for match-wide state, entity components for things that exist in the world. Templates inherit with the `parent` attribute. Data files that upstream already enumerates (resources, and similarly technologies and civ JSON) can be added beside the upstream files.

Civ definitions, player templates, and ancient unit templates stay upstream until a Nation entity needs its own template. New entities should parent from the smallest upstream template that supplies position, identity, obstruction, and a visual, then replace the ancient-specific parts in the Nation file.

### Engine-change policy

An engine change is justified only by a limitation the simulation and mod APIs cannot reasonably cover. The change stays small and generic. It is not written until explicitly authorized. No engine change is authorized for the current foundation.

### Room left for later models

These are constraints on future design. They are not systems to build now.

### Territorial model

These four layers stay separate. Do not collapse them, copy one into another, or treat a change in one as a change in another.

```text
LEGAL SOVEREIGNTY
Nation Sovereignty component
fixed scenario-defined international borders
answers who legally owns land

EFFECTIVE STATE CONTROL
Pyrogenesis TerritoryManager / TerritoryInfluence
dynamic physical administrative dominance
answers who actually projects state authority

MILITARY OCCUPATION
Nation MilitaryOccupation
local foreign hostile military dominance around a settlement
separate from both

STATE INTEGRATION
NationSettlement metric
how deeply population is incorporated into state
separate from all three
```

Legal sovereignty is `Sovereignty.GetSovereignOwner`. Effective control is `TerritoryManager.GetOwner` at a world position. A tile with no influence returns 0, which Nation reads as uncontrolled. The two answers are queried when needed. Nation does not store a second controller, and a territory change does not rewrite a sovereignty polygon.

`CCmpTerritoryManager` keeps one player id per tile in five bits (`TERRITORY_PLAYER_MASK` is `0x1F`), plus a connected bit and a blinking flag. The grid is not serialized. It is rebuilt from `TerritoryInfluence` entities. Each of those entities has a root flag, a weight, and a radius. Radius is the approximate reach in world units: influence falls by about `weight * 8 / radius` on each passable territory tile, and a tile about one radius away has no influence left. Weight decides which source wins where two areas overlap. It does not shorten the radius. A root is the source of the connected bit. `GetOwner` still reports a player for non-root influence. Gaia and other non-positive owners are ignored, so land with no influence is uncontrolled rather than owned by Gaia. Diplomacy is not an input. Phase technologies do not modify influence.

Destroying an influence entity, or changing its owner or position, marks the grid dirty. The next query recalculates. There is no Nation cleanup step. Capturing the structure makes its influence follow the new owner through that same update. The upstream territory overlay draws this effective-control grid in player colors. The fixed international border is not drawn as its own layer. Legal sovereignty is visible in the settlement readout and in simulation queries.

A root structure standing on territory it owns is connected to itself, so `TerritoryDecay` does not remove it. A non-root structure in otherwise uncontrolled land can blink and decay. The regional office is therefore a root, as a civic centre is. Its radius and weight are still smaller than the capital civic centre.

Influence is geometric. It is not clipped to sovereignty polygons. A control area can cross the legal border, and a legal border can cross uncontrolled land. That difference is intentional. A tile such as (270, 380) can be legally Neighbor and effectively Nation because the capital's radius crosses x=256. That spill does not authorize a foreign office.

`MilitaryOccupation` answers which hostile foreign state currently has enough soldiers around a settlement. It stores nothing. `GetOccupier` asks `RangeManager.ExecuteQueryAroundPos` for that settlement when something needs the answer, then counts living mobile entities with the `Soldier` class inside 60 world units. Support workers do not have that class. The configured rebel player is skipped, and so is the sovereign's own army. Both players must regard the other as an enemy; a neutral or military-access garrison does not occupy. Three soldiers are required. If two foreign states both qualify, the larger count wins, and an equal count uses the lower player id. The player loop is numeric, so the result does not depend on object order. There is no occupation grid and no per-turn scan.

`structures/nation/foreign_administration` is the office built from that occupation. It requires `phase_city`. `MayPlace` allows it only on land sovereign to someone else, within 80 world units of a settlement that is sovereign to that state and currently occupied by the builder. Domestic `regional_administration` is unchanged and still requires the builder's own sovereignty. The construct command applies both checks before the upstream command, and it also requires `CanProduce`, because a zero-cost building would otherwise continue after a failed technology check. Once the foreign office exists, it keeps its `TerritoryInfluence` if the soldiers leave. Destroying the office removes that influence and leaves any soldiers' occupation in place. Neither event rewrites `Sovereignty`.

The foreign office is a root with radius 72 and weight 16000. Radius 72 is the same local reach as a regional office. Weight 16000 is higher than a regional office's 4000 because the neighbor civic centre still has several thousand influence left at Eastern Neighbor Village, and 4000 cannot take that tile. The office does not change integration, discontent, food, resources, or the treasury.

These states are all valid, and none of them is annexation:

```text
Sovereign P2, control P2, occupation P1
Sovereign P2, control P1, occupation P1
Sovereign P2, control P1, occupation none
```

Domestic regional administration is authorized by legal sovereignty. `DomesticAdministration.MayPlace` allows `structures/nation/regional_administration` only where `GetSovereignOwner` is the builder. The construct command checks that before the upstream command runs, so a rejected site never spends resources or creates a foundation. The GUI is not consulted. The structure's build restriction is `own neutral`, which lets the upstream check accept the builder's own effective control and uncontrolled land. It does not accept foreign effective control. The sovereignty check is what rejects a site that is legally foreign even when Nation influence has spilled onto it.

Effective control does not, in this step, change state integration, food production, food consumption, food imports, discontent, or representative population. Connectivity still changes integration on its own. Rebellion does not read or write `TerritoryManager`. Rebels damage a regional office through ordinary attack and `Health`. If the office is destroyed, its influence is gone and the grid recalculates.

### Sovereignty

`Sovereignty` is a Nation system component. It answers which player legally owns a world position. It does not read or write `CCmpTerritoryManager`.

V1 regions are static polygons in world coordinates, stored on the scenario as `ScriptSettings.Sovereignty`. A gamesettings attribute copies that array into `InitAttributes.settings`. On `InitGame` the component stores it. `GetSovereignOwner({x, z})` returns the player id of the first containing region, or `INVALID_PLAYER` (-1) when the point is unclaimed. A point on a polygon edge is inside that polygon. The loaded regions are ordinary component state, so a save or replay keeps them. Regions do not change during a match.

`SovereignBorderTracker` observes when a moving entity changes sovereign regions. It listens for `PositionChanged` on entities with `UnitMotion` and a player owner, and it calls `GetSovereignOwner`. The first sighting is remembered and does not emit. A later change posts `SovereignBorderCrossed` with `{entity, from, to}`, where `from` and `to` are sovereign owners of the land. A crossing has no legal or diplomatic meaning. The tracker does not read `TerritoryManager`, stop the unit, or change diplomacy or sovereignty. Remembered entity ids are ordinary component state and are dropped when the entity is destroyed.

`ForeignMilitaryPresence` listens for that crossing and for destruction and ownership changes. It records which mobile player units are currently inside land sovereign to a different player. The pair is directional: foreign owner, then host sovereign. The first unit broadcasts `ForeignMilitaryPresenceStarted`. The last unit to leave or be destroyed broadcasts `ForeignMilitaryPresenceEnded`. Presence is geographical, so an authorized entry still counts. V1 uses the same mobile units the border tracker reports. A border crossing is an event. Foreign presence is current state. Do not infer a continued violation from the historical incident.

`DiplomaticAccess` answers whether units owned by one player may enter land sovereign to another. V1 stores only directional `MilitaryAccess` grants, `{from, to, military}`, copied from scenario `ScriptSettings` through a gamesettings attribute into `InitAttributes.settings`. `HasMilitaryAccess(fromPlayer, toPlayer)` returns the first matching grant. A missing grant is denial. A grant from 1 to 2 does not grant 2 to 1. Ally, enemy, and neutral stance are not consulted. The grants are ordinary component state, so a save keeps them. `TradeAccess` is a different grant and is not read here.

`SovereignEntryClassifier` listens for `SovereignBorderCrossed`. It reads the unit owner from `Ownership`. Entry into `INVALID_PLAYER` is not classified. A unit entering land sovereign to its own owner is authorized. Any other entry is authorized only when `HasMilitaryAccess(entityOwner, destination)` is true. The result is `SovereignEntryClassified` with `{entity, entityOwner, from, to, authorized}`. Unauthorized does not mean war. The unit is not stopped. V1 applies this military rule to every tracked unit. A later civilian, trade, or diplomatic category check belongs in the classifier.

`BorderIncidentManager` listens for `SovereignEntryClassified` and keeps one directional incident per offender and defender. An incident is recorded only for an unauthorized entry by one real player into land sovereign to a different real player. The record is `{offender, defender, active, incursions}`. The first such entry broadcasts `BorderIncidentStarted` with `{offender, defender, entity}`. A later unauthorized entry by the same offender into the same state increments `incursions` and broadcasts `BorderIncursionContinued` with the same offender, defender, and entity. It does not open another incident. The incident stays active for the match. A border incident is not war. Border incidents are directional. The manager does not read or write `Diplomacy`, and it does not stop the unit.

`BorderWarningManager` listens for `BorderIncidentStarted` and keeps one warning record per offender and defender, `{offender, defender, active}`. An open cycle (`active`) is the demand currently awaiting a deadline. The first warning broadcasts `BorderWarningIssued` with `{issuer, recipient}`, where the issuer is the defender and the recipient is the offender. A repeated incursion while that cycle is open does not issue another warning. `IsWarningCompliedWith(offender, defender)` is true only while the cycle is open and `ForeignMilitaryPresence` reports no units of the offender inside the defender. When the warning deadline sees that compliance, `CompleteWarningCycle` sets `active` false. The record stays. A later `BorderIncursionContinued` for that completed pair opens a new cycle and broadcasts `BorderWarningIssued` again. That is how a genuine re-entry is answered. Continuous presence does not produce a continued incursion, so it does not issue warnings on every turn. A reverse incident has its own warning. Withdrawal is the physical form of compliance. A warning is a diplomatic objection. It is not war.

`BorderWarningEscalation` listens for `BorderWarningIssued` and schedules one `Timer.SetTimeout` for that directional pair. The delay is `GracePeriod`, 10000 simulation milliseconds, which is ten simulation seconds of prototype timing. It is not a calendar date and not a final gameplay duration. `Timer` counts milliseconds of simulation time and stores callbacks in a `Map` of absolute fire times. The engine serializes that `Map` with the component, and the escalation component serializes the pending timer id, so a save keeps the remaining deadline. A second warning message does not schedule a second timer while one is already pending. When the timer fires, compliance is read then. If the offending units have gone, the warning cycle closes and nothing further is sent. If they are still inside, `BorderUltimatumManager` records one ultimatum. Leaving before the deadline does not cancel the timer early, because the check has to see the live presence. A completed cycle does not block the next warning.

`BorderUltimatumManager` stores `{offender, defender, active}`. The first ultimatum for a pair broadcasts `BorderUltimatumIssued` with `{issuer, recipient}`, the issuer being the defender and the recipient the offender. A second request for the same pair does nothing. The ultimatum stays recorded if the troops later leave. An ultimatum does not change `Diplomacy` and is not war.

`BorderUltimatumEscalation` listens for `BorderUltimatumIssued` and schedules one `Timer.SetTimeout` of its own `GracePeriod`, also 10000 simulation milliseconds of prototype timing. The pending id serializes with the component, and `Timer` serializes the callback, so a save keeps the remaining ultimatum deadline. A duplicate ultimatum message does not schedule a second timer. When it fires, `HasForeignMilitaryPresence(offender, defender)` is read then. If the forces have gone, no crisis is created. If they remain, `BorderCrisisManager` records one escalated crisis.

`BorderCrisisManager` stores `{offender, defender, active}`. The first crisis for a pair broadcasts `BorderCrisisEscalated` with `{offender, defender}`. A second request does nothing. Withdrawal after that does not remove the crisis. An escalated border crisis means an ultimatum to withdraw expired while those forces were still inside. It does not change `Diplomacy`, and it is not war. A valid match state is a neutral relationship, no military access, an active incident, an open or completed warning, a recorded ultimatum, and either remaining foreign presence with an escalated crisis or withdrawn forces with no crisis.

### Settlements

`NationSettlement` is an entity component for a populated place. It stores a name, an aggregate demographic population, `stateIntegration` from 0 to 100, and `isCapital`. The template supplies the initial values. Nothing in the match grows or shrinks that population by itself. `SetPopulation` is the explicit replacement, used when a later system or a test changes the count. Integration can change. Demographic population is how many people live in the place. It is not the 0 A.D. population cap, and the settlement templates disable that cap component. Zero integration is almost no state reach. One hundred is deep integration. The component does not store a sovereign owner and does not store an effective controller. `GetEffectiveController` reads `TerritoryManager.GetOwner` at the settlement position when asked. `GetPosition2D` stores map z in `y`.

`GetSovereignOwner` asks `Sovereignty` for the owner of the settlement's position. The selected-settlement readout shows that legal sovereign and the effective controller by name, or "Uncontrolled" when `GetOwner` is 0. Both lines are read when the panel is drawn. `NationSettlementManager` uses `GetEntitiesWithInterface` and groups by that result. Entity `Ownership` is not the grouping key, so a settlement entity owned by one player can still count for the state whose land it stands on. `GetTotalPopulation` sums the populations in one sovereign territory, or returns 0 when there are none. `GetPopulationWeightedIntegration` is `sum(population * integration) / sum(population)`, or `null` when that population sum is 0. It reads the current settlement values, so a later change in integration changes the national figure without a second store. A settlement can stand in Nation's recognized territory and still have low integration. The 1961 sandbox places Capital, Northern Village, Western Village, and Southern Village in Nation's half, and Eastern Village in Neighbor's half. Their visuals are disposable house templates with territory influence removed.

`IsCapital` marks at most one settlement as the capital of the sovereign state whose land it stands on. `SettlementConnectivity` finds that settlement by position. Two capitals in the same sovereign territory are rejected, and that state then has no capital for connectivity. There is no capital relocation.

`SettlementConnectivity` stores an undirected graph of settlement entity ids. That graph is what answers whether a settlement can reach its capital, and `GetPathToCapital` returns one shortest path. Two sources stay distinct. Scenario `ScriptSettings.SettlementConnectivity` lists abstract `{from, to}` pairs, and a gamesettings attribute copies them into `InitAttributes.settings`. Those scenario edges are static. Entities with `InfrastructureLink` contribute a second set of edges that follows the link's condition. Map entity uids are the simulation entity ids. A scenario entity cannot override component values, so the sandbox road template stores the Capital and Northern Village ids directly. Names are not the graph keys. A pair can have both a scenario edge and a physical edge. Removing the physical edge leaves the scenario edge. Neighbor order is deterministic: scenario edges in stored order, then physical links by entity id. The sources are ordinary component state, so a save keeps them. `InitGame` does not run again on load.

`InfrastructureLink` is the physical fact that one world entity joins two settlement entity ids. It also stores operational condition from 0 to 100. One hundred is fully open. Zero carries nothing and drops that physical edge. A condition from 1 to 99 keeps the edge. The link does not walk the graph and does not change `stateIntegration` itself. `OnHealthChanged` copies the health fraction into condition, with any positive hitpoints kept at least at 1. Health cannot raise a road once hitpoints are 0, so `SetCondition` is the restoration path until a repair action exists. The sandbox road uses `DeathType` remain, so a fatal hit leaves the entity in place at condition 0. Its visual is a temporary dirt-road decal. Obstruction is disabled, so the decal does not block movement. The graph is still not a distance, and it does not read the pathfinder. Roads do not affect unit pathfinding or speed.

In the 1961 sandbox the physical road joins Capital and Northern Village. An abstract edge joins Northern Village and Southern Village. Western Village has neither. Southern Village's capital path is Southern, Northern, Capital. Destroying or zeroing the road disconnects both Northern and Southern. An abstract edge is treated as condition 100. A physical hop uses that link's condition. Route condition is the lowest hop on the path.

A settlement is connected when a path of those edges reaches the single capital of the same sovereign owner. The walk does not enter a settlement standing in another sovereign state, so an edge across the border does not make a foreign settlement part of Nation's capital network, and it does not bridge two Nation settlements through foreign land. The capital is not treated as connected to itself. A state with no capital connects nothing.

Every `UpdatePeriod` of 10000 simulation milliseconds, one `Timer.SetInterval` adds `IntegrationGain` of 1 to each connected non-capital settlement. `ChangeStateIntegration` clamps the result to 0–100. Disconnected settlements and the capital stay at their current values. The timer id is component state and `Timer` serializes the callback, so a save keeps the remaining interval. This growth is prototype timing, not a finished balance, and it is the only integration driver so far.

### Demographic population and representative capacity

Two population numbers stay distinct.

```text
DEMOGRAPHIC POPULATION
NationSettlement.population
= actual simulated people

        ↓ derived capacity

REPRESENTATIVE POPULATION
upstream Pyrogenesis population primitive
= physical-agent capacity
```

`NationSettlement.population` is the only demographic store. `RepresentativeCapacity` does not keep a copy. It reads `NationSettlementManager.GetTotalPopulation`, which sums settlements by `Sovereignty`, not by entity `Ownership`. A settlement standing in Nation's land counts for Nation even when its `Ownership` component says otherwise.

The prototype ratio is gameplay tuning, stored once as `RepresentativeCapacity.PeoplePerSlot`:

```text
100 demographic people → 1 representative capacity
representativeCapacity = floor(totalDemographicPopulation / 100)
```

Player 1's 33500 people derive 335 slots. Neighbor's 4000 derive 40. One visible unit is not a claim that the unit is exactly 100 humans. Later modifiers may include state integration, mobilization, institutions, recruitment, employment, age structure, legitimacy, occupation, or conscription. None of those change the ratio yet. Integration, food shortage, and discontent do not.

The native limit is `min(maximum, population bonuses)`. Houses and civic centres normally add bonuses. The gamesetup default maximum is 300, so a derivation of 335 would be hidden if only the bonus were set, and a leftover building bonus would raise the limit if the maximum were left higher. `RepresentativeCapacity` therefore writes the derivation into both fields. It does that once, from a zero-delay timer started in `OnInitGame`, because `Sovereignty` loads its regions in its own `OnInitGame` and the handler order is not fixed. A population change broadcasts `NationPopulationChanged` and the same write runs again. It does not poll. The current count is still the sum of unit population costs. Training uses `Player.TryReservePopulationSlots`, which is what `Trainer` already calls. A batch that would pass the limit is rejected and the count does not increase. If demographic population falls so the limit is below the current count, existing units stay. The display can read above the limit, and further population-cost training stays rejected until the count drops. Destroying a unit still subtracts its cost. Creating or destroying a unit does not add or remove demographic people.

Nation settlement templates already disable the house population bonus. The sandbox civic centres are Nation children of the Athenian and Spartan civic centres with that bonus disabled. An Athenian civic centre would otherwise add 20, and destroying it later would subtract 20 from a bonus total that had already been replaced. Logging camps, the quarry, the mine, the grain field, and roads do not carry a population bonus. After the derivation is written, the maximum equals it, so a later building bonus cannot raise the limit above that maximum.

Government workers and soldiers use the inherited unit population cost of 1 and therefore take one representative slot each. The logger, quarry worker, and miner inherit that cost from the woman citizen. Rebel fighters stay at population cost 0. They belong to the rebel player. They do not spend Nation's representative capacity, and spawning them does not reduce `NationSettlement.population`.

The session line keeps demographic population as `Population`. A second line, `Representative units`, shows the native count and limit. That label is provisional. The native count includes civilian workers and soldiers, so it is not a mobilization pool and it is not the country's population. The stock population counter remains the upstream readout.

The derived maximum, the derived bonus, and the current count live on the `Player` component, which already serializes them. `RepresentativeCapacity` stores nothing of its own. A loaded game does not run `OnInitGame` again, so the saved values are not applied a second time. Another refresh writes the same capacity.

### Government finance

`GovernmentFinance` stores each real player's treasury as a whole number of currency units. It does not use `Player` resource counters. Those counters are food, wood, stone, metal, and the other upstream commodities, with gatherers, tribute, and barter. Nation government cash is a separate fact.

Scenario `ScriptSettings.GovernmentFinance` lists `{player, treasury}` rows. A gamesettings attribute copies them into `InitAttributes.settings`. The 1961 sandbox starts Nation at 10000000 and Neighbor at 5000000. A player with no row has treasury 0. A malformed list stores no cash. The accounts are ordinary component state, so a save keeps the balance after income and spending.

One `Timer.SetInterval` of `RevenueInterval`, 10000 simulation milliseconds, calls `CollectRevenue` for every real player. `GetRevenuePerTick` is `Math.floor(GetTotalPopulation(playerId) / PeoplePerRevenueUnit)`. `PeoplePerRevenueUnit` is 100, so Nation's 33500 people yield 335 and Neighbor's 4000 yield 40. The remainder is discarded and does not accumulate. The population is read on each tick. It is not cached, and it is not multiplied by state integration. This population revenue is temporary scaffolding. Future government revenue should come from the economic system rather than from population alone.

`Spend` subtracts a non-negative integer when the treasury can cover it and otherwise leaves the balance unchanged. `AddFunds` accepts only a positive integer, so exports, aid, or loans can pay the treasury later without using a negative amount as a hidden spend. The pending timer id serializes with the component, and `Timer` serializes the callback. A loaded game does not run `InitGame` again, so the interval is not scheduled twice.

### Cocoa production

`CommodityProducer` is an entity component for aggregate regional output of one commodity. It stores a commodity id, `productionPerTick`, and `stock`. The template sets those values. Stock is not a gatherable pile, and it is not a `Player` resource counter. `Produce` adds `productionPerTick`. `RemoveStock` removes a positive integer that does not exceed the stock, and otherwise leaves the stock unchanged. Invalid data is rejected: a blank commodity, a negative production rate, or a negative starting stock stores an empty commodity and zero stock.

The 1961 sandbox attaches cocoa production only to Southern Village: 100 units each interval, starting from an empty stock. The capital and the other villages do not produce. Production does not read population, state integration, or connectivity.

`CommodityProductionManager` runs one `Timer.SetInterval` of 10000 simulation milliseconds and calls `Produce` on every `CommodityProducer`. `CommodityExportManager` runs one interval of 25000 simulation milliseconds. It sells to an abstract buyer at a fixed prototype price, 10 currency units per cocoa unit. The quantity is `floor(stock * routeCondition / 100)`, where `TransportEfficiency` reads the path to the capital. Unsold stock stays on the producer. A producer with no stock, or with route condition 0, adds no money. A commodity with no price stays in stock. The buyer is not a port, a neighbor, or a trade route. That abstract world buyer remains as a spot-export channel. While the seller has an open bilateral contract for the same commodity, this sale is skipped, so the same stock cannot be sold twice. When no such contract is open, the world buyer can purchase again. Prices do not move, and foreign exchange is not modeled. Population-based government revenue remains temporary scaffolding beside this. It does not read road condition.

The government that is paid is the sovereign owner of the producer's position, from `Sovereignty.GetSovereignOwner`. Entity `Ownership` is not consulted. `CommodityExportManager` calls `GovernmentFinance.AddFunds` with `exported quantity * price`. It does not write the treasury itself, and it does not subtract a penalty for a damaged road. It remembers units actually exported and the revenue from those units. The production timer is started before the export timer. When both deadlines fall on the same simulation time, production runs first and that output is included in the sale. On a healthy road the first export, at 25 seconds, sells 200 cocoa for 2000 and stock returns to 0. At condition 50 the same stock sells 100 and keeps 100.

Partial infrastructure damage reduces economic throughput before it breaks state connectivity. Condition above 0 still counts as capital-connected, so integration keeps growing by 1. Condition 0 drops the physical edge, stops that integration growth, and stops the cocoa that depended on the edge. Destroyed or unusable infrastructure can sever both transport and state connectivity. The integration timer still does not scale by the condition percentage.

### Infrastructure repair

`InfrastructureInvestment` is the transaction between the treasury and a physical link. The session button does not change either one. It posts `nation-repair-infrastructure` through `Engine.PostNetworkCommand`. `ProcessCommand` runs that entry in `g_Commands`, and the simulation calculates the cost again. A quote from `GetRepairQuote` is attached to `GetEntityState` for display. The GUI does not have its own cost formula.

The issuing player may repair a link when that player owns the link entity. Settlement roads, commercial roads, and a cross-border road use that same command. Sovereignty of the endpoints does not grant the repair, and one state cannot spend its treasury on another state's link. Construction of a new settlement road still requires both endpoints to stand in the issuer's sovereign territory. The cost is `floor(1000000 * (100 - condition) / 100)`. Condition 100 costs 0 and is refused, so a healthy road is not charged. The repair spends that cost with `GovernmentFinance.Spend` and then calls `SetCondition(100)`. If the spend cannot be made, the road stays as it is. Repair is instantaneous. There is no crew and no duration. Cocoa that accumulated while the road was closed stays in stock and can be sold on a later export, because the export manager still reads `TransportEfficiency` and is not told about the repair. Integration growth returns only because the physical edge is operational again. The repair does not add export income. Any later income is a separate export. A road created later uses this same repair.

### Infrastructure construction

A new road is a predefined scenario investment, not a drawn route. `ScriptSettings.InfrastructureProjects` lists each project: id, the two settlement entity ids, the treasury cost, the road template, and the placement. A gamesettings attribute copies that list into `InitAttributes.settings`. `InfrastructureInvestment` reads it in `InitGame` and keeps it as component state, so a save still knows the offer without running `InitGame` again. The 1961 sandbox offers one project, `capital-western-road`, joining Capital entity 30 to Western Village entity 32 for 2000000. Western Village starts with no link.

```text
GovernmentFinance
        ↓
InfrastructureInvestment
        ↓
physical InfrastructureLink creation
        ↓
SettlementConnectivity
        ↓
state integration eligibility
```

The session button appears when Western Village is selected. It shows `GetConstructionQuote`: the cost, whether the treasury can pay, population, integration, and whether the settlement is already capital-connected. The button posts `nation-construct-infrastructure` with the project id through `Engine.PostNetworkCommand`. It does not spend money and it does not create an entity. The simulation reads the stored project again. It accepts the command only when the issuer is a real player, both endpoints currently stand in that player's sovereign territory, no usable `InfrastructureLink` already joins the pair, and `GovernmentFinance.CanAfford` accepts the stored cost. Entity `Ownership` is not the authority test. A project that crosses into another sovereign state is refused.

`Construct` then calls `Spend` and `Engine.AddEntity`. The new entity must be a usable link at condition 100 between those two settlements, with a position that can be placed. If it is not, the entity is destroyed and `AddFunds` returns the cost. The project record supplies `JumpTo` and `SetYRotation`. The 1961 road is placed at the midpoint (65, 320). One dirt-road decal marks that connection. It does not pave the full distance, about 206 metres. Gameplay uses the single `InfrastructureLink`, not the length of the decal.

The spawned component's `Init` calls `SettlementConnectivity.RefreshPhysicalLink`. The graph is not rebuilt on later turns. Condition above 0 keeps the edge, condition 0 drops it, and destroying the entity drops it. Repair of that road is the existing `nation-repair-infrastructure` command. `TransportEfficiency` sees the new path, so Western Village to the capital is efficiency 1 while the link is open. Western Village still produces no cocoa, so the road does not create export income.

Construction does not call `ChangeStateIntegration`. Western Village stays at 20 until the existing integration timer sees the new capital path and adds 1. A second command finds the link and spends nothing. Condition 0 still counts as built: the road is repaired, not purchased again. Completion is that link's existence, so it survives save and load with the entity.

Construction spends treasury only. It does not consume food, wood, stone, or metal. That treasury-only cost is prototype scaffolding until Nation's physical resource economy is integrated. Construction is instantaneous. There is no crew, no duration, and no material bill.

### Physical resources, commodities, and the treasury

Nation keeps three separate stocks.

```text
PHYSICAL NATIONAL RESOURCES
food
wood
stone
metal

TRADE COMMODITIES
cocoa
future coffee/cotton/etc.

GOVERNMENT FINANCE
treasury
```

Food, wood, stone, and metal are the upstream `Player` resource counts. `Player.Init` starts each of them at 300. A scenario `PlayerData.Resources` entry replaces only the named counts. The 1961 sandbox sets Player 1 food to 1000 and leaves wood, stone, and metal at 300. Player 2 is unchanged, so those four counts stay 300. `GovernmentFinance` does not read them. Cocoa is not one of them.

The session resource panel already shows `resourceCounts.food`. There is no Nation food panel.

### Food production

A field is a `ResourceSupply` of `food.grain`. The public field template supplies an infinite amount, so the crop does not run out. A worker with `ResourceGatherer` takes one unit per gather tick into a carry capacity. At a `ResourceDropsite` that accepts food, `CommitResources` calls `Player.AddResources` for the worker's owner. The stockpile does not change until that deposit. Destroying the field or stopping the worker ends the gathering. Population does not remove food. The treasury does not receive it. `CommodityProducer` is not involved.

The 1961 sandbox places one grain field, entity 50, at (230, 60), owned by Player 1, beside Southern Village. The actor is the upstream tropical field. The resource is grain, used here as the first staple. One farmer, entity 51, stands at (214, 60). The template is the Athenian woman citizen, so the gather rate for `food.grain` is 0.5 per second and the food capacity is 10. `InitialGather` orders that farmer to gather entity 50 on the first simulation turn. The player can still select the farmer and issue the normal gather command. Southern Village accepts food deposits and is not shared. The Athenian civic centre also accepts food, and it is farther away, so the farmer returns to the village.

A full load is 10 food and takes 20 seconds of gathering, plus the walk to the field and back to the village. Population consumption and that deposit use the same stockpile. With the farmer working, the first load of 10 arrives between the 20-second and 30-second consumption ticks, so the 30-second tick spends 335 from 340 and leaves 5. Destroying the field stops new gathering. Food already in hand is still deposited.

### Forestry, quarrying, and mining

```text
PHYSICAL RESOURCE ECONOMY
food  → agriculture
wood  → forestry
stone → quarrying
metal → mining
```

All four use the same upstream path:

```text
physical source
→ representative worker
→ ResourceGatherer
→ carried inventory
→ ResourceDropsite
→ Player resource stockpile
```

Wood, stone, and metal are not `CommodityProducer` output and they are not treasury. Gathering them does not create export income. Construction still spends treasury only. The workers are representative agents. Their native population cost is the inherited unit cost of 1, so each one uses one representative slot. They are not subtracted from settlement population.

A deposit is not the facility. The timber stand, stone deposit, and metal deposit are finite `ResourceSupply` entities. The logging camp, quarry, and mine are player-owned dropsites. A facility does not generate resources on a timer. Upstream exhaustion destroys a finite supply at amount 0, and Nation does not respawn it.

The inherited worker is the Athenian woman citizen, so one gatherer can cut `wood.tree` at 0.7 per second, and quarry `stone.rock` or mine `metal.ore` at 0.35 per second. Carry capacity is 10 for each. `InitialGather` was already a per-entity target, not a farmer-specific order. The logger, quarry worker, and miner templates each name their own supply. `OnInitGame` schedules that one gather order. A loaded game does not run it again.

The 1961 sandbox places the three industries in Player 1 land, clear of the settlements, the farm, and the roads:

```text
Timber stand 60 at (140, 310), Gaia, teak, 500 wood
Logging camp 61 at (172, 310), Player 1, wood dropsite
Logger 62 at (156, 310)

Stone deposit 63 at (140, 200), Gaia, 1000 stone
Quarry 64 at (172, 200), Player 1, stone dropsite
Quarry worker 65 at (156, 200)

Metal deposit 66 at (140, 140), Gaia, 1000 metal
Mine 67 at (172, 140), Player 1, metal dropsite
Miner 68 at (156, 140)
```

The camp, quarry, and mine inherit the storehouse, including `Health` and `Resistance`, and accept only their own resource. They are not shared. `CommitResources` credits the worker's owner. A neighbor cannot use the normal return check on these dropsites. Destroying the facility removes that dropsite. Resources already in hand stay on the worker. Upstream orders may then look for another dropsite that accepts the type. The civic centre accepts all four resources, so it can become that fallback. The deposit itself is left in place. A rebel damages a facility through ordinary `Health.TakeDamage`. There is no extraction-specific attack.

### Industrial production

```text
PRIMARY PHYSICAL RESOURCES

food
wood
stone
metal

        ↓

INDUSTRIAL TRANSFORMATION

wood + stone + metal
→ construction materials factory
→ construction_materials

        ↓ future

construction / development
```

`construction_materials` is a Player resource, registered by `simulation/data/resources/construction_materials.json`. It is a broad stand-in for milled lumber, cement inputs, and fabricated metal, not one literal substance. It is not treasury and it is not a `CommodityProducer` output. Cocoa export does not know about it, and the factory does not know about cocoa. State-capacity research spends it. Roads, buildings, and other construction still cost treasury only.

Extraction and industry meet in the national stockpile. A logger, quarry worker, or miner still carries a load to a dropsite, and that dropsite credits the owner's Player resources. `IndustrialProduction` then reads that same stockpile. The factory does not keep a local inventory, and the output is not carried out of the building. That is a V1 abstraction. Later logistics can require a physical delivery. The recipe is template data, so another industry can be a new entity template rather than a new component.

The 1961 sandbox has one factory, entity 70, `structures/nation/construction_materials_factory`, owned by Player 1 at (210, 250). The actor is the Hellenic forge. The forge template writes a maximum of 2000 hitpoints; in the sandbox the entity reports 2200. Population cost is 0. Every 10000 simulation milliseconds the recipe requires 10 wood, 10 stone, and 5 metal, and it adds 10 construction materials. All three inputs must be present. Otherwise the cycle changes nothing. The next interval tries again without a restart. The owner is read when the cycle runs, so a later capture spends the new owner's stockpile. Gaia and an invalid owner produce nothing. Damage does not slow the recipe. Destroying the factory cancels the timer, and a later tick cannot find the component. The factory does not change demographic population or representative capacity.

Both players, and the rebel player, start with 0 construction materials. The stock resource bar has five slots, four resources and population, so the manufactured resource is not given a sixth icon. The Nation status line shows `Construction materials`.

The timer id is component state and `Timer` serializes the callback. A loaded game does not run `OnInitGame` again, so the interval is not scheduled twice.

### State capacity progression

```text
CONSOLIDATION
new/weak state
basic agriculture
basic extraction
inherited basic industry

        ↓
productive foundation
+ manufactured materials
+ phase research

DEVELOPMENT
expanded industrial/development capability

        ↓
greater industrial foundation
+ manufactured materials
+ phase research

ADVANCED STATE
high-capacity state
future major projects / administration
```

Phase state remains authoritative in Pyrogenesis's existing technology system. There is no Nation phase counter.

The player-facing names are Consolidation, Development, and Advanced State. They are levels of state capacity, not historical ages. The internal ids stay the upstream phase ids because templates, the session GUI, and `replaces` already speak those ids:

```text
phase_village                         Consolidation
phase_town_athen / phase_town_generic Development
phase_town                            Development, marked by replaces
phase_city_athen / phase_city_generic Advanced State
phase_city                            Advanced State, marked by replaces
```

`phase_village` is `autoResearch`, so every player, including the neighbor and the rebels, starts in Consolidation on the first simulation update. The civil centre already offers `phase_town_{civ}` and `phase_city_{civ}`. Athen uses the athen files. Spart has no civ file, so the neighbor uses the generic files. Nation replaces those JSON files. The dummy `phase_town` and `phase_city` files keep their ids and carry the player-facing names, because build requirements and `GuiInterface` ask about those ids. When Development finishes, `replaces` marks `phase_town` researched. Advanced State does the same for `phase_city`.

`GuiInterface` still reports `village`, `town`, or `city`. The Nation status line maps those to Consolidation, Development, and Advanced State. The research button uses the technology `genericName`, cost, requirements tooltip, and the normal progress bar.

Future systems should ask the player's `TechnologyManager`:

```text
IsTechnologyResearched("phase_town")    at least Development
IsTechnologyResearched("phase_city")    Advanced State
```

Template gates use the same ids in `Identity/Requirements/Techs`. Do not store a second phase.

Development requires one logging camp, one quarry, one mine, and one construction-materials factory, counted by class: `NationLoggingCamp`, `NationQuarry`, `NationMine`, `NationConstructionMaterialsFactory`. Foundations do not count. The research cost is 20 construction materials, paid by `TrySubtractResources` when the research is queued. It takes 30 seconds. Advanced State requires Development, because it supersedes `phase_town_athen` or `phase_town_generic`, plus two construction-materials factories, plus 50 construction materials, over 60 seconds. Food, wood, stone, and metal are not phase costs. The vanilla gather, attack, and territory modifications are not copied.

The treasury is not part of this cost. Technology costs subtract Player resources. `GovernmentFinance` is a separate stock. Charging it from research would need a second payment beside `TrySubtractResources`, including a refund if the player cancels, and it would couple the treasury to the upstream queue. That hook is omitted.

The Athenian team bonus halves research time at a civil centre. The Nation civil centre sets `Researcher/TechCostMultiplier/time` to 2, so that bonus cancels and the program takes the template time: 30 seconds, then 60. The material cost is not food, wood, stone, or metal, so the same bonus does not change it. The neighbor is Spart and does not have that bonus. Rebels have no researcher.

The research command checks `CanResearch` before queueing. If a required structure is gone, the command does not start and nothing is spent. `Technology.Progress` does not check requirements again. A structure destroyed during the 30 or 60 seconds does not cancel the program. That is upstream behavior.

New construction of `structures/nation/construction_materials_factory` requires `phase_town`. The sandbox factory, entity 70, is already placed, so it exists and produces during Consolidation. That avoids a loop where the first factory both requires Development and is required to research it. Farmers and extraction workers can place another factory only after Development. A second factory is another `IndustrialProduction` entity with the same template recipe. Regional administration, `structures/nation/regional_administration`, requires `phase_city`. It is a root `TerritoryInfluence` with radius 72 and weight 4000, weaker and smaller than the capital civic centre (radius 140, weight 10000). It has no population bonus, costs 0 population, and does not change integration. The neighbor civic centre stands near Eastern Neighbor Village and uses radius 90 and weight 10000. That covers the village. A circle large enough to reach the village from the old southern site would also have covered Nation's factory and Southern Village, so the centre is placed near the village instead.

Phase research does not change settlement population, representative capacity, integration, or discontent. The phase files have no `modifications`.

### Population food consumption

```text
NationSettlement population
        ↓
NationSettlementManager
        ↓
PopulationFoodConsumption
        ↓
existing Player food resource
```

One `Timer.SetInterval` of 10000 simulation milliseconds runs `ConsumeFood` for every real player. Gaia is skipped. A player with no Nation population has a requirement of 0 and loses no food. The population is `GetTotalPopulation`, which sums settlements by `Sovereignty`, not by entity `Ownership`. There is one national stockpile. Roads do not decide which settlement receives food, and the tick does not change population, integration, or the treasury.

The prototype rate is 1 food per 100 people per tick:

```text
required = ceil(population / 100)
consumed = min(required, floor(available food))
unmet = required - consumed
```

Player 1's 33500 people require 335. Neighbor's 4000 require 40. This is gameplay tuning, not a caloric conversion. `TrySubtractResources` removes only `consumed`. The call is not made for zero, and it is never asked for more food than the stockpile holds, so the count does not go negative. A deposit from a farmer between ticks is ordinary player food and is available to the next tick.

The latest interval is the current shortage. Fulfillment is `Math.round(consumed * 10000 / required)` basis points, and shortage basis points are the remainder to 10000. A country with no requirement is fulfillment 10000 and shortage 0. Before the first tick the requirement is already the live population and the shortage is 0. `cumulativeUnmet` adds each interval's unmet food and is not cleared when a later interval is fully fed. Nothing in the game reads that total yet.

The session line under the resource counters reads `nationFood` from `GetSimulationState`. It shows population, food demand per interval, and food shortage as a percent. It does not compute the requirement itself. One farmer at half a food per second does not cover 335 food every ten seconds. The sandbox is expected to reach a shortage. The treasury does not buy food by itself.

### Food imports

```text
COCOA
→ exports
→ TREASURY
→ food imports
→ FOOD
→ population consumption
```

Those steps meet only through the treasury and the Player food stockpile. `CommodityExportManager` does not know about imports. `FoodImportManager` does not know about cocoa. `PopulationFoodConsumption` does not know an import happened. A purchase does not write shortage state. The next consumption tick is what decides whether the new food covers demand.

`TradeAccess` is a separate directional grant, `{from, to, trade}`, copied from scenario `ScriptSettings` the same way as `MilitaryAccess`. `CanTrade(fromPlayer, toPlayer)` returns the first matching grant. A missing grant is denial. A grant from Nation to Neighbor does not grant Neighbor to Nation. It does not read `Diplomacy`, `DiplomaticAccess`, roads, or distance. The 1961 sandbox grants trade from player 1 to player 2 only. Military access stays false in both directions.

`FoodImportManager` stores repeatable offers. The sandbox offer is `neighbor-food-import`: buyer 1, seller 2, 1000 food, treasury cost 500000. Those two numbers are prototype gameplay values, not a currency conversion. The session button posts `{type: "nation-purchase-import", offer: "neighbor-food-import"}`. The simulation recomputes the buyer, the seller, trade permission, the cost, and the amount. A command that also carries a price or a quantity is ignored. The buyer must be the issuing player and the offer's buyer. `CanAfford` and `Spend` use `GovernmentFinance`. `AddResource("food", amount)` uses the same Player stockpile as a farm deposit. If the food count does not rise by the purchased amount, the treasury spend is returned. The seller's food and treasury are not changed. Neighbor is treated as an external commercial supply. The purchase does not require a shortage, a road, a port, a market, or a cocoa export. It can be bought again while permission and treasury remain.

Food imports currently abstract international transport and seller inventory. Trade permission and treasury are sufficient. Physical international logistics will be added later.

### Settlement discontent

```text
FOOD SHORTAGE
      ↓
national food pressure
      ↓
each sovereign settlement
      ↓
state integration modifies vulnerability
      ↓
settlement discontent
```

Discontent is an integer from 0 to 100 on each `NationSettlement`. The sandbox starts every settlement at 0. `SettlementDiscontent` does not keep a second national total. `GetNationalDiscontent` is the population-weighted mean, rounded, and is 0 when a sovereign has no settlement population.

`PopulationFoodConsumption` broadcasts `FoodConsumptionCompleted` after it has stored the interval. `SettlementDiscontent` listens and reads `GetFoodStatus`. There is no second timer, so the evaluation cannot run before that interval or twice for one interval. A loaded game keeps the settlement number and the existing food timer. The listener is the component method, not another scheduled callback.

Food pressure is `round(shortageBps * 10 / 10000)`, so a full shortage is 10 points and about half a shortage is 5. Integration vulnerability is `floor((100 - stateIntegration) / 20)`, read live. It is added only when food pressure is greater than 0. A fed settlement with low integration does not become discontented. A full shortage therefore adds 10 at the capital, whose integration is 90, and 14 at Western Village, whose integration is 20. When the latest shortage is 0, each settlement loses 5, clamped at 0. `cumulativeUnmet` is not used. The score is intensity, not a larger number for a larger settlement.

Roads change this only by changing integration. A destroyed road does not add discontent by itself. Discontent does not lower integration, treasury, cocoa, farming, or imports. `FoodImportManager` does not write it. An import changes Player food. The next consumption interval clears the shortage. That same completion then starts the recovery of 5. Discontent does not spawn units and does not damage roads. After the settlements have been updated, `SettlementDiscontent` broadcasts `SettlementDiscontentCompleted`. The session line shows the derived national discontent and the count of active rebellions. Selecting one settlement shows that settlement's population, integration, discontent, and rebellion status from `GetEntityState`. The GUI does not calculate those numbers.

### Physical rebellion

```text
food shortage
→ settlement discontent
→ sustained extreme discontent
→ physical rebel entities
→ ordinary RTS combat
→ physical infrastructure damage
→ existing connectivity and economic consequences
```

`RebellionManager` listens for `SettlementDiscontentCompleted`. It does not read the food stockpile and it does not calculate discontent. A settlement is in an extreme interval when its discontent is at least 80. Two consecutive completed evaluations are required. Dropping below 80 clears that count before a group exists. The count, the active flag, and the associated entity ids are serialized.

The first qualifying pair spawns exactly three `units/nation/rebel_fighter` entities. They inherit an upstream spearman, so they move and fight through `UnitAI`, `Attack`, and `Health`. Placeholder ancient visuals are intentional. The template removes `ConquestCritical` and sets population cost to 0, so destroying the group does not defeat the rebel player and does not change aggregate settlement population. The three entities are representative agents, not one-to-one members of the settlement population.

Spawn positions are fixed offsets from the settlement: `(x + 8, z)`, `(x - 6, z + 6)`, and `(x - 6, z - 6)`. The opposed government is `GetSovereignOwner`. Entity `Ownership` is not consulted. The sandbox rebel slot is player 3. Nation's diplomacy toward that slot is enemy, and the rebel slot's diplomacy toward Nation is enemy. Neighbor stays neutral with both. Hostility is `Diplomacy`, not `TradeAccess` or `DiplomaticAccess`. V1 has one rebel player. A settlement whose sovereign is the neighbor still records that neighbor as the opponent, and its fighters are still owned by player 3. They are not given a separate hostility toward the neighbor.

One settlement has one active V1 group. Further extreme intervals do not spawn another group while any associated rebel is alive. When the last associated rebel is dead, or no longer owned by the rebel player, the group becomes inactive and the extreme count returns to 0. That same evaluation does not count as a new extreme interval. Two later qualifying evaluations can create another group. Killing rebels does not reduce the settlement's discontent. If rebels already exist and discontent later falls below 80, they stay in the world until normal gameplay removes them.

Rebellion does not directly modify economic or state variables. Its initial consequences emerge from physical entities acting on the RTS world. A rebel attack uses the ordinary damage path: `Attack` to `Health.TakeDamage`, then `HealthChanged`, then `InfrastructureLink` copies hitpoints into condition. Rebellion code does not call `SetCondition`. Nation roads already inherit `Resistance` and `Health` from `template_structure`, with maximum hitpoints 100 and `DeathType` remain, so an enemy melee unit can damage them without a special attack. At condition 0 the existing graph drops that physical edge. Connectivity, transport efficiency, cocoa exports, and repair then behave as they already do. The existing repair action is what restores a ruined road.

The 1961 sandbox builds no rebel base, rebel economy, or rebel territory. Rebels do not change legal sovereignty.

**Economy.** Government cash is `GovernmentFinance`. Cocoa is aggregate settlement output, sold through `CommodityExportManager`. It is not a gatherable `Player` resource. Transport can be a quantity moving between entities, with a truck as the visible agent, when that slice starts. `Market` and `Barter` are ancient trade. Use them only if a slice genuinely fits.

**Diplomacy.** `Diplomacy` stores ally, enemy, and neutral stances on each player. That stance is not permission to enter sovereign land, and it is not permission to trade. `MilitaryAccess` is a separate directional grant, and a missing grant is denial, including between neutrals. The 1961 sandbox starts Nation and Neighbor neutral toward each other and grants military access in neither direction, so a crossing is still unauthorized. `TradeAccess` is the separate grant that allows a government food purchase. Transit rights, customs, investment, and loans are further agreements. Crossing a tile can remain physically legal in the pathfinder while a Nation component records it as unauthorized.

**Foreign powers.** A power with no map presence can be a player entity with no units, or a small system component. The first slice needs one power and one loan. It does not need the United States, the USSR, Britain, France, and China as content.

**Population.** `Population` in upstream code is a housing bonus. Nation population is aggregate settlement data and is the demand for Player food. It does not fall when food runs out. Employment, healthcare, education, services, prosperity, and unrest are later settlement concerns. Visible civilians are representative entities, not one entity per person.

**War.** Keep `Attack`, `Health`, `UnitAI`, and the pathfinder. Feed them from the same roads, stocks, and treasury used in peacetime. Occupied land stays a different fact from sovereign land.

## Diplomacy, Trade, and Agreement Primitives

This is the audit of the upstream pieces a bilateral agreement can sit on. The labels are what Nation should do with each one.

### Diplomacy — REUSE DIRECTLY for stance, NOT SUITABLE as the agreement

`Diplomacy` stores one stance per other player: ally `1`, neutral `0`, enemy `-1`. `Ally`, `SetNeutral`, and `SetEnemy` write that player's row only. Mutual hostility is two writes. A change broadcasts `DiplomacyChanged`. Allies can share line of sight and dropsites after the techs named on the component. Teams force mutual alliance. The `diplomacy` command refuses changes during an active ceasefire and refuses them when the team is locked.

There is no structured offer. `diplomacy-request` and `tribute-request` only push an event into `AIInterface`. Petra may answer. A human receives chat, not a package that the simulation can accept. Stance stays the war/peace fact. It does not grant military access, trade access, cash, or resources.

### Tribute — ADAPT the stockpile write, do not call the tribute command

`Player.TributeResource` moves a map of resource amounts immediately. The command is `tribute`. The diplomacy panel sends it. Amounts must be non-negative integers, and every code must be in `Resources.GetTributableCodes()`. Food, wood, stone, and metal are tributable. `construction_materials` is a registered Player resource with no tributable property, so tribute rejects it. Tribute does not read diplomacy. It does not move treasury. It notifies, counts statistics, and broadcasts `TributeExchanged`. If any code is invalid, or the payer cannot afford the whole map, it returns before `AddResources`. That is one-way and immediate. It cannot express "P2 also pays metal, and both grants happen, or nothing does."

Agreements therefore call `TrySubtractResources` and `AddResource` on the same `Player` stockpiles. Those calls work for every code in `Resources.GetCodes()`, including construction materials. The agreement component decides whether the whole package may run.

### Barter — NOT SUITABLE

`Barter.ExchangeResources` sells one of a player's resources for another of the same player's resources. Prices are global, move after each deal, and only exist for `GetBarterableCodes()`. The seller and the buyer are the same player. A market with the `Barter` class is a permission to use that desk, not a foreign partner. Construction materials are not barterable. The panel looks like an exchange. It is not a bilateral agreement.

### Trade — ADAPT later for physical routes, do not use it for the agreement

`Trader` on `template_unit_support_trader` walks between two `Market` entities. `CanTrade` requires a finished market, a matching land or naval type, and a trader who is not an enemy of the market owner. `PerformTrade` calls `GetNextTradingGoods` and `CalculateGain`, then `AddResource` creates new stock for the trader's owner and sometimes the market owners. It does not remove stock from the other country. Destroying a market drops the route. The merchant ship is `template_unit_ship_merchant` with the same `Trader` behavior at sea.

That is the physical-route primitive:

```text
TRADE ACCESS     legal permission, TradeAccess
TRADE ROUTE      two Markets and a Trader path
TRADE CAPACITY   gain multipliers and how many traders are running
AGREEMENT        what the governments promised
```

None of those four is the others. A signed agreement does not move goods down a road. A trader's generated income is not fulfillment of a resource term.

### Merchant, spy, and hero — NOT SUITABLE as a diplomat

The reusable unit is the trader, class `Trader`, plus the merchant ship. `special/spy` is a bribable vision unit. `Hero` is a class that puts a portrait on the panel and changes Petra's targeting. There is no envoy, diplomat, ambassador, or emissary template, and no unit command that opens a negotiation.

### Embassy — NOT SUITABLE as built

Carthaginian `embassy_celtic`, `embassy_iberian`, and `embassy_italic`, and the Kush camps, parent `template_structure_military_embassy`. That template is a phase-town military building: garrison, production queue, trainer, and `TerritoryInfluence` radius 25. Petra treats those templates as unit-production buildings. An embassy that paints territory would be read as effective control. Nation should not reuse that template for diplomacy.

A later Nation embassy should be an ordinary structure with Health and ownership, and without `TerritoryInfluence`. Its job is a persistent negotiation channel in a foreign capital. It must not move legal sovereignty and it must not project effective control. That building is not in this step.

### GUI — CLONE / REBUILD as a Nation screen

`DiplomacyDialog` is a fixed row per player: name, civ, team, stance buttons, and one tribute button per tributable resource. Tribute amounts are 100, or 500 steps while a hotkey is held. `BarterButton` is a self-exchange desk. Neither widget can compose an offer list and a request list, and neither can carry cash or an access grant. Replacing the public dialog would fork a file Nation does not otherwise need to own.

The negotiation screen is Nation XML and JS included by the session directories `gui/session/session_objects/` and `gui/session/top_panel/`. It uses the existing image, text, button, and input widgets. It posts `nation-propose-agreement`, `nation-accept-agreement`, and `nation-reject-agreement`. It does not write simulation state itself.

### AI — do not reuse Petra's decisions

`DiplomacyManager` sends tribute to allies, asks allies for tribute, and answers `DiplomacyRequest` by demanding a single resource. The demand amount and the timers use `randFloat`. Cooperative personality drifts when tribute arrives. `tradeManager.js` builds markets and trains traders for generated trade income. Those are ancient skirmish heuristics. They are not a valuation of a package, and the random timers are not acceptable inside Nation simulation.

The later evaluator should be a Nation function that receives one `AgreementProposal` and the current simulation state and returns accept, reject, or a new proposal. It should not live inside Petra. This step does not call an evaluator. Nothing in the sandbox accepts a deal because a personality score said so.

## Bilateral agreements

`AgreementManager` is the one store for proposals. A proposal is a proposer, a recipient, the items the proposer provides, the items the recipient provides, a status, and a deterministic id. The id starts at 1 and increases by 1. Status is `pending`, `accepted`, `rejected`, or `invalidated`.

An item is `resource`, `cash`, `military_access`, `trade_access`, `loan`, or `debt_forgiveness`. `resource` names a code from `Resources.GetCodes()` and a positive integer amount. `cash` is a positive integer of treasury, not a Player resource. `military_access` and `trade_access` have no amount. A `loan` names principal, an interest rate in basis points, a count of installments, and a grace count. A `debt_forgiveness` names an existing debt id and a principal amount. Each stored item records `provider` and `beneficiary`. Items the proposer offers have provider = proposer and beneficiary = recipient. Items the proposer requests are the other way around.

```text
P1 offers military access
    DiplomaticAccess.GrantMilitaryAccess(P2, P1)
    P2's units may enter land sovereign to P1

P2 offers trade access
    TradeAccess.GrantTrade(P1, P2)
    P1 may buy from P2
```

`HasMilitaryAccess(from, to)` means `from` may enter `to`'s sovereign land. The provider of a military-access item is `to`. The beneficiary is `from`. `CanTrade(from, to)` means `from` may buy from `to`. The provider of a trade-access item is `to`. The beneficiary is `from`. Granting either right twice sets the existing row to true. It does not add a second row and it does not turn the right off.

Two resource rows for the same code on the same side are stored as one summed amount. Two cash rows on the same side are one sum. The sum is what must be in the stockpile or the treasury. Checking each row against the same balance is not enough, because 200 and 200 would both pass against 300.

Creating a proposal validates the shape and the current balances, then stores it. It does not subtract anything. Accepting checks the status, checks the balances again, and only then writes. There is no reservation. If food was 1000 when the proposal was made and consumption has since left 300, a 500 food term does not execute and the status becomes `invalidated`. A rejected or invalidated proposal cannot execute later. An accepted proposal cannot execute again.

Execution is atomic. The component builds the outgoing totals, refuses the whole proposal when any total does not fit, and only then subtracts every outgoing resource, adds every incoming resource, spends and pays treasury, and grants rights. Rights run last. If a write returns false after that point, resource counts and treasury balances are put back from a snapshot taken before the first write. Validation uses the same totals as execution, so that restore is the guard for an unexpected refusal rather than the normal path. A normal shortfall never starts the writes.

V1 resource and cash terms settle immediately, inside the player stockpile and the treasury. That is not the long-term meaning of a signature.

```text
AGREEMENT SIGNED
        ≠
OBLIGATION FULFILLED
```

A later item can still live in the same proposal arrays and mean "deliver 2000 food" by road, rail, port, or trader, instead of `AddResource` at the moment of acceptance. The proposal envelope does not have to change to allow that. `loan` and `debt_forgiveness` are accepted item types. Restructuring is not. A counteroffer is a new proposal whose `parentProposal` is the earlier id. Duration and unilateral revocation are not implemented. Revocation can later be an item that sets an existing `DiplomaticAccess` or `TradeAccess` row to false. Until then, a grant stays until some later system changes it.

The session screen lets the local player pick another country or an off-map power, add resource, cash, military-access, trade-access, loan, and debt-forgiveness rows to "we offer" or "we request", and post the proposal. Resource and map-access rows are omitted for an off-map power. Resource buttons use `nationAgreementResources` from the simulation, which is `Resources.GetCodes()` plus each resource's name. The amount field is a convenience. The simulation parses the command again and ignores the GUI's opinion of the balance. Accept is enabled only for a pending proposal whose recipient is the controlled player. The 1961 sandbox has one human. Neighbor is listed in `AgreementResponders` and answers through `AgreementAI`. A human recipient can still accept or reject by hand. The screen does not show utility numbers.

A future evaluator should score a proposal from the simulation, not from a fixed table of equivalents:

```text
utility(received) - utility(given) + strategic modifiers
```

Food is worth more in a shortage. Metal is worth more when industry is short of it. Cash is worth more when the treasury is tight. Military access costs more when the other army is already a threat. Trade access is worth more when a route could actually carry goods. Construction materials are worth more when a phase or a project needs them. Debt relief, once debt exists, is worth more when the burden is heavy. The result is accept, reject, or a new proposal. It has to be deterministic. Petra's `randFloat` timers are the thing not to copy.

```text
AGREEMENT          what the two states put in the proposal
TRADE ACCESS       TradeAccess, a legal permission
PHYSICAL TRADE     Trader and Market, movement and gain
INFRASTRUCTURE     whether a route can carry anything
TREASURY           GovernmentFinance, government money
```

## Agreement valuation

A proposal, a valuation, a response, and an execution are four different facts.

```text
AgreementManager
    stores the proposal and executes it

AgreementEvaluator
    scores that proposal for one country

AgreementAI
    accepts, rejects, or replaces it

AgreementManager
    executes the accepted proposal
```

`AgreementEvaluator` stores nothing. `EvaluateProposalData` walks the items the country gives, then the items it receives, from the stock and treasury as they would stand after the earlier items. Each row is an integer. Received utility is the sum of the positive rows. Given utility is the sum of the costs. The total is the difference. The same state and the same proposal produce the same breakdown. There is no random roll, no personality, and no language-model call.

Utility is not a price. `utility >= 0` accepts. `utility >= -200` and below 0 is a counteroffer. Below `-200` rejects. A hard-rejected row rejects the package whatever the other rows are worth.

Resource value is the integral of `scale * reference / (reference + stock)`. A unit is worth more when the stockpile is low. Food, wood, stone, metal, and construction materials each have their own scale and reference. Any other registered resource uses scale 1 and reference 200. Giving a quantity is the cost of the units that would leave. Receiving it is the value of the units that would arrive. They are not the same number when the stockpile is already thin.

Food multiplies that integral by food security from `PopulationFoodConsumption`. Full shortage (`shortageBps` 10000) multiplies by 5 before coverage. Eight or more intervals of stock on hand halves the value. Less than one interval multiplies by 4. A country with no food demand is not treated as being in crisis. Discontent is not read.

Wood, stone, and metal use the scarcity integral. If an owned `IndustrialProduction` entity cannot run its next cycle because that input is short, the value is multiplied by 2.5. No factory means no extra pressure. This is not a production plan.

Construction materials use the same integral, then the phase. Consolidation's next program costs 20. Development's costs 50. A stock below that cost is multiplied by 2.5. Advanced State with at least 200 on hand is multiplied by 0.6. A missing technology manager is treated as Consolidation, so an actor without a phase still treats the materials as useful.

Cash uses `132 * ln((500000 + treasuryAfter) / (500000 + treasuryBefore))`. A treasury of 100,000 values another 500,000 much more than a treasury of 20,000,000 does. The money stays in `GovernmentFinance`.

Military access the country already holds is worth 0. Granting it to a mutually hostile state is a hard reject, utility -1000, and no cash payment turns that into a counteroffer. Granting it otherwise costs 40, or 120 if that army is already inside the country or occupies one of its settlements. Receiving it is worth 25. If there is no unit list, the soldier count is 0 and the grant stays the ordinary cost. That is how an off-map power is scored: the economic terms still work, and the military term becomes the modest cost rather than a crash.

Trade access already held is worth 0. Receiving it is worth 15. Granting it costs 8. That is a legal permission, not a claim that a trader and two markets already connect the countries. Physical trade remains the upstream `Trader` and `Market` path.

`AgreementAI` answers a pending proposal whose recipient is in `AgreementResponders` or whose `Player.IsAI` is set. The rebel player is never answered. Neighbor is responder 2 and is not a Petra player. One second after the proposal is stored, it evaluates once. It does not rescore on later turns. The answered id is saved with the component, and the timer is the ordinary `Timer` timeout, so a loaded game does not answer twice and does not execute twice.

A counteroffer is a new proposal from the recipient back to the proposer, with `parentProposal` set to the original id. The original becomes `countered` and can no longer execute. The search asks for more of the proposer's cash in steps of 10,000, the smallest step that reaches utility 0. If cash cannot close the gap, it asks for one resource: the code with the highest one-unit value to the answering country, ties broken by the code, first a parcel of 100 and then whatever remains. It does not ask for cash or resources the proposer does not have. It does not add military access as payment. If nothing acceptable can be built, the original is rejected. The human accepts a counteroffer with the normal `Accept` path.

## Diplomatic participants

An agreement party is either an on-map state or an off-map actor.

An on-map state is a Player id. It can have territory, settlements, units, and a Player resource stockpile. Its treasury is `GovernmentFinance`.

An off-map actor is `{ "type": "foreign_actor", "id": "ussr" }`. The id is a stable lowercase token, not a random identifier. `ForeignActorManager` stores the actor. It has a name, a finite treasury, and a `responds` flag. It has no territory, settlements, units, population, or Player resource stockpile. Player ids in old proposals stay numbers, so a player-versus-player agreement is unchanged.

`GovernmentFinance` still belongs to on-map states and still collects their population revenue. An off-map treasury is not that account and does not receive population revenue. Agreement code spends and pays either kind of participant through one pair of calls.

Map-specific items are refused when either party is off-map: `resource`, `military_access`, and `trade_access`. The USSR has no physical inventory and no sovereign map, so those grants would be fiction. Cash, loans, and debt forgiveness are the V1 financial vocabulary. Later powers can add military aid, investment, basing, and alignment as their own item types. They are not implied by the current access components.

A future actor may eventually carry strategic interests, an aid budget, trade demand, and investment capacity. None of that is scored yet. There is no friendship, trust, alignment, or ideology modifier.

## Debt

`DebtLedger` is the obligation book. A debt is not a negative treasury. Each debt has a deterministic id starting at 1, a creditor, a debtor, the original principal, the outstanding principal, interest due, interest paid, the installment count, grace remaining, payments made, missed payments, and a status of `active` or `repaid`.

Prototype financial time is 60 simulation seconds per interval. That interval is not a year. A later calendar can map it onto a fiscal period. The constant is `DebtLedger.PaymentInterval`. One timer per debt fires the next interval. The ledger does not scan debts every turn. The callback carries a sequence number. A restored game keeps the timer the engine already stored, and a second callback with the old sequence does nothing.

Interest for an interval is `floor(principalOutstanding * interestRateBps / 10000)`. 400 basis points is 4 percent of outstanding principal. The division remainder is discarded. It is not added to principal. Interest due is tracked beside principal. Missed interest is not capitalized.

During each grace interval the ledger adds that interest and collects nothing. On a payment interval it moves the next principal slice into the amount due. Every installment except the last takes `floor(uncharged / installmentsStillToCharge)`. The last slice takes whatever principal is not yet due, so the integer remainder lands on the final installment. The debtor then owes that slice plus the interest due. If the full sum is in the debtor's treasury, it moves to the creditor. If it is not, the transfer is zero, `missedPayments` increases by one, and the unpaid amount stays due. The treasury never goes negative. A miss does not change diplomacy, start a war, or seize anything.

When outstanding principal, principal due, and interest due are all zero, the status becomes `repaid` and the timer is cancelled. Full forgiveness that clears the same balances is also `repaid`. There is no separate forgiven status.

## Loans

A loan item is not a cash item with a note attached. Acceptance does two things in the same atomic execution: the lender's treasury loses the principal, the borrower's treasury gains it, and the ledger creates the debt. If the lender can no longer fund the principal, or any other immediate term fails, the proposal is invalidated. No principal moves and no debt is created. Cash the borrower offered in the same proposal is rolled back with it. Debt forgiveness in the same proposal is rolled back with it.

Either participant with a treasury can lend. The type is not reserved for the USSR.

Worked prototype, grace 0, principal 1,000,000, 400 basis points, 5 installments. Each principal slice is 200,000.

```text
payment 1    interest 40,000    due 240,000    outstanding 800,000
payment 2    interest 32,000    due 232,000    outstanding 600,000
payment 3    interest 24,000    due 224,000    outstanding 400,000
payment 4    interest 16,000    due 216,000    outstanding 200,000
payment 5    interest  8,000    due 208,000    outstanding 0
```

Interest paid across the loan is 120,000. One grace interval on the same loan adds 40,000 of interest and moves no money. The first payment then collects that 40,000 plus a new 40,000 plus the 200,000 slice, due 280,000.

A principal of 1,000,001 over 5 installments charges 200,000 four times and 200,001 on the last.

## Debt forgiveness

The provider must be the creditor and the beneficiary the debtor. The amount must be a positive integer no greater than outstanding principal. Forgiveness reduces `principalOutstanding`. It does not move treasury. Forgiving 1,500,000 of a 5,000,000 principal leaves 3,500,000. A nonexistent debt, the wrong creditor, the wrong debtor, or an amount above the outstanding principal is rejected. If another item in the same proposal cannot be paid, the forgiveness is restored with the rest of the snapshot.

The negotiation screen adds loan and forgiveness rows to the same offer and request lists. The payment interval is not editable. Interest, installments, and grace are. Forgiveness is offered only for a debt the provider actually holds, and the simulation checks that claim again. Resource, military-access, and trade-access buttons are hidden when the other party is off-map. The debt line reads who owes whom. Utility numbers stay off the screen.

## Foreign powers

The Soviet Union is the first actor: id `ussr`, name Soviet Union, type `foreign_power`, treasury 100,000,000, `responds` true. It is not a Player. It is not Petra. `AgreementAI` answers it because the actor is marked `responds`, through the same evaluator and the same manager as Neighbor. A loan's value to the borrower is the cash value of the principal now, minus the discounted cost of the repayments. Each interval keeps nine-tenths of a future payment's weight, applied in integer thousandths. Existing debt increases that future cost by `(5,000,000 + burden) / 5,000,000`, where burden is outstanding principal plus interest already due. The lender's value is the mirror, assuming every payment arrives. A higher rate is worse for the borrower and better for the lender. A longer grace is better for the borrower and worse for the lender. Forgiveness is worth the log of the claim being reduced, positive for the debtor and the same magnitude negative for the creditor. No treasury is imagined to move. Counteroffers against a loan still ask for cash or, between on-map states, a resource. They do not search interest, term, or grace.

## Bilateral commodity trade

Signed, delivered, and paid are three different facts. An accepted `commodity_sale` creates an obligation. It does not remove cocoa and it does not move treasury. A representative trader has to reach the buyer's market. Payment is collected only for the quantity that arrival actually transfers.

```text
AGREEMENT          promise
TRADE ACCESS       legal permission
TRADE CONTRACT     unfulfilled obligation
MARKETS            physical endpoints
TRADER             representative logistics flow
INFRASTRUCTURE     capacity
DELIVERY           actual commodity transfer
SETTLEMENT         actual treasury transfer
```

The item is generic. Cocoa is the only commodity with a registry row and a runtime proof. The row stores a code, a display name, a reference value, and a reference stock. Coffee, cotton, copper, and the rest would be further rows, not further agreement types. Food, wood, stone, metal, and construction materials stay Player resources and use the existing immediate `resource` item.

The provider is the seller. The beneficiary is the buyer. Quantity and total price are positive integers. Quantity may exceed the stock on hand, because production can fill later trips. Nothing is reserved and nothing is escrowed at signing. A zero or negative quantity, a zero or negative price, or an unknown commodity is rejected. An off-map actor is rejected. The USSR has no market and no commodity inventory. A later port or export gateway would be the connection between the map and an off-map buyer.

`TradeContractManager` stores the obligation: id, agreement, seller, buyer, commodity, quantity agreed, quantity delivered, total price, amount paid, status, and the assigned trader and markets. Ids start at 1 and increase by 1. Status is `active`, `blocked`, or `fulfilled`. `blocked` means the last arrival could not be settled because the buyer could not pay. The contract is still an obligation. A later arrival retries. Logistics failures leave the previous status and record a reason: no trader, no endpoint, no access, enemies, no route, missing transit, or no supply. Missing transit keeps the contract active. It is not a failure to pay. There are no breach penalties, tariffs, customs, foreign exchange, or shipping charges.

`TradeAccess.CanTrade(buyer, seller)` is the legal permission for this sale. The buyer must be allowed to buy from the seller. A grant from Nation to Neighbor does not allow Neighbor to buy from Nation. The sandbox starts with trade permitted in both directions between Nation and Neighbor. A grant one way does not create the other. That grant may be in the same proposal. Acceptance creates the right and the contract together. Revoking the right stops delivery and leaves the contract.

The endpoints are `structures/nation/trade_depot`, a market with territorial influence, territory decay, and trader training turned off. Decay is off so a depot outside a civil centre's influence is not converted away from its owner. The seller's depot belongs to the seller. The buyer's depot belongs to the buyer. `units/nation/merchant` is an upstream trader. One merchant represents a commercial flow, in the same sense that Nation's people are aggregate population rather than one entity per person. `nation-assign-trade-route` binds that merchant, the two markets, and one contract, then starts the upstream route with the seller's market first and the buyer's market second. The merchant walks. Nation's copy of `Trader.js` keeps route assignment, diplomacy checks, and the leg-completion signal. It does not mint food, wood, stone, or metal. When a leg completes at the buyer's market, `SettleArrival` settles the contract. There is no per-turn poll. The return to the seller is not a delivery. Upstream `CanTrade` already stops the route when the two states are enemies. The contract remains.

Each arrival moves `min(lot, remaining quantity, seller stock)`. The lot is `floor(100 * corridorCondition / 100)`. For a merchant already on a leg, corridor condition is the worst live link of the corridor selected when that leg left the seller. A direct settlement with no leg snapshot uses the current legally usable route. National commodity stock is treated as available at the seller's export endpoint. Cocoa does not have to travel from the southern producer to the depot before it can be shipped. That domestic leg is later work.

Administrative connectivity and commercial connectivity are different queries on the same physical links.

```text
ADMINISTRATIVE CONNECTIVITY
settlement → capital
used for integration and state reach
also used by the abstract world buyer

COMMERCIAL CONNECTIVITY
commercial endpoint → commercial endpoint
used for bilateral trade throughput
```

`GetPathToCapital` still walks settlements only. A link whose endpoints are not both settlements is not an administrative edge. `GetCommercialRoute` walks settlements and `InfrastructureNode` endpoints. It does not use scenario edges. A trade depot is a commercial node, not a settlement. The route result carries the ordered node ids from the origin market to the destination market, as well as the links and the bottleneck. A road is physical infrastructure, so it is not clipped at the border. Either state may own a link. The path does not require every link to belong to the seller, and it does not assume a later corridor will cross only two countries.

The selected route is the highest bottleneck. The tie-break is fewer links, then the numerically smaller link-id sequence. There is no random choice. V1 condition is the minimum condition on that route, because the worst segment is the throughput bottleneck. Later road classes, lanes, rail, ports, and congestion are not modeled. Condition 0, or a link that no longer exists, removes the edge. The route is then disconnected and the delivery reason is `no_route`. Repairing the link restores the same contract. The path is recomputed when a trader arrives and when a proposal is valued. It is not stored, and it is not searched every turn.

```text
COMMERCIAL GRAPH
selects the economic corridor

UNITAI
moves the representative merchant through that corridor's world positions

PATHFINDER
chooses the local walk between one waypoint and the next
```

Commercial corridor selection is not engine pathfinding. The merchant's movement should still pass the nodes of the corridor the economy selected. A contract-bound trader, at the moment it leaves the seller's market, reads `GetUsableCommercialRoute` and writes the intermediate junctions onto the existing trade order as `{x, z}` waypoints. Upstream `UnitAI` already walks those points before the destination market, and it reverses the same list on the way back. The return retraces the outbound corridor. It is not a second export by the buyer. The GUI binds a trader, a contract, and two markets. It does not send the waypoint list.

A junction is not a market. Reaching one does not call `PerformTrade`, so it does not deliver cocoa and does not move treasury. Settlement still happens only when the merchant reaches the buyer's market. Nation's trader does not call `GenerateResources`, so the leg does not mint food, wood, stone, or metal. A trader with no contract keeps ordinary trade orders, including a route a rally point already supplied.

The corridor is chosen when the delivery leg starts. The merchant stores that link sequence and the waypoint coordinates. Diplomacy or a broken road does not teleport a unit that has already left. The current waypoints finish. At the buyer, settlement rechecks those same links. If a link is gone, the reason is `no_route`. If a transit grant for that sequence is gone, the reason is `missing_transit`, even when some other legal road is open. The lot uses the live condition of the links being walked, so a merchant on the 60-capacity bypass is not paid as if it had used the 100-capacity shortcut. The next departure selects again. If nothing legal is open, the merchant does not leave, the contract stays active, and one timer later it looks again. It does not queue a new walk on every turn. A dead market or a dead merchant stops that retry. Road condition changes the lot. It does not change walking speed.

Damaging the capital–northern road changes the southern village's path to the capital. It does not change this sale. Damaging one corridor link to 50 makes the lot 50. Severing a corridor link stops delivery. `TradeAccess` is still required on its own: a perfect road without the right delivers nothing, and the right without a road delivers nothing.

Delivery uses the widest legally usable route, not merely the widest physical route. A 100-capacity road through a third country without transit rights is skipped when a 60-capacity road inside the seller and buyer is open. Granting the missing right makes the wider road usable. Revoking it returns delivery to the legal alternative, or stops it when no legal alternative exists. The physical path remains queryable either way. `no_route` means the infrastructure is gone. `missing_transit` means a path exists and the seller may not use it.

The sandbox has two commercial corridors between the Nation depot at (200, 80) and the Neighbor depot at (320, 80). The shortcut runs through junctions at (228, 80) and (308, 80). Its middle road is at (268, 80), inside Transit State and owned by Transit State, at condition 100. The bypass runs through junctions at (228, 40) and (308, 40), south of the Transit State strip, at condition 60. Without a transit grant the merchant is sent along the southern junctions and a delivery is 60. With the grant, the next outbound leg uses the northern junctions and a delivery is 100. Nation holds the land west of the trade strip. Transit State, player 4, holds the rectangle from x = 248 to 292 and z = 70 to 110. Neighbor holds the east, except where that strip is listed earlier. Transit rights through player 4 start denied. V1 rights are general, directional, and indefinite. Duration waits for a historical calendar. An off-map actor cannot grant or receive them.

```text
PHYSICAL CONNECTIVITY
infrastructure connects the markets

TRADE ACCESS
the buyer may trade with the seller

TRANSIT RIGHTS
a third sovereign allows this seller's commercial traffic across its territory
```

`CanTransit(user, grantor)` means grantor allows user's commercial flow across territory whose permission belongs to grantor. The seller does not need a transit grant from itself. The buyer does not need one merely because the route ends in the buyer's territory. Any other sovereign touched by a link, or by either of that link's endpoints, is a required grantor. The sample is `Sovereignty` at those positions. Entity ownership is not that sample.

Ownership is who maintains the link. One owner, even when the road crosses a border. There is no joint ownership. The generic repair command spends that owner's treasury. Nation cannot repair Transit State's road. Transit State can. A repaired road without transit rights still does not deliver, and a granted right does not deliver across a severed road. A transit grant does not change sovereignty, effective control, occupation, or ownership, and it does not grant military access or trade access. Military access does not grant transit.

`transit_rights` is an ordinary agreement item. The provider is the grantor. The beneficiary is the user. Acceptance calls `TransitAccess`. Nation negotiates that right with Transit State in one agreement, and the cocoa sale with Neighbor in another. One proposal is never a three-party treaty. The dependency appears because the sale's corridor needs the other agreement. A same-package transit grant is counted while that proposal is scored, the same way a same-package trade grant is. Receiving a right that opens the only route is worth more than a right that merely raises capacity, which is worth more than a right that changes nothing. Granting it costs more when the grantor's territory is actually on a commercial corridor. An enemy grant is a hard rejection. A right already held is worth nothing more. The negotiation screen adds Transit rights beside the other access buttons and names the missing state on an active contract.

A seller with no stock delivers nothing and pays nothing, and the contract stays open. Production continues and can supply a later trip.

Payment for a delivery is `floor(totalPrice * quantityDelivered / quantityAgreed) - amountPaid`, using the delivered total after this trip. The last trip therefore pays whatever is left, and the sum is the exact total price. A contract of 3 units for 100 pays 33, then 33, then 34. If the buyer cannot pay that amount, the trip moves no cocoa and no money, and the status becomes `blocked`.

The transfer is one sequence. Seller stock is taken, the buyer pays, the buyer receives the commodity, and the seller is credited. If a later write fails, the earlier writes are put back. Buyer stock is a national inventory, not a Player resource and not a producer pile, so the world buyer does not export goods that were just received. Seller stock still lives on the producer. The world buyer skips a commodity while that seller has an open contract for it.

The contract survives a dead merchant, a destroyed depot, a revoked right, a ruined road, and war. Fulfillment stops until a trader, two living markets, permission, and a corridor exist again. It is fulfilled only when quantity delivered equals quantity agreed and amount paid equals the total price. Another arrival then does nothing. More than one contract can be open. One merchant serves one contract.

Valuation uses the registry, not a cocoa special case. The buyer gains the commodity and owes the price. The seller gains the price and gives up the commodity. Low buyer stock raises the commodity's value. Low seller stock raises the cost of promising it. Feasibility uses the real commercial corridor between the two states' living markets. A healthy corridor leaves that value unchanged. A corridor at condition 50 scales a wanted deal by `(100 + 50) / 200`, which is three quarters. A missing legal right, a missing market, or no corridor quarters a deal the party wanted and subtracts a further penalty from a deal they did not. The deal can still be signed. The parties might build the route later. That future road is not treated as certain. `AgreementAI` accepts, rejects, or counters with the ordinary cash and resource policy. It does not build markets, roads, or merchants.

## Build and run

Dependencies for macOS are not present until `libraries/build-macos-libs.sh` downloads and builds them. Bundled sources include SpiderMonkey, NVTT, FCollada, and Premake. The script installs the rest under `libraries/macos/`. Workspaces are generated by `build/workspaces/update-workspaces.sh` into `build/workspaces/gcc`. The executable is `binaries/system/pyrogenesis`. From a non-bundle build, game data resolves to `binaries/data/` next to `binaries/system/`.

User config, logs, and the writable user mod go to `~/Library/Application Support/0ad/`. Saving the mod selector writes `mod.enabledmods` there.

Exact commands are in the task report that introduced this file. This checkout had no generated workspaces and no `pyrogenesis` binary, so those commands were taken from `libraries/build-macos-libs.sh`, `build/workspaces/update-workspaces.sh`, `build/premake/premake5.lua`, and `binaries/system/readme.txt`.
