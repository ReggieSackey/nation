# Sovereignty engine architecture

Audit of `nation-dev` at `c71e6c9e2b3c0909a777244711456fa453402fb4`. No engine code was changed for this document. `source/` on this branch is identical to `main` at merge-base `6cc57a86b9013335e72e2f67923e32fde0166b86`.

## 1. Executive summary

Pyrogenesis has one spatial grid for effective control. `CCmpTerritoryManager::CalculateTerritories` paints it from `TerritoryInfluence` entities. A cell whose owner bits are 0 is not a country. It is only "no influence reached this cell." Nation already stores a second fact, legal sovereignty, as polygons in `Sovereignty.js`. Every current Nation consumer asks who owns a point. None of them read territory as sovereignty.

The engine extension should add `ICmpSovereigntyManager` / `CCmpSovereigntyManager` with a `Grid<uint8_t>` of player ids. Owner 0 on that grid means unclaimed land, and must not be passed into territory APIs as if it were neutral territory. The grid is the runtime form. The authoring form should stay the polygons Nation already writes into `InitAttributes.settings.Sovereignty`, rasterized once at territory-cell resolution.

Do not give sovereignty connected bits, blinking, decay, roots, or influence weights. Do not change `CalculateTerritories` in the first engine step. The later domestic-influence rule belongs inside that flood, including `MarkFootprintTiles`, and the foreign exception belongs on the influence entity, not inside occupation logic.

World territory lines and the minimap ribbon are different consumers of the same grid. Sovereignty should get its own lines and its own ribbon texture. Knowledge filtering reads LOS at draw time. It must not write the authoritative grid.

## 2. Current Pyrogenesis territory architecture

### Grid

`ICmpTerritoryManager` (`source/simulation2/components/ICmpTerritoryManager.h`) defines the cell:

| Constant | Value | Meaning |
|---|---|---|
| `NAVCELLS_PER_TERRITORY_TILE` | 8 | One territory cell is 8 navcells. `Pathfinding::NAVCELL_SIZE_INT` is 1 metre, so one cell is 8 metres. |
| `TERRITORY_PLAYER_MASK` | `0x1F` | Player id in bits 0–4. Maximum representable owner is 31. |
| `TERRITORY_CONNECTED_MASK` | `0x20` | Set when a flood from a root influence stays inside this owner's cells. |
| `TERRITORY_BLINKING_MASK` | `0x40` | Decay warning. Set after the owner flood by `TerritoryDecayManager.SetBlinkingEntities`. |
| `TERRITORY_PROCESSED_MASK` | `0x80` | Scratch bit. `CTerritoryBoundaryCalculator::ComputeBoundaries` writes it into the live grid. |

`GetOwner` returns `cell & TERRITORY_PLAYER_MASK`, and the header says 0 means "neutral territory" (`ICmpTerritoryManager::GetOwner`). `CalculateTerritories` allocates the grid with `Grid<uint8_t>`, which clears every cell to 0. A cell stays 0 until an influence footprint or flood writes an owner. Player 0 is also skipped as an influence owner (`owner <= 0` in `CalculateTerritories`). Uninfluenced land and "player 0" are the same stored id. That id is not a geopolitical status.

`GetTerritoryGrid` calls `CalculateTerritories` and returns `*m_Territories`.

### Lifecycle

`CCmpTerritoryManager::Init` leaves `m_Territories` and `m_CostGrid` null, sets `m_DirtyID` and `m_DirtyBlinkingID` to 1, and sets `m_BoundaryLinesDirty` and `m_TriggerEvent`. It loads `simulation/data/territorymanager.xml`: impassable cost 4, border thickness 0.75, border separation 0.85, visibility `visible`.

`MakeDirty` deletes `m_Territories`, increments `m_DirtyID`, and marks boundaries and the event dirty. It does not delete `m_CostGrid`. `MakeDirtyIfRelevantEntity` dirties only when the entity has `TerritoryInfluence`.

Messages that dirty the grid (`ClassInit` subscriptions):

- `MT_OwnershipChanged`, `MT_PositionChanged` — only if the entity has influence.
- `MT_PlayerColorChanged`, `MT_ValueModification` when the component is `TerritoryInfluence`.
- `MT_ObstructionMapShapeChanged`, `MT_TerrainChanged`, `MT_WaterChanged` — also delete `m_CostGrid`, so Atlas terrain edits rebuild the cost grid. This is the map-resize path. The territory grid is not stored, so a new size appears on the next `CalculateTerritories`.

`MT_Update` broadcasts `CMessageTerritoriesChanged` once if `m_TriggerEvent` is set, then clears the flag (`MessageTypes.h`, `TypeList.h` `MESSAGE(TerritoriesChanged)`). The message carries no payload (`MessageTypeConversions.cpp`).

`MT_Interpolate` rebuilds boundary lines when `m_BoundaryLinesDirty`, then animates blinking alpha. `MT_RenderSubmit` submits those lines.

`CalculateTerritories` returns immediately if `m_Territories` is already allocated. Callers that need a fresh grid must have gone through `MakeDirty`. If the pathfinder is not ready, `CalculateCostGrid` leaves `m_CostGrid` null and `CalculateTerritories` returns with `m_Territories` still null. `GetOwner` then returns 0.

### Serialization

`Serialize` writes only `m_TriggerEvent`. The comment in `CCmpTerritoryManager::Serialize` says the grid is recomputed. `Deserialize` calls `Init` and reads that flag. Blinking is restored later by decay, not by the territory archive. The processed bit is not saved.

### Calculation

`CCmpTerritoryInfluence` stores `Root`, `Weight` (uint16), and `Radius`. `GetWeight`, `GetRadius`, and `IsRoot` apply `ValueModificationManager` and are not themselves serialized; the template is re-read on deserialize.

`CalculateTerritories` (`CCmpTerritoryManager.cpp`):

