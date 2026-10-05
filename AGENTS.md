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

A foreign army occupying land does not automatically move the recognized border. A village inside the legal border can still be weakly integrated. The upstream territory grid is a single player-influence layer. Do not treat it as all three concepts. Do not use `TerritoryManager` or that grid as Nation sovereignty. Sovereign ownership is `Sovereignty.GetSovereignOwner`. Sovereignty is legal international ownership. TerritoryManager is effective state control. TerritoryManager must never mutate legal sovereignty. Sovereignty must not be inferred from territory influence. Domestic administration is authorized by legal sovereignty, not existing effective control. Regional administration requires Advanced State. Effective control should emerge from physical TerritoryInfluence entities. Destroying or capturing those entities changes effective control through upstream territory mechanics. Rebellion must not directly mutate territory control. Effective control does not directly modify integration, food, discontent, or population in V1. Military occupation is distinct from sovereignty and effective control. Occupation must derive from physical hostile military presence. TerritoryInfluence alone never establishes military occupation. Unauthorized border entry alone never establishes occupation. Rebels are not foreign occupiers. Domestic troops are not occupiers of their own sovereign territory. Foreign administration requires Advanced State and current local military occupation at construction time. Foreign administration never changes legal sovereignty. Foreign administration projects effective control through TerritoryInfluence. Military withdrawal does not automatically destroy an established foreign administration. Foreign administration destruction does not remove military occupation if hostile troops remain. Occupation does not directly transfer resources, population, integration, food, or treasury in V1. Border-crossing detection must consume `Sovereignty` and must not infer borders from `TerritoryManager`. Settlement membership in a sovereign state must be derived from `Sovereignty`, not assumed from entity `Ownership`. Do not equate straight-line distance with state connectivity. State integration must not be inferred directly from sovereignty. Physical infrastructure should feed `SettlementConnectivity` rather than directly modifying state integration. The prototype connectivity graph is expected to be replaced or augmented by real infrastructure systems later. Nation monetary state must remain distinct from 0 A.D. food, wood, and stone resource counters unless deliberately integrated. Government revenue should eventually consume economic-system outputs rather than permanently using population as a proxy. Commodity production must remain separate from `GovernmentFinance`. Economic commodities must not be implemented as 0 A.D. food, wood, or stone resource counters. Export proceeds should enter the treasury through `GovernmentFinance` APIs rather than modifying treasury state directly. Infrastructure damage should affect downstream systems through infrastructure and transport state, not by directly subtracting treasury or integration. Commodity exports must consume `TransportEfficiency` rather than reading road condition directly. Settlement integration must continue to consume `SettlementConnectivity` rather than road health directly. Nation player actions that mutate simulation state must use deterministic simulation commands. Infrastructure repair costs must be calculated and validated in simulation code, not trusted from GUI. Economic recovery should emerge from restored downstream systems rather than repair directly adding treasury income. Infrastructure construction must create physical InfrastructureLink entities; it must not create abstract connectivity directly. Infrastructure construction must not directly increase settlement integration. Dynamic infrastructure must use the same condition, connectivity, transport, repair and serialization systems as scenario-placed infrastructure. Construction costs are authoritative simulation values and may not be trusted from GUI. Treasury-only construction costs are prototype scaffolding until Nation's physical resource economy is integrated. Do not create a parallel Nation food currency while upstream Player food remains authoritative. Commodity stock and Player resources are distinct. Treasury and physical resources are distinct. Nation-specific farms and units belong in the Nation mod. Player food remains the sole authoritative food stockpile. Population consumption subtracts from Player food through upstream resource APIs. Food may never become negative. Food shortage is derived from unmet aggregate demand. Food shortage does not directly create political consequences; downstream systems consume shortage state. National population is grouped by sovereignty, not settlement entity ownership. Food production and food consumption share the same Player resource. Treasury must not automatically cover food shortage. Trade access is distinct from military access and diplomatic stance. International resource purchases must require explicit trade permission. Import transactions must be simulation-authoritative. GUI may never supply authoritative price or quantity. Imported food enters the same Player food stockpile as domestically produced food. Import systems must not directly modify food-shortage state. Food imports are player-triggered; treasury must never automatically cover shortages. Treasury is fungible; imports must not depend directly on cocoa. Seller inventory and international transport are intentionally abstracted in this prototype. Discontent is authoritative settlement state, not only a national scalar. National discontent is derived from settlements. Food consumption must not directly mutate discontent. Food imports must not directly mutate discontent. Discontent drivers consume food-shortage state through a separate system. State integration modifies vulnerability to food crises but does not create discontent by itself. Discontent does not currently reduce integration. Settlement political membership follows Sovereignty, not entity Ownership. Rebellion must emerge from settlement political state, not directly from food shortage. Rebellion consequences must use physical RTS entities where a physical consequence is intended. Rebellion systems may not directly reduce InfrastructureLink condition. Normal combat/Health must mediate rebel damage to infrastructure. Killing rebels must not directly reduce discontent. Resolving discontent must not despawn existing rebels. One active V1 rebel group per settlement. Rebel spawning follows Sovereignty, not settlement entity Ownership. Rebel entities are representative agents and do not subtract one-for-one from aggregate population. Rebellion must not change legal sovereignty in V1. Food, wood, stone and metal remain authoritative upstream Player resources. Nation must not create parallel stockpiles for retained physical resources. Physical extraction should use ResourceSupply, ResourceGatherer, and ResourceDropsite wherever possible. Extraction facilities must not generate free resources by timer. Physical resources do not automatically become treasury. Physical resources do not automatically become export commodities. NationSettlement population is authoritative demographic population. Pyrogenesis native population is representative physical-agent capacity, not demographic population. Representative capacity is derived from sovereign demographic population. Physical units must not subtract directly from NationSettlement population. Government workers and military units may consume native representative population normally. Rebel units do not consume Nation government representative capacity. Building population bonuses must not independently inflate Nation's demographic-derived representative capacity. Population capacity must follow Sovereignty rather than settlement entity Ownership. Integration, food shortage and discontent do not modify representative capacity until explicitly designed later. Industrial production must consume authoritative Player resources. IndustrialProduction recipes belong in template data, not hardcoded JS. A production cycle is atomic: either all inputs are consumed and all outputs produced, or nothing changes. Manufactured resources are not treasury. Manufactured resources are not automatically trade commodities. Factory ownership determines whose resources are consumed/produced. Destroyed factories must stop production. Factory operation does not change demographic or representative population in V1. Industrial production does not require transport/electricity/workers until those systems are explicitly introduced. Construction materials may be spent as phase-research costs. Ordinary construction does not consume them yet. Nation phase progression must reuse the upstream technology/phase primitive. Do not maintain a parallel Nation phase counter. Player-facing phases are Consolidation, Development, and Advanced State. Phases represent state capacity and development, not historical ages. Phase advancement should reflect concrete development prerequisites rather than arbitrary vanilla resource payments. Raw food, wood, stone, and metal must not be consumed as arbitrary phase tribute unless deliberately designed later. Phase advancement does not directly modify demographic population, representative capacity, integration, or discontent. Future Nation capabilities should use upstream technology prerequisites where practical. Representative extraction workers do not subtract from aggregate settlement population. Construction does not consume physical resources until an explicit later system introduces those costs. Extraction source depletion should preserve upstream finite-resource semantics. Diplomatic relationship status and border access rights are separate concepts. Border incidents and warnings must not automatically change 0 A.D. Diplomacy or declare war. Do not infer continued border violation from the historical incident record. Use live foreign-presence state. Diplomatic deadlines must use deterministic simulation time, never wall-clock time. Ultimatum issuance must not directly change 0 A.D. Diplomacy. Escalated border crises must not automatically change 0 A.D. Diplomacy. A completed warning cycle must not permanently suppress responses to later new incursions. The mapping is described in `docs/nation-architecture.md`.

