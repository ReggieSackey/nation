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

**Territory.** `CCmpTerritoryManager` stores one player id per tile in five bits (`TERRITORY_PLAYER_MASK` is `0x1F`), plus connected and blinking flags. Connected means the tile reaches a root influence entity such as a civic centre. That is building-influence territory for placement and borders drawn by the engine. State control and occupation still need their own data. Painting a legal border with the influence renderer, or teaching the pathfinder that a border is a political fact, would be an engine question later.

### Sovereignty

`Sovereignty` is a Nation system component. It answers which player legally owns a world position. It does not read or write `CCmpTerritoryManager`.

V1 regions are static polygons in world coordinates, stored on the scenario as `ScriptSettings.Sovereignty`. A gamesettings attribute copies that array into `InitAttributes.settings`. On `InitGame` the component stores it. `GetSovereignOwner({x, z})` returns the player id of the first containing region, or `INVALID_PLAYER` (-1) when the point is unclaimed. A point on a polygon edge is inside that polygon. The loaded regions are ordinary component state, so a save or replay keeps them. Regions do not change during a match.

`SovereignBorderTracker` observes when a moving entity changes sovereign regions. It listens for `PositionChanged` on entities with `UnitMotion` and a player owner, and it calls `GetSovereignOwner`. The first sighting is remembered and does not emit. A later change posts `SovereignBorderCrossed` with `{entity, from, to}`, where `from` and `to` are sovereign owners of the land. A crossing has no legal or diplomatic meaning. The tracker does not read `TerritoryManager`, stop the unit, or change diplomacy or sovereignty. Remembered entity ids are ordinary component state and are dropped when the entity is destroyed.

`ForeignMilitaryPresence` listens for that crossing and for destruction and ownership changes. It records which mobile player units are currently inside land sovereign to a different player. The pair is directional: foreign owner, then host sovereign. The first unit broadcasts `ForeignMilitaryPresenceStarted`. The last unit to leave or be destroyed broadcasts `ForeignMilitaryPresenceEnded`. Presence is geographical, so an authorized entry still counts. V1 uses the same mobile units the border tracker reports. A border crossing is an event. Foreign presence is current state. Do not infer a continued violation from the historical incident.

`DiplomaticAccess` answers whether units owned by one player may enter land sovereign to another. V1 stores only directional `MilitaryAccess` grants, `{from, to, military}`, copied from scenario `ScriptSettings` through a gamesettings attribute into `InitAttributes.settings`. `HasMilitaryAccess(fromPlayer, toPlayer)` returns the first matching grant. A missing grant is denial. A grant from 1 to 2 does not grant 2 to 1. Ally, enemy, and neutral stance are not consulted. The grants are ordinary component state, so a save keeps them.

`SovereignEntryClassifier` listens for `SovereignBorderCrossed`. It reads the unit owner from `Ownership`. Entry into `INVALID_PLAYER` is not classified. A unit entering land sovereign to its own owner is authorized. Any other entry is authorized only when `HasMilitaryAccess(entityOwner, destination)` is true. The result is `SovereignEntryClassified` with `{entity, entityOwner, from, to, authorized}`. Unauthorized does not mean war. The unit is not stopped. V1 applies this military rule to every tracked unit. A later civilian, trade, or diplomatic category check belongs in the classifier.

`BorderIncidentManager` listens for `SovereignEntryClassified` and keeps one directional incident per offender and defender. An incident is recorded only for an unauthorized entry by one real player into land sovereign to a different real player. The record is `{offender, defender, active, incursions}`. The first such entry broadcasts `BorderIncidentStarted` with `{offender, defender, entity}`. A later unauthorized entry by the same offender into the same state increments `incursions` and does not send another message. The incident stays active for the match. A border incident is not war. Border incidents are directional. The manager does not read or write `Diplomacy`, and it does not stop the unit.