1. Build `m_CostGrid` from the pathfinder classes `default-terrain-only` and `unrestricted`. Tile cost multiplies influence falloff. Impassable cost is 4, so expensive terrain shortens reach. It does not stop the flood by itself.
2. Allocate a zeroed owner grid.
3. Walk every `TerritoryInfluence` entity in entity-id order. Skip missing ownership, owner `<= 0`, owner `> 31`, and weight or radius 0.
4. `MarkFootprintTiles` writes that owner onto footprint cells and sets their best weight to `uint32` max, unless another footprint already did so. The oldest entity id keeps an overlap. This is upstream commit `46db652641` ("Ensure buildings always own territory they are on"), already on `main`. It is not a Nation edit.
5. Per player, flood each influence outward. Falloff per step is `weight * cellSize / radius * cost`, times 362/256 on diagonals. A neighbour is written only when the summed player weight beats `bestWeightGrid`.
6. Flood again from each root. A neighbour is accepted only while the cell byte is still exactly the owner (no connected bit yet). Accepted cells become `owner | TERRITORY_CONNECTED_MASK`. Passable cells increment `m_TerritoryCellCounts`.
7. `TerritoryDecayManager.SetBlinkingEntities` may set bit 6. The decay manager's own dirty id is restored so this call does not look like a new blink generation to `NeedUpdateAI`.

The smallest later hook for a sovereignty constraint is the neighbour accept in that weight flood, and the same predicate inside `MarkFootprintTiles`. Both write `m_Territories`. Constraining only the flood would still let a footprint paint foreign land, and the infinite weight would then block the flood from correcting it.

### Boundaries

`CTerritoryBoundaryCalculator::ComputeBoundaries` (`source/graphics/TerritoryBoundary.cpp`) scans the grid and traces edges. The discriminator mask in code is:

```text
TERRITORY_BLINKING_MASK | TERRITORY_PLAYER_MASK
```

The comment above that line says the mask is the player id and the connected flag. The code does not include `TERRITORY_CONNECTED_MASK`. A connected and an unconnected cell of the same owner do not form a boundary. A blinking edge does. Neutral cells (`discriminator == 0`) are skipped.

While tracing, the function ORs `TERRITORY_PROCESSED_MASK` into the grid it was given. `ComputeBoundaries` is called on `m_Territories` itself (`CCmpTerritoryManager::ComputeBoundaries`). A second trace without `MakeDirty` sees those bits and will not start new outlines from already processed bottom edges. `GetOwner` masks the bit off, so gameplay queries survive.

### World lines

`UpdateBoundaryLines` turns each `STerritoryBoundary` into an `SOverlayTexturedLine`:

- Textures `art/textures/misc/territory_border.png` and `territory_border_mask.png`.
- Color from `ICmpPlayer::GetDisplayedColor` for `boundaries[i].owner`.
- Thickness `m_BorderThickness` (0.75), closed loop.
- `SimRender::SmoothPointsAverage`, then `SimRender::InterpolatePointsRNS` with `m_BorderSeparation` (0.85).
- Blinking lines multiply alpha by `0.2 + 0.8 * abs(cos(pi * m_AnimTime))` in `Interpolate`.

`RenderSubmit` submits each overlay to `SceneCollector` if `IsVisible()` and the frustum test passes. This path is not the territory texture.

### Territory texture

`CTerritoryTexture` (`source/graphics/TerritoryTexture.h`) says it is the boundary texture used for rendering and the minimap. `GenerateBitmap` does not fill territory areas. For each cell it writes the owner's displayed RGB. Alpha is `0xC0` on owner 0 and on any cell whose 4-neighbour owner differs; interior alpha is 0. A separable max-filter then fades that edge by `0x20` per cell, and cells still at `0xC0` are set back to alpha 0. The uploaded image is a colored ribbon, not an ownership mask. Owner 0 is treated as an edge to erase, which is why uninfluenced land does not paint the minimap.

Size: `m_MapSize = GetMapSize() / 8` because `GetMapSize` is metres (`CCmpTerrain::GetMapSize`) and `NAVCELL_SIZE_INT` is 1. The GPU texture side is `bit_ceil(m_MapSize)`, `R8G8B8A8_UNORM`. Only the `m_MapSize` square is uploaded (`RecomputeTexture`).

`UpdateDirty` uses `ICmpTerritoryManager::NeedUpdateTexture`. `RecomputeTexture` also deletes the texture when `m_MapSize != GetVerticesPerSide()`. Those two numbers are different quantities (territory cells versus terrain vertices), so a dirty recompute currently destroys and recreates the texture. A sovereignty texture should compare the previous cell count with the new cell count, and should not copy this test.

`SceneRenderer` calls `GetTerritoryTexture().UpdateIfNeeded` and then `CMiniMapTexture::RenderFinalTexture` (`source/renderer/SceneRenderer.cpp`). The world terrain does not sample this texture. World borders are the overlays above.

### Minimap

`CMiniMapTexture::RenderFinalTexture` draws the territory ribbon in its own pass, binding `territoryTexture.GetTexture()` and `GetMinimapTextureMatrix()` (`source/graphics/MiniMapTexture.cpp`). LOS is a later pass (`minimap_los`). `CMiniMap` (`source/gui/ObjectTypes/CMiniMap.cpp`) only asks `CGameView::GetMiniMapTexture()` to render. `binaries/data/mods/public/gui/session/minimap/MiniMap.xml` is the frame, buttons, and idle-worker text. It does not sample the territory texture. A second boundary layer does not require a public GUI change if the C++ minimap composites it.

`CCmpMinimap` is the entity-icon list, not the territory raster.

## 3. Current Nation sovereignty architecture

`Sovereignty.js` is a scripted system component. `Init` stores `this.regions` as `{ owner, points: [{x, z}, ...] }`. `OnInitGame` reads `InitAttributes.settings.Sovereignty`. `gamesettings/attributes/Sovereignty.js` copies that array from the map's `ScriptSettings`. `ReadRegions` requires an integer owner that is a real player and at least three finite points. There is no grid and no `TerritoryManager` call in this file.