Nation diplomatic and economic deals use one composable agreement architecture. They do not each grow a treaty manager. Every agreement item names its provider and its beneficiary. A physical resource moves through the existing Player stockpile. Cash moves through `GovernmentFinance` and is never a money Player resource. Military access reuses `DiplomaticAccess`. Trade access reuses `TradeAccess`. Creating a proposal spends nothing. Immediate obligations are checked again at acceptance, and the whole proposal executes atomically or not at all. An accepted proposal cannot execute twice. The GUI does not own agreement state. Later loans, debt, and delivery obligations should be new agreement items, not disconnected diplomatic systems. Trade permission and physical trade are distinct. An embassy must not imply sovereignty or `TerritoryInfluence`. Agreement valuation is deterministic and grounded in simulation state. It does not use random personality rolls. `AgreementManager` does not contain the valuation policy. Item utility is an explainable breakdown. Resource utility accounts for scarcity. Food utility reflects actual food security. Treasury utility has diminishing marginal value. An existing right has near-zero marginal value. A hostile military-access grant may be hard-rejected. A counteroffer is an ordinary agreement proposal, and it may not request resources or cash the other party does not currently possess. An AI response executes through `AgreementManager`. A future off-map power can use `AgreementEvaluator` without Petra and without territory. No language model is part of simulation diplomacy. Off-map foreign powers are not fake map Players. Agreement participants may be on-map states or off-map actors. Foreign actors do not implicitly own Player resources. Foreign actors do not implicitly have sovereignty, TerritoryInfluence, population, or units. Loans extend AgreementItem. A loan atomically moves principal and creates debt. Debt is a first-class obligation, not negative treasury. Debt ids are deterministic. Interest uses deterministic integer arithmetic. Treasury never becomes negative. Missed payments do not invent money. Debt forgiveness reduces an existing creditor's claim and moves no treasury. Agreement atomicity includes loan and debt effects. Foreign powers use AgreementEvaluator and AgreementAI, not bespoke negotiation logic. Current map-specific military and trade access items are invalid for off-map actors. Foreign powers do not require Petra. Commodity sales extend AgreementItem. Agreement acceptance creates obligations; it does not imply fulfillment. TradeAccess is legal permission only. Physical bilateral commodity delivery requires on-map endpoints and representative logistics. Commodity stock cannot teleport between states. Payment occurs against actual delivery. Delivery and payment are atomic. Contracts may be partially fulfilled. Contract quantity may exceed current stock. Cocoa production may fulfill future obligations. Infrastructure condition affects trade capacity through existing transport systems. Trader or market destruction blocks fulfillment but does not erase the agreement. Revoked access blocks fulfillment but does not erase the obligation. Off-map actors cannot use physical commodity_sale without a future gateway. World-buyer exports and bilateral delivery must not double-sell commodity. Representative traders are aggregate commercial agents, not literal one-vehicle economic scale. Trade throughput must derive from the infrastructure supporting the actual commercial endpoints. Producer-to-capital connectivity must not determine international trade capacity. Administrative connectivity and commercial connectivity are distinct queries. They may share the same physical infrastructure. Damage to unrelated infrastructure must not alter a commercial route. Damage to corridor infrastructure must reduce throughput. A severed corridor must stop delivery. TradeAccess alone is insufficient. Physical connectivity alone is insufficient. Commercial route selection is deterministic. Commercial routes may include infrastructure not owned by the seller. Do not assume future commercial corridors cross only two sovereign states. Commodity-specific code must not own corridor logic. Physical infrastructure existence does not imply legal right to use it. TradeAccess and TransitAccess are separate. TransitAccess and MilitaryAccess are separate. Transit rights are directional. Third-country commercial corridors require permission from relevant sovereign transit states. Commercial routing chooses the best legally usable route, not merely the best physical route. Missing transit rights do not erase physical infrastructure or contracts. Revocation blocks fulfillment but leaves obligations intact. Transit grants do not change sovereignty, effective control, occupation, or ownership. Infrastructure ownership determines V1 repair responsibility. Sovereignty and infrastructure ownership are not synonyms. A state cannot normally repair another state's infrastructure. Commercial infrastructure uses the generic infrastructure repair system. Agreements remain bilateral; cross-system dependencies may involve multiple separate agreements. Off-map actors do not participate in territorial transit rights in V1. Contract-bound representative traders follow the selected commercial corridor's nodes. GUI never supplies trusted route geometry. Commercial graph chooses the corridor; UnitAI/pathfinder moves between its waypoints. Junction arrival never settles commodity. Only destination-market arrival may settle a contract. Visible route and economic route must correspond. Route selection is recomputed at journey boundaries. Mid-journey diplomatic/infrastructure changes never teleport units. Destination settlement still revalidates legality and infrastructure. Ordinary non-contract Trader behavior remains intact. Road condition affects commercial capacity, not movement speed in V1. Do not implement custom road pathfinding without a future explicit architecture decision.

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
