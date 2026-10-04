# Nation

Nation is a new strategy game built on Pyrogenesis. It is developed in this repository as a total conversion of 0 A.D. 0 A.D. is upstream technology and a reference implementation. It is not the intended final game identity.

The long-term game is a post-colonial African nation-building RTS beginning around the early 1960s. The player inherits a newly independent state and decides what kind of country to build. Development, infrastructure, logistics, industry, state capacity, trade, public finance, foreign borrowing, diplomacy, welfare, unrest, military logistics, borders, occupation, and war are meant to interact inside the physical RTS world.

Those systems are not implemented yet. Build them only when a task asks for a specific, playable slice.

Author: Reggie Sackey-Addo.

Work on branch `nation-dev`. Do not commit to `main`. Do not rewrite Git history, change remotes, or change Git LFS configuration.

## Architectural boundaries

Game-specific work belongs in:

```text
binaries/data/mods/nation/
```

Leave `binaries/data/mods/public/` unchanged for Nation-specific features. That tree is the upstream 0 A.D. game. Copying a pattern from it is fine. Editing it so Nation behaves differently is not.

Leave `source/` unchanged unless a capability cannot reasonably be implemented with the simulation and mod APIs. An engine change requires all of the following before any code is written:

1. The exact limitation.
2. The existing simulation or mod API that was considered.
3. Why that API cannot reasonably implement the requirement.
4. The smallest possible engine extension.
5. A generic shape for that extension, where practical.

Do not implement the extension until it is explicitly authorized.

Pyrogenesis is the engine. `binaries/data/mods/mod/` is the engine-level mod (GUI chrome, shaders, fonts, and the mod selector). `binaries/data/mods/public/` is the 0 A.D. game. `binaries/data/mods/nation/` is Nation. See `docs/nation-architecture.md` for how this tree actually loads those layers.

## Determinism

Simulation changes must stay deterministic. Replays and multiplayer matter even during early development.

Simulation behavior must not depend on:

- wall-clock time
- nondeterministic randomness
- local machine state
- unordered iteration whose order affects simulation results
- network calls
- external services

The simulation replaces nondeterministic `Math.random` with a serialized RNG. Use that RNG. GUI code reaches simulation data through `Engine.GuiInterfaceCall`. Those calls must not change serialized simulation state. Player commands that do change the simulation go through the networked command queue.

## System design

Future Nation concepts include:

```text
Nation
Sovereignty
State Control
Settlement
Treasury
Government Budget
Inventory
Production
Logistics
Trade
Diplomacy
Foreign Powers
Population
Public Services
Unrest
Military
Occupation
```

These names are conceptual. Do not create a component, manager, or file merely because a name appears here.

Prefer the smallest implementation that proves gameplay. Keep concerns in separate components where the engine already supports composition. A settlement should not hold every economic, political, logistical, demographic, and military behavior in one component.

Three territory ideas must stay distinct when they are eventually implemented:

- Sovereignty: which country legally owns an area.
- State control: how strongly that government actually integrates the area.
- Occupation: which military physically controls the area during conflict.

A foreign army occupying land does not automatically move the recognized border. A village inside the legal border can still be weakly integrated. The upstream territory grid is a single player-influence layer. Do not treat it as all three concepts. Do not use `TerritoryManager` or that grid as Nation sovereignty. Sovereign ownership is `Sovereignty.GetSovereignOwner`. Border-crossing detection must consume `Sovereignty` and must not infer borders from `TerritoryManager`. Diplomatic relationship status and border access rights are separate concepts. Border incidents and warnings must not automatically change 0 A.D. Diplomacy or declare war. Do not infer continued border violation from the historical incident record. Use live foreign-presence state. Diplomatic deadlines must use deterministic simulation time, never wall-clock time. Ultimatum issuance must not directly change 0 A.D. Diplomacy. The mapping is described in `docs/nation-architecture.md`.

Goods should be simulation quantities. Do not spawn one entity per sack or unit of cargo. A truck can represent logistics visually while the goods remain numbers.

Pathfinding permission and diplomatic or legal permission are different. A unit may be able to walk across a border and still be unauthorized to do so.

Off-map foreign powers do not need territory on the playable map. Population should be aggregate settlement data plus a small number of representative people in the world. War stays on the existing Pyrogenesis combat systems. Roads, fuel, ports, factories, and the treasury should affect military capacity. Do not replace the combat engine.

## Incremental development

Build systems vertically.

A complete economic model before anything is playable is the wrong order. The right order is one cocoa-producing settlement, one road connection, one export destination, one shipment, and money entering a treasury. Prove that, then expand.

The first playable target is one fictional African country around 1961:

```text
1 capital
1 Presidential Palace
roughly 4 internal settlements
roads
farms
1 factory
1 university
1 hospital
1 court
1 military barracks
1 neighboring country
1 neighboring port or export connection
fixed national borders
1 export commodity
basic treasury
1 trade agreement
1 off-map foreign power
1 foreign loan type
basic military units
unauthorized border-crossing detection
```

That slice should support a compelling 30–60 minute game. Do not simulate the whole continent, or the whole post-colonial political economy, before this slice works.

## No speculative architecture

Use Pyrogenesis conventions before inventing new ones. Do not add dependency-injection frameworks, generic service layers, event buses, persistence systems, database abstractions, or an ECS replacement unless the existing engine genuinely requires it.

Do not add TypeScript, npm, React, a Node backend, a web framework, or third-party packages for game code.

## Upstream discipline

Do not refactor unrelated upstream code. Do not rename large parts of the engine. Do not delete upstream systems because Nation does not use them. Do not drop tracked upstream assets to make the tree smaller. Keep future upstream merges practical.

## Assets

Placeholder art is disposable. Do not build pipelines whose purpose is to preserve placeholders. Nation will eventually need original modern African architecture, terrain, vehicles, civilians, military units, infrastructure, UI, and sound.

## Comments and commits

Comment only when behavior is non-obvious. Architectural reasoning belongs in this file and in `docs/nation-architecture.md`.

Keep commits narrow. A commit should be one understandable architectural or gameplay step.