`GetSovereignOwner` is an even-odd ray cast along +x. Points on a segment count as inside. The first containing region wins, so a shared edge belongs to the earlier region. A miss returns `INVALID_PLAYER`. The component does not serialize a custom blob; the region array is ordinary component state. Production code calls `ReadRegions` only from `OnInitGame`.

The food-crisis map stores two polygons in `maps/scenarios/nation_food_crisis.xml` under `ScriptSettings.Sovereignty`, owners 1 and 2. The same pattern is in `nation_1961_sandbox.xml`. Terrain, camera, and entities are the rest of the scenario XML (`<Terrain patches="24" ...>`, `<Entities>`). Patches of 24 are 384 terrain tiles and 1536 metres.

Legal owner and effective controller are already different queries. `NationSettlement.GetSovereignOwner` uses the polygon test on the settlement position. `NationSettlement.GetEffectiveController` calls `TerritoryManager.GetOwner` and treats 0 as "Uncontrolled." `DomesticAdministration.MayPlace` allows a build only when the sovereign of the point is the builder, and its comment says existing control is not consulted. `MilitaryOccupation.MayPlace` requires another state's land and a local occupation; it does not read `TerritoryManager`. The template `structures/nation/foreign_administration` is that foreign administration. There is no `ForeignAdministration.js`.

## 4. Required Nation spatial model

Three grids, three meanings:

| Grid | Question | Owner 0 |
|---|---|---|
| Sovereignty | Which state legally owns this ground? | Unclaimed. Not neutral territory, and not "no country" in the territory sense. |
| Territory | Which influence currently paints this cell? | No administrative influence. On Densiran land this is hinterland, still Densiran. |
| LOS | What has this player seen? | Not an owner. Unexplored, explored, or visible. |

A valid cell is sovereignty Densira, territory Adomé, LOS explored for Densira: Adomé holds effective control inside Densira, and Densira has seen that ground. Another valid cell is sovereignty Densira, territory 0: hinterland. Forests, farms, mines, roads, and future districts sit there without a root influence.

Densira's dynamic regions are the influence footprints of the Presidential Palace and the district centers at Esika, Bontuku, Sefira, and Anomara. Adomé's Avémé influence is the same kind of object on Adomé's sovereignty. Ordinary domestic influence must not flood across the legal border. Foreign administration may, only when an explicit flag says this influence is allowed to paint inside someone else's sovereignty. Occupation rules stay in `MilitaryOccupation.MayPlace`, which already decides whether that building may be placed.

## 5. Proposed SovereigntyManager

`CCmpSovereigntyManager` should not subclass territory and should not include `IsConnected`, blinking, `TerritoryDecay`, roots, or weights. Nothing in the territory pipeline requires those for a static owner raster. Copying them would make hinterland look "unconnected" and would invite decay and AI blink logic onto legal borders.

Name the component `SovereigntyManager`, not `Sovereignty`. The scripted component `Sovereignty.js` already owns the name `Sovereignty`. A second component with that name would collide.

### API

| Method | V1 | Why |
|---|---|---|
| `GetOwner(x, z)` | Yes. Script-exposed. | This is the only query Nation uses. The grid stores 0 for an unclaimed cell. The function returns `INVALID_PLAYER` (`-1`, `source/simulation2/helpers/Player.h`, also the script global set in `ComponentManager.cpp`) for that cell and for a grid that is not built yet. `TerritoryManager::GetOwner` returns 0 for the same stored byte and calls it neutral. These two functions must not share that return. |
| `GetSovereigntyGrid()` | Yes. C++ callers (boundary, texture, later territory constraint). Not required in the script wrapper. | Same role as `GetTerritoryGrid`. |
| `NeedUpdateTexture(dirtyID)` | Yes, once a texture or line mesh exists. Step A can include the dirty counter even if nothing renders yet. | Matches `NeedUpdateTexture` so a later texture does not invent a second protocol. |
| Line visibility | Not under the names `SetVisibility` / `IsVisible`. | Those names mean LOS everywhere else (`ICmpRangeManager::GetLosVisibility`, `LosVisibility`). Territory's `SetVisibility` is only a render toggle loaded from XML. If sovereignty lines need a toggle, call it `SetLineVisibility` / `AreLinesVisible`, and do not put it in the script wrapper until lines exist. |
| `GetPercentage` | No. | `GetTerritoryPercentage` counts passable influenced cells. Legal area is not that. |
| `GetNeighbours` | No. | Territory uses it for border ownership counts and decay. Sovereignty has no decay. |

Painted owners stay in 1–31 so a later boundary discriminator can use the same 5-bit field territory uses. The stored grid itself should be a plain `uint8_t` owner, with no flag bits. `Sovereignty.ReadRegions` already rejects owners that are not real players. Keep that check. Do not accept owner 0 as a painted region. Cell value 0 is only the cleared, unclaimed cell. It is not Gaia, and it is not `TerritoryManager`'s neutral. `GetOwner` turns that 0 into `INVALID_PLAYER` so `SettlementConnectivity` and `Sovereignty.GetSovereignOwner` keep seeing unclaimed land as `-1`. C++ code that constrains a flood reads the grid byte, not `GetOwner`.

`SetVisibility` in the prompt is the wrong verb for this component. Per-player knowledge is not stored here.

## 6. Runtime data representation

Runtime is `Grid<uint8_t>` at `NAVCELLS_PER_TERRITORY_TILE` (8 metres). `GetOwner` uses the same `NearestTerritoryTile` rounding as territory (`CCmpTerritoryManager.cpp`): `ToInt_RoundToNegInfinity` of `x / 8` and `z / 8`, clamped to the grid. That keeps a later constraint comparing cell to cell without a second rounding. The return is `INVALID_PLAYER` when the byte is 0.