`BorderWarningManager` listens for `BorderIncidentStarted`. The defender's first objection to that offender is one warning, `{offender, defender, active}`. It broadcasts `BorderWarningIssued` with `{issuer, recipient}`, where the issuer is the defender and the recipient is the offender. A repeated incursion does not open a second warning. A reverse incident opens a warning in the other direction. The warning stays recorded after the units leave. `IsWarningCompliedWith(offender, defender)` is true only while that warning is active and `ForeignMilitaryPresence` reports no units of the offender inside the defender. Compliance does not close the warning or the incident. A border incident is political history. A warning is a diplomatic objection. Neither is war. A valid match state is a neutral relationship, no military access, an active border incident, an active warning, and either remaining or withdrawn foreign presence.

`BorderWarningEscalation` listens for `BorderWarningIssued` and schedules one `Timer.SetTimeout` for that directional pair. The delay is `GracePeriod`, 10000 simulation milliseconds, which is ten simulation seconds of prototype timing. It is not a calendar date and not a final gameplay duration. `Timer` counts milliseconds of simulation time and stores callbacks in a `Map` of absolute fire times. The engine serializes that `Map` with the component, and the escalation component serializes the pending timer id, so a save keeps the remaining deadline. A second warning message does not schedule a second timer while one is already pending. When the timer fires, compliance is read then. If the offending units have gone, the deadline ends silently: the incident and the warning stay recorded, and no ultimatum is created. If they are still inside, `BorderUltimatumManager` records one ultimatum. Leaving before the deadline does not cancel the timer early, because the check has to see the live presence.

`BorderUltimatumManager` stores `{offender, defender, active}`. The first ultimatum for a pair broadcasts `BorderUltimatumIssued` with `{issuer, recipient}`, the issuer being the defender and the recipient the offender. A second request for the same pair does nothing. Withdrawal after the ultimatum does not remove it. An ultimatum does not change `Diplomacy` and is not war. A neutral relationship, no military access, an active incident, an active warning, remaining foreign presence, and an active ultimatum is a valid state. If the troops leave before the deadline and later cross again, the original warning is still active, so no new warning is issued and no new deadline starts. That repeated crisis is not handled yet.

**Economy.** Player resources are already quantities. A cocoa JSON resource can be added under `simulation/data/resources/` when that slice starts. Transport can be a quantity moving between entities, with a truck as the visible agent. The loop to prove is settlement production, a road, an export node, foreign exchange, and a treasury. `Market` and `Barter` are ancient trade. Use them only if a slice genuinely fits; otherwise add a small Nation component.

**Diplomacy.** `Diplomacy` stores ally, enemy, and neutral stances on each player. That stance is not permission to enter sovereign land. `MilitaryAccess` is a separate directional grant, and a missing grant is denial, including between neutrals. The 1961 sandbox starts Nation and Neighbor neutral toward each other and grants military access in neither direction, so a crossing is still unauthorized. Trade rights, transit rights, customs, investment, and loans are further agreements. Crossing a tile can remain physically legal in the pathfinder while a Nation component records it as unauthorized.

**Foreign powers.** A power with no map presence can be a player entity with no units, or a small system component. The first slice needs one power and one loan. It does not need the United States, the USSR, Britain, France, and China as content.

**Population.** `Population` in upstream code is a housing bonus. Nation population, employment, income, food, healthcare, education, services, prosperity, and unrest belong on settlement data. Visible civilians are representative entities, not one entity per person.

**War.** Keep `Attack`, `Health`, `UnitAI`, and the pathfinder. Feed them from the same roads, stocks, and treasury used in peacetime. Occupied land stays a different fact from sovereign land.

## Build and run

Dependencies for macOS are not present until `libraries/build-macos-libs.sh` downloads and builds them. Bundled sources include SpiderMonkey, NVTT, FCollada, and Premake. The script installs the rest under `libraries/macos/`. Workspaces are generated by `build/workspaces/update-workspaces.sh` into `build/workspaces/gcc`. The executable is `binaries/system/pyrogenesis`. From a non-bundle build, game data resolves to `binaries/data/` next to `binaries/system/`.

User config, logs, and the writable user mod go to `~/Library/Application Support/0ad/`. Saving the mod selector writes `mod.enabledmods` there.

Exact commands are in the task report that introduced this file. This checkout had no generated workspaces and no `pyrogenesis` binary, so those commands were taken from `libraries/build-macos-libs.sh`, `build/workspaces/update-workspaces.sh`, `build/premake/premake5.lua`, and `binaries/system/readme.txt`.