Authoring stays polygons until rasterization (section 15). Rasterize on `OnInitGame` and again if `MT_TerrainChanged` changes the map size. Sample each cell at its center in metres and run the current even-odd test, first region wins, boundary points inside. That is the quantization of `Sovereignty.pointInPolygon`. Cell edges will not follow the polygon exactly. Document that; do not keep the ray cast as the simulation query after the grid exists, or territory and sovereignty will disagree on the same point.

Do not use `m_CostGrid`. A forest does not move a border.

Serialize the polygon list and a dirty flag, then rebuild the grid, unless a later editor writes individual cells. Rebuilding matches `CCmpTerritoryManager::Serialize`, which refuses to archive the derived grid. The rasterizer must be a pure function of the polygons and the map size.

`GetOwner` before the grid exists returns `INVALID_PLAYER`. The grid is a cache, filled by `GetOwner` and `GetSovereigntyGrid` the same way `CCmpTerritoryManager::GetOwner` calls `CalculateTerritories` when the grid is missing. `InitGame` is not used. It is registered from `Messages.js` after native `ClassInit`, and local message delivery is sorted by component id only as the current `SubscribeToMessageType` implementation, not as a contract. A query builds the grid from `InitAttributes` as soon as that global exists, so a scripted `OnInitGame` handler that asks gets the legal owner inside that call. Deserialize rebuilds from the saved polygons because saved games skip `InitGame`. `MT_TerrainChanged` rebuilds only when the map dimensions change.

## 7. Boundary-calculator refactor

`ComputeBoundaries` depends on territory in three ways:

1. The discriminator is `TERRITORY_BLINKING_MASK | TERRITORY_PLAYER_MASK`, not the connected bit, despite the comment in `TerritoryBoundary.cpp`.
2. Owner 0 is skipped because the discriminator is 0.
3. Progress is stored by setting `TERRITORY_PROCESSED_MASK` on the input grid.

Smallest refactor that does not change territory output:

- Copy the input into a working grid, or keep a side `Grid<uint8_t>` of processed bits. Stop writing `TERRITORY_PROCESSED_MASK` into `m_Territories`. Territory behavior stays the same if the copy is processed and the original is not.
- Pass the discriminator mask and the owner-bit mask as arguments. Territory passes the masks it uses today. Sovereignty passes a mask of `0xFF` over a grid that contains only owner ids, and a blinking extractor that is always false.
- Keep the winding, curvature, and tile-size math (`NAVCELL_SIZE * NAVCELLS_PER_TERRITORY_TILE`).

Do not add a second copy of the edge follower. Do not teach the calculator about influence or decay.

After that, `CCmpSovereigntyManager` can call `ComputeBoundaries` on its own grid and build a separate `vector<SBoundaryLine>`. Territory's `m_BoundaryLines` stay untouched.

## 8. World-rendering integration

Territory lines are `SOverlayTexturedLine` objects submitted by `CCmpTerritoryManager::RenderSubmit`. They are not drawn from `CTerritoryTexture`.

Sovereignty lines should be a second vector, submitted from `CCmpSovereigntyManager::RenderSubmit` (subscribe to `MT_Interpolate` and `MT_RenderSubmit` the same way). Reuse `territory_border.png` only if the art direction is the same stroke. Prefer a second texture path in `sovereigntymanager.xml` so territory's 0.75 thickness and 0.85 separation stay in `territorymanager.xml`. Use the same `SmoothPointsAverage` and `InterpolatePointsRNS`. Do not blink. Color by `ICmpPlayer::GetDisplayedColor` of the sovereign, which is already how territory picks color.

`DISABLE_TERRITORY_OVERLAY` in `CCmpTerritoryManager.cpp` is a debug fill and is compiled off. Do not turn it on for sovereignty.

Lines are not filtered by LOS inside `RenderSubmit` today. Section 10 says where that filter goes. Until it exists, sovereignty lines would show through unexplored ground, which is the wrong default for Nation. Step A should not submit lines. The first rendering step should hide segments whose cells are unexplored for the viewing player.

## 9. Minimap integration

Path today:

`CCmpTerritoryManager` grid → `CTerritoryTexture::GenerateBitmap` → `CGameView::TerritoryTexture` → `SceneRenderer` → `CMiniMapTexture::RenderFinalTexture` territory pass → LOS pass.

`MiniMap.xml` is not on that path.

Minimum later engine change for a second layer:

- `CGameView` owns a `CSovereigntyTexture`.
- `SceneRenderer` updates it next to the territory texture.
- `CMiniMapTexture::RenderFinalTexture` takes that texture and runs a second pass with the existing territory technique (same shader, different texture and matrix). Draw it under the LOS pass so fog still covers it.

No change to `CCmpMinimap` or `public/gui/session/minimap/*` is required for the ribbon itself.

## 10. LOS / knowledge interaction

`LosState` (`source/simulation2/helpers/Los.h`) is two bits per player inside `CCmpRangeManager::m_LosState`, a `Grid<uint32_t>`:

- `UNEXPLORED = 0`
- `EXPLORED = 1`
- `VISIBLE = 2`
- `MASK = 3`

Player `p` uses shift `2 * (p - 1)`. `CLosQuerier::IsVisible` checks the high bit of each pair. `IsExplored` checks the low bit. Explored stays set after the unit leaves; visible is cleared. `GetLosVisibilityPosition` maps that to `LosVisibility::HIDDEN`, `FOGGED`, or `VISIBLE`. `LOS_TILE_SIZE` is 4 metres. The grid is serialized because it is history (`CCmpRangeManager` serialize comment). `GetLosRevealWholeMap` forces `VISIBLE`.

`ExploreTerritories` reveals LOS only where `(grid & TERRITORY_PLAYER_MASK) > 0`. Owner 0 is not auto-explored. Sovereignty must not call this. Hinterland would either be skipped or, if someone passed sovereignty through that function, would reveal the whole country.

Objective sovereignty is the `uint8_t` grid. It does not change when a player walks. Knowledge is a render decision:

- V1 borders do not move, so explored cells may show the true owner. Unexplored cells draw nothing. Fogged cells keep showing that true owner. Visible cells show it too.
- Sample LOS at the cell, or at the LOS vertices the cell covers. Do this in the texture generator and the line builder for the viewing player. Do not write the result back.
- If a later treaty changes a border, a static "show the truth once explored" rule would update fogged land the player is not looking at. At that point add a per-player `knownOwner` grid, written only when the cell is explored or visible. That grid is knowledge, not sovereignty. Do not build it in V1. Do not design espionage, sharing, or deception.

`m_LosState` is the wrong place to store a country id. The bit pairs are full at 16 players (`2 * 16 = 32`).

## 11. TerritoryManager relationship

Future rule:

- Domestic influence of player P may enter a cell only when sovereignty of that cell is P.
- An influence marked foreign may write P into a cell whose sovereignty is not P.

Where it lives: `CCmpTerritoryManager::CalculateTerritories`, in two writers:

- `MarkFootprintTiles`, before `m_Territories->set`.
- The weight-flood assignment `if (totalWeight > bestWeightGrid...)`.

The connected flood does not need its own sovereignty test if it only expands through cells the weight flood already set to that owner.

The foreign bit should be a boolean on `TerritoryInfluence`, default false, so `foreign_administration.xml` can set it. `CCmpTerritoryManager` reads the bit. It does not query `MilitaryOccupation`, settlement radius, or diplomacy. If the building was not allowed to exist, `MayPlace` already rejected it. Destroying the influence entity dirties territory through the existing ownership and position messages, and the foreign paint disappears on the next calculate. That matches "withdrawal does not delete the administration entity" only while the entity remains. Do not add a second territory grid for occupation.

Do not put this rule in Step A. Shipping the grid and the constraint in one change makes territory failures look like sovereignty bugs.

Player 0 on the territory grid remains "no influence." Domestic builders must not treat it as foreign, and must not treat it as gaia. The sovereignty grid answers which of those it is.

## 12. Construction and build restrictions

`BuildRestrictions.CheckPlacement` (`binaries/data/mods/public/simulation/components/BuildRestrictions.js`) is the only simulation placement test. Nation does not fork it. `Commands.js` `TryConstructBuilding` destroys the foundation when it fails. Preview uses the same function via `GuiInterface.js`.

Order inside `CheckPlacement`:

1. `tileOwner == playerID` → own. Blinking own also needs the token `neutral`.
2. Else exclusive mutual ally → ally. Blinking allied land also needs `neutral`.
3. Else `tileOwner == 0` → neutral. Allowed only if the template lists `neutral`.
4. Else enemy. Allowed only if the template lists `enemy`.

`neutral` therefore means two things: territory owner 0, and a waiver for blinking own or allied land. `template_structure.xml` is `own` only, so owner 0 is not buildable for ordinary structures. Civil centres and `structures/nation/regional_administration.xml` are `own neutral`. `foreign_administration.xml` is `own neutral enemy`.

Because own is tested first, a builder whose player id is 0 sees an owner-0 tile as own, not neutral. Do not change that.

`DomesticAdministration.MayPlace` runs as well, but it cannot undo a failed `CheckPlacement`. Regional administration is buildable on territory 0 only because the template says `neutral`, after which `MayPlace` requires the builder's sovereignty. A Densiran builder on Adoméan hinterland (sovereignty Adomé, territory 0) still passes `CheckPlacement` and is rejected by `MayPlace`. A Densiran house, which is only `own`, cannot be placed on Densiran hinterland at all.

`TerritoryDecay.IsConnected` treats owner 0 as neutral decay, not as a build permit. `template_structure.xml` decays on `neutral` and `enemy`. A building that somehow stands on territory 0 will decay. That is separate from placement.

Proposed vocabulary, added beside the four tokens, ignored when absent:

| Token | Meaning |
|---|---|
| `sovereign` | The cell's sovereignty is the builder. Territory may be the builder or 0. |
| `foreign` | The cell's sovereignty is some other state. Does not by itself grant occupation. |

Do not redefine `neutral`. Templates that only say `own`, `ally`, `neutral`, or `enemy` keep today's results. `sovereign` is how a Densiran farm will eventually be allowed on Densiran hinterland and refused on Adoméan hinterland without listing `neutral`, which would also accept foreign territory-0 land at the `CheckPlacement` layer.

Genuinely unclaimed ground is sovereignty 0 and territory 0. Neither `sovereign` nor a foreign-administration check should accept it unless a template later says so in those words. Do not call that state `neutral`.

The hook is `CheckPlacement`, because a wrapper that only runs after success cannot permit hinterland for `own`-only templates. This audit does not authorize that public edit.

## 13. AI exposure

`AIInterface.js` does not carry the grid. `CCmpAIManager::RunGamestateInit` (`source/simulation2/components/CCmpAIManager.cpp`) copies `GetTerritoryGrid()` into a JS object `{width, height, data: Uint8Array}` (`EngineScriptConversions.cpp` `ToJSVal<Grid<uint8_t>>`). Later turns `memcpy` into that array when `NeedUpdateAI` says the dirty ids moved. `shared.js` sets `cellSize = mapSize / width`. Petra wraps it in `createTerritoryMap` (`simulation/ai/petra/mapModule.js`) and masks with `0x1F` and `0x40`. Petra never reads `TERRITORY_CONNECTED_MASK`. Its "connected" test is "not blinking."

Important consumers, all assuming owner 0 is neutral gaia:

| Location | Behavior |
|---|---|
| `BuildRestrictions.CheckPlacement` and Petra `createObstructionMap` | Owner 0 is buildable only with `neutral`. |
| `headquarters.js` `findEconomicCCLocation`, `findStrategicCCLocation` | Only owner 0 is a civic-centre site. |
| `updateTerritories`, `basesManager.js` | Bases are tiles whose owner is this player. Owner 0 is frontier, not homeland. |
| `queueplanBuilding.js` | Placement is cleared where the base index is 0. |
| `defenseManager.js` | Owner 0 is not enemy territory. Armies there are dropped unless near a civic centre. |
| `worker.js` | Owner 0 is a legal gather tile. Enemy-owned tiles are not. |
| `attackPlan.js` | Rally and arrival require the target player's owner bits. Owner 0 is neither. |
| `diplomacyManager.js` | Attacks count when the target tile owner is this player. |
| `transportPlan.js`, `navalManager.js` | Owner 0 is an acceptable landing or fishing tile. |
| `victoryManager.js` | A relic counts as "ours" only when the tile owner is this player. |
| `common-api/terrain-analysis.js` | Passability only. No territory. |

If Densiran hinterland stays territory 0, Petra will treat it as colonizable gaia: civic centres may be proposed there, houses will not, gathering will, and defense will not treat foreign troops there as inside a country. That is the wrong country and the right description of today's territory grid. Do not "fix" it by painting hinterland as territory owner 1. That would invent administrative control.

Expose sovereignty as a second object on the AI state, for example `sovereigntyMap`, same `{width, height, data}` shape, plain owner bytes, updated only when `NeedUpdateTexture`'s dirty id changes. Do not pack it into the territory `Uint8Array`. Do not change Petra in the Nation engine step. A later Nation AI reads `sovereigntyMap` when it means "our country" and `territoryMap` when it means "our current administration."

## 14. Nation migration plan

Every production caller either calls `Sovereignty.GetSovereignOwner` or `NationSettlement.GetSovereignOwner`, which is that call. None mutate borders. None walk polygon vertices except the component itself. `SovereignBorderTracker` also checks `GetRegions().length` as a "regions have loaded" gate and does not read points.

Class A — keep calling `GetSovereignOwner({x, z})`. A thin adapter can answer from the engine grid. This is the whole production set:

- `DomesticAdministration.MayPlace`
- `MilitaryOccupation.MayPlace`
- `NationSettlement.GetSovereignOwner`
- `ForeignMilitaryPresence.OnGlobalOwnershipChanged`
- `CommodityInventory.SovereignOwner` and `CommodityExportManager.SovereignOwner`
- `TransportEfficiency.SovereignAt` (commercial corridors use this, not a separate corridor component)
- `SovereignBorderTracker.OnGlobalPositionChanged`
- `NationSettlementManager.GetSettlementsForSovereign`, and therefore `RepresentativeCapacity`, `PopulationFoodConsumption`, `GovernmentFinance.GetRevenuePerTick`, `SettlementDiscontent`, `NationScenarioController.ReadWorld`, `RebellionManager.GetActiveCount`
- `SettlementConnectivity.GetCapitalForSovereign` and `GetPathToCapital`
- `InfrastructureInvestment.EndpointsAuthorized` (settlement ends). `HasAuthority` stays on the link entity's `Ownership` and must not be moved onto this query.
- `MilitaryOccupation.GetOccupier`, `RebellionManager.SpawnGroup`, `AgreementEvaluator.BeneficiaryOccupiesProvider`
- `SettlementDiscontent.GetSettlementView`, which separates `legalSovereignty` from `effectiveControl` and `militaryOccupation`
- `NationScenarioController.PlaceNames`

`TransitAccess.CanTransit` does not query sovereignty. It is a grant table. Leave it.

`SovereignEntryClassifier`, `BorderIncidentManager`, `BorderWarningManager`, and the ultimatum and crisis listeners consume messages. They do not query the component. They stay valid if the tracker still posts `MT_SovereignBorderCrossed`.

The GUI (`NationSettlementStatus.js`) prints `state.nationSettlement` from `GetSettlementView`. It does not call `GetSovereignOwner`.

Class B — none for the first migration. No caller needs a cell index.

Class C — none in production. Do not redesign these systems to learn about grids.

Migration that preserves behavior:

1. Engine component rasterizes the same polygons.
2. `Sovereignty.GetSovereignOwner` delegates to `Engine.QueryInterface(SYSTEM_ENTITY, IID_SovereigntyManager).GetOwner` when that component exists, and keeps the ray cast if it does not. The delegated value is already `INVALID_PLAYER` for an unclaimed cell. Do not pass the raw grid byte through, because 0 would look like Gaia to any caller that special-cases `INVALID_PLAYER` (`SettlementConnectivity` skips `INVALID_PLAYER` and would not skip 0 the same way).
3. Replace `GetRegions().length` with a `HasRegions()` or "grid ready" query so the border tracker does not depend on polygon storage.
4. Only after the adapter matches `test_Sovereignty.js` on the food-crisis points, delete the ray cast.

`GetEffectiveController` stays on `TerritoryManager`. Do not route it through the new component.

## 15. Map authoring and storage

Current files store terrain as `<Terrain patches="...">`, entities as `<Entities>`, players and polygons inside `<ScriptSettings>` JSON. Sovereignty is not a raster and not an entity.

| | A. Raster in the map | B. Polygons compiled to a grid | C. Entities compiled to a grid |
|---|---|---|---|
| Determinism | High, if the file is the grid. | High, if the rasterizer is integer and specified. | High, but the result depends on entity placement and radius. |
| File size | 64 KiB raw at 2048 m, more in XML. | The food-crisis border is two short rings. | One entity does not describe hinterland. |
| Atlas | A paint layer fits Atlas later. There is no such layer now. | The current maps are already authored this way. Atlas would need a polygon tool. | Atlas already places entities, and would draw disks, not the legal border. |
| Runtime cost | Load and copy. | One even-odd pass over the cells at load. | Same flood cost as territory, and it recreates the model we are leaving. |
| Resize | The bitmap's dimensions must be rewritten. | Recompile from metres onto the new grid. | Entities keep positions; the legal border still is not an entity. |
| Irregular borders | As good as the cell size. | The polygons already are the irregular border. Cells quantize them. | Poor. A border would be a chain of dummy influence entities. |
| Procedural maps | A generator can stamp cells. | A generator can emit the same polygon schema. | A generator would fake a country with buildings. |

Recommend B for authoring and the `uint8_t` grid for runtime. Nation's maps, tests, and `GameSettings` attributes already speak polygons. Runtime queries need a grid so territory can reject a neighbour in constant time. Do not store both in the file. The grid is a cache.

Raster rule for the compiler: cell center `(i * 8 + 4, j * 8 + 4)` in metres, existing even-odd test, first region wins. Shared edges stay with the earlier region, matching `GetSovereignOwner`.

## 16. Engine registration and build changes

Premake already compiles every translation unit under `simulation2/components` (`build/premake/premake5.lua` `source_dirs`). A new `.cpp` there does not need a project-file edit. These files do:

| File | Change |
|---|---|
| `source/simulation2/components/ICmpSovereigntyManager.h` | Interface. `DECLARE_INTERFACE_TYPE(SovereigntyManager)`. |
| `source/simulation2/components/ICmpSovereigntyManager.cpp` | `BEGIN_INTERFACE_WRAPPER`. Export `GetOwner` only in Step A. |
| `source/simulation2/components/CCmpSovereigntyManager.cpp` | `REGISTER_COMPONENT_TYPE(SovereigntyManager)`. |
| `source/simulation2/TypeList.h` | `INTERFACE(SovereigntyManager)` and `COMPONENT(SovereigntyManager)`. Order is the component id. Append; do not insert in the middle. |
| `source/simulation2/system/ComponentManager.cpp` | `AddComponent(m_SystemEntity, CID_SovereigntyManager, noParam)` in `AddSystemComponents`, next to `CID_TerritoryManager`. It is a native system component, not a scripted one. |
| `source/simulation2/components/tests/test_SovereigntyManager.h` | Cell-center ownership, shared edge, unclaimed 0, serialize rebuild. |
| `source/simulation2/MessageTypes.h`, `TypeList.h`, `scripting/MessageTypeConversions.cpp` | Only when `SovereigntiesChanged` is added. |

No `public/` script, no `Sovereignty.js` edit, and no `territorymanager.xml` edit belong in Step A.

`CID_*` values come from `Components.h` including `TypeList.h`. Inserting an interface in the middle would renumber serialized component ids. Append.

## 17. Event and update model

`CMessageTerritoriesChanged` exists because influence moves during a match. Sovereignty on a Nation map does not move every turn. A message is still justified, fired only when the grid is replaced:

- After the initial raster in `OnInitGame`, so a listener that runs later in the same turn can refresh. `m_TriggerEvent` on territory already does this for the first calculate.
- After any later `ReadRegions` or cell write: scenario border change, decolonization, annexation, treaty, Atlas edit.

Do not broadcast it from `MT_Update` when nothing changed. Static food-crisis borders emit it once.

Name it `SovereigntiesChanged`, empty payload, same shape as `CMessageTerritoriesChanged`. Script conversion is an empty object. `SovereignBorderTracker` does not need it for movement; it already samples `GetOwner` on `MT_PositionChanged`. Territory's later constraint needs the message only if it caches a mask. It should not cache in the first version; `MakeDirty` on territory already runs on terrain changes, and sovereignty will be ready before influence is queried if both build in `OnInitGame`.

Do not reuse `MT_TerritoriesChanged` for legal border changes. Listeners of that message (`TerritoryDecay` and the AI dirty path) would treat a treaty as a control recalculation, which may be desired later and is the wrong default now.

## 18. Performance and memory

Cell size is 8 metres. Counts below use `tiles = metres / 8`, `cells = tiles²`, texture side `bit_ceil(tiles)`, GPU allocation `side² * 4` bytes. The upload itself is `tiles² * 4`.

| Map | Metres | Cells on a side | Cells | Grid bytes | Texture side | Texture allocation |
|---|---|---|---|---|---|---|
| Current small Nation maps | 512 | 64 | 4,096 | 4 KiB | 64 | 16 KiB |
| Food-crisis Large | 1,536 | 192 | 36,864 | 36 KiB | 256 | 256 KiB |
| Very Large | 1,792 | 224 | 50,176 | 49 KiB | 256 | 256 KiB |
| Giant | 2,048 | 256 | 65,536 | 64 KiB | 256 | 256 KiB |

A boundary scan is one pass over those cells plus the perimeter. That is not a frame-time problem beside the existing territory flood, which already builds several `Grid<uint32_t>` weight maps of the same dimensions per player. Sovereignty does not flood.

LOS is the larger grid: 4 metre vertices, `uint32_t` per vertex. At 2048 metres that is 512² × 4 = 1 MiB, and it already exists. Sovereignty should not allocate a per-player copy of that.

No benchmark is useful at these sizes. The cost to avoid is recomputing polygons with a ray cast on every `GetOwner`, and rebuilding boundary geometry every turn when the dirty id did not move.

## 19. Upstream versus Nation divergence

`git diff main...HEAD -- source/` is empty. Nation has not edited `CCmpTerritoryManager`, territory influence, boundary, texture, LOS, minimap, or range manager.

`MarkFootprintTiles` is upstream `46db652641`, on `main` and on this branch. It writes infinite weight onto a building footprint so a neighbour's influence cannot steal the tiles under the building. The oldest entity id wins a shared tile. Sovereignty work must not delete or weaken that. When the domestic constraint is added later, the footprint write and the flood must use the same predicate. If only the flood is constrained, a domestic building standing on the wrong side of a border would still own those tiles, and the infinite weight would make the mistake stick.

No other Nation-specific engine edit needs to be preserved, because there are none.

## 20. Risks and unresolved questions

- Cell 0 is unclaimed sovereignty and uninfluenced territory. The stored integers match. The meanings do not. `TerritoryManager.GetOwner` returns that 0 and documents it as neutral (`ICmpTerritoryManager.h`). `SovereigntyManager.GetOwner` must return `INVALID_PLAYER` instead. Passing either function's 0 into the other API is a category error. Player 0 remains Gaia for entity ownership and is not a sovereign.
- `CheckPlacement` treats builder id 0 on a 0 tile as own. A sovereignty token has to be careful not to "fix" Gaia.
- `neutral` both allows territory 0 and waives blinking. A new `sovereign` token must not become a second waiver for blinking enemy land.
- The boundary comment and the discriminator mask disagree. A refactor that "corrects" the mask to include the connected bit would draw new territory outlines. Do not correct it.
- `ComputeBoundaries` mutates the grid. A shared function that still sets bit 7 on the sovereignty grid would be harmless only while that grid has no flag bits. Prefer a side mask so the next reader does not depend on that accident.
- `CTerritoryTexture::RecomputeTexture` rebuilds when territory-cell count differs from terrain vertex count, which is always. Do not copy that condition.
- Rasterizing at 8 metres moves the legal border off the exact polygon. `test_Sovereignty.js` points that sit on a shared edge, including `(256, 200)` on the unit-test rectangles, are exact ray-cast results. After the adapter, those edge points follow the cell center, and a mismatch there is quantization, not a broken polygon. Points well inside a ring, including Avémé at `(1312, 820)`, must stay on the same owner.
- `GetOwner` during the frame before `OnInitGame` returns `INVALID_PLAYER`. Scripted handlers already race on this. The engine component has to be ready first.
- Foreign paint without the template bit will be impossible after the constraint, even if `MayPlace` allowed the building. The template and the flood flag must ship together, later than Step A.
- Petra will keep colonizing territory 0 until a Nation AI exists. That is acceptable. Do not paint hinterland as territory to calm Petra.
- Player ids above 31 cannot be stored in territory's 5-bit field. Sovereignty can store them in `uint8_t` but should reject them anyway so the two grids stay comparable. `player_id_t` is `int32_t`, so `GetOwner` can return `-1` even though the grid cannot store it.
- Whether fogged players should see a border change is deferred with the knowledge grid. V1 has no border changes after load.

## 21. Recommended implementation sequence

1. Engine Step A, below. Grid, `GetOwner`, tests. No rendering, no territory edits, no JS edits.
2. Adapter in `Sovereignty.js` so current callers hit the grid. Keep `test_Sovereignty.js` and `test_AvemeSettlement.js` green, including `(1312, 820)` → player 2 and the shared edge.
3. Boundary calculator side-mask refactor with a territory regression test (`test_TerritoryManager.h`) proving the same outlines. Then sovereignty lines, hidden where the viewing player is unexplored.
4. `CSovereigntyTexture` and a second minimap pass, same LOS rule.
5. Domestic constraint in `CalculateTerritories` and `MarkFootprintTiles`, plus the foreign boolean on `TerritoryInfluence`, plus the foreign-administration template. Not before the grid is trusted.
6. `sovereign` / `foreign` placement tokens in `CheckPlacement`, without changing results for templates that omit them.
7. `sovereigntyMap` on the AI state. No Petra behavior change until a Nation AI is an explicit task.

## 22. Engine Step A scope

Hand this section to the implementer. Do not add behavior that is not listed.

**Add**

- `ICmpSovereigntyManager` and `CCmpSovereigntyManager` as a native system component, registered as in section 16.
- Read `InitAttributes.settings.Sovereignty` when `GetOwner` or `GetSovereigntyGrid` is first asked, the same lazy pattern as `CCmpTerritoryManager::GetOwner`. Do not subscribe to `InitGame`. That message is registered from script after `ClassInit`, and component-id order is not a delivery contract. Accept the same region objects `Sovereignty.ReadRegions` accepts: integer owner, at least three `{x, z}` points. Reject the whole set on any bad region, leaving every cell 0. Deserialize rebuilds from the saved polygons. `MT_TerrainChanged` rebuilds only when the map dimensions change.
- Rasterize to `Grid<uint8_t>` at 8 metre cells using cell centers and the even-odd, first-region-wins rule in section 15. A cleared cell is byte 0.
- `GetOwner(x, z)` with `NearestTerritoryTile` rounding. Script-exposed. A cell byte of 0, and a grid that does not exist yet, both return `INVALID_PLAYER`. A painted cell returns that player id.
- `GetSovereigntyGrid()` for C++. Callers that need the byte 0 read this grid. They do not read `GetOwner`.
- A dirty counter and `NeedUpdateTexture(size_t*)`, incremented when the grid is built or replaced. No texture yet.
- Serialize the regions (or an equivalent deterministic copy) and rebuild the grid on deserialize. Do not archive derived flag bits. There are none.
- On `MT_TerrainChanged`, rebuild the grid at the new size from the same regions.
- A C++ test: a rectangle owned by player 1, a second region owned by player 2, a point whose cell center is outside both returns `INVALID_PLAYER` while the grid byte is 0, a shared edge follows the earlier region at the cell center, and a deserialize round-trip preserves `GetOwner`. Do not assert the raw coordinates in `test_Sovereignty.js` until the JS adapter exists. Those tests still hit the ray cast.

**Do not add**

- Rendering, minimap changes, LOS reads, or `SovereigntiesChanged` unless the test needs a message. Prefer no message in Step A.
- `GetPercentage`, `GetNeighbours`, connected, blinking, decay, weights, roots, cost grid.
- Any edit to `CCmpTerritoryManager`, `MarkFootprintTiles`, `BuildRestrictions.js`, Petra, or `Sovereignty.js`.
- Any use of territory owner 0 as a substitute for sovereignty.

**Done when**

A test map polygon identical to the food-crisis Adomé ring returns player 2 from `GetOwner` at the center of the cell that contains `(1312, 820)`, and player 1 for the Esika cell. Those two rings cover every cell of the real 1536m map. `INVALID_PLAYER` is asserted on a larger grid, at a cell center outside both rings. The grid byte there is 0. Territory behavior and Nation's JS component are unchanged because they were not edited.
