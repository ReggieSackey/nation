/* Copyright (C) 2026 Wildfire Games.
 * This file is part of 0 A.D.
 *
 * 0 A.D. is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * 0 A.D. is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with 0 A.D.  If not, see <http://www.gnu.org/licenses/>.
 */

#include "lib/self_test.h"

#include "graphics/TerritoryBoundary.h"
#include "lib/file/file_system.h"
#include "lib/file/vfs/vfs.h"
#include "lib/path.h"
#include "maths/Fixed.h"
#include "maths/FixedVector2D.h"
#include "maths/FixedVector3D.h"
#include "maths/Matrix3D.h"
#include "maths/Vector2D.h"
#include "ps/CStr.h"
#include "ps/Filesystem.h"
#include "ps/XML/Xeromyces.h"
#include "scriptinterface/Interface.h"
#include "simulation2/MessageTypes.h"
#include "simulation2/components/ICmpFootprint.h"
#include "simulation2/components/ICmpObstruction.h"
#include "simulation2/components/ICmpObstructionManager.h"
#include "simulation2/components/ICmpOwnership.h"
#include "simulation2/components/ICmpPathfinder.h"
#include "simulation2/components/ICmpPlayerManager.h"
#include "simulation2/components/ICmpPosition.h"
#include "simulation2/components/ICmpSovereigntyManager.h"
#include "simulation2/components/ICmpTerrain.h"
#include "simulation2/components/ICmpTerritoryInfluence.h"
#include "simulation2/components/ICmpTerritoryManager.h"
#include "simulation2/helpers/Grid.h"
#include "simulation2/helpers/Pathfinding.h"
#include "simulation2/helpers/Player.h"
#include "simulation2/helpers/Position.h"
#include "simulation2/system/Component.h"
#include "simulation2/system/ComponentTest.h"
#include "simulation2/system/Entity.h"

#include <cstddef>
#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <vector>

// Minimal mocks. The territory code under test only consults the pathfinder grid,
// ownership, position, influence properties, and (optionally) sovereignty.

class MockPathfinderTerrSov : public ICmpPathfinder
{
public:
	DEFAULT_MOCK_COMPONENT()

	Grid<NavcellData> m_PassabilityGrid;

	pass_class_t GetPassabilityClass(const std::string&) const override { return 0; }
	const Grid<NavcellData>& GetPassabilityGrid() override { return m_PassabilityGrid; }
	void GetPassabilityClasses(std::map<std::string, pass_class_t>&) const override {}
	void GetPassabilityClasses(std::map<std::string, pass_class_t>&, std::map<std::string, pass_class_t>&) const override {}
	entity_pos_t GetClearance(pass_class_t) const override { return entity_pos_t::FromInt(1); }
	entity_pos_t GetMaximumClearance() const override { return entity_pos_t::FromInt(1); }
	const GridUpdateInformation& GetAIPathfinderDirtinessInformation() const override { static GridUpdateInformation gridInfo; return gridInfo; }
	void FlushAIPathfinderDirtinessInformation() override {}
	Grid<std::uint16_t> ComputeShoreGrid(bool = false) override { return Grid<std::uint16_t> {}; }
	std::uint32_t ComputePathAsync(entity_pos_t, entity_pos_t, const PathGoal&, pass_class_t,
		entity_id_t) override { return 1; }
	void ComputePathImmediate(entity_pos_t, entity_pos_t, const PathGoal&, pass_class_t, WaypointPath&) const override {}
	std::uint32_t ComputeShortPathAsync(entity_pos_t, entity_pos_t, entity_pos_t, entity_pos_t,
		const PathGoal&, pass_class_t, bool, entity_id_t, entity_id_t) override { return 1; }
	WaypointPath ComputeShortPathImmediate(const ShortPathRequest&) const override { return WaypointPath(); }
	void SetDebugPath(entity_pos_t, entity_pos_t, const PathGoal&, pass_class_t) override {}
	bool IsGoalReachable(entity_pos_t, entity_pos_t, const PathGoal&, pass_class_t) override { return false; }
	std::vector<CFixedVector2D> DistributeAround(std::vector<entity_id_t>, entity_pos_t, entity_pos_t) const override { return {}; }
	bool CheckMovement(const IObstructionTestFilter&, entity_pos_t, entity_pos_t, entity_pos_t, entity_pos_t, entity_pos_t, pass_class_t) const override { return false; }
	ICmpObstruction::EFoundationCheck CheckUnitPlacement(const IObstructionTestFilter&, entity_pos_t, entity_pos_t, entity_pos_t, pass_class_t, bool = false) const override { return ICmpObstruction::FOUNDATION_CHECK_SUCCESS; }
	ICmpObstruction::EFoundationCheck CheckBuildingPlacement(const IObstructionTestFilter&, entity_pos_t, entity_pos_t, entity_pos_t, entity_pos_t, entity_pos_t, entity_id_t, pass_class_t) const override { return ICmpObstruction::FOUNDATION_CHECK_SUCCESS; }
	ICmpObstruction::EFoundationCheck CheckBuildingPlacement(const IObstructionTestFilter&, entity_pos_t, entity_pos_t, entity_pos_t, entity_pos_t, entity_pos_t, entity_id_t, pass_class_t, bool) const override { return ICmpObstruction::FOUNDATION_CHECK_SUCCESS; }
	void SetDebugOverlay(bool) override {}
	void SetHierDebugOverlay(bool) override {}
	void SendRequestedPaths() override {}
	void StartProcessingMoves(bool) override {}
	void UpdateGrid() override {}
	void GetDebugData(std::uint32_t&, double&, Grid<std::uint8_t>&) const override {}
	void SetAtlasOverlay(bool, pass_class_t = 0) override {}
};

class MockPlayerMgrTerrSov : public ICmpPlayerManager
{
public:
	DEFAULT_MOCK_COMPONENT()

	std::int32_t m_NumPlayers = 3;

	std::int32_t GetNumPlayers() override { return m_NumPlayers; }
	entity_id_t GetPlayerByID(std::int32_t id) override { return id + 1; }
};

class MockTerrInfTerrSov : public ICmpTerritoryInfluence
{
public:
	DEFAULT_MOCK_COMPONENT()

	bool m_Root = true;
	bool m_SovereigntyAware = false;

	bool IsRoot() const override { return m_Root; }
	std::uint16_t GetWeight() const override { return 10; }
	std::uint32_t GetRadius() const override { return m_Radius; }
	bool IsSovereigntyAware() const override { return m_SovereigntyAware; }

	std::uint32_t m_Radius = 0;
};

class MockOwnershipTerrSov : public ICmpOwnership
{
public:
	DEFAULT_MOCK_COMPONENT()

	player_id_t m_Owner = 1;

	player_id_t GetOwner() const override { return m_Owner; }
	void SetOwner(player_id_t owner) override { m_Owner = owner; }
	void SetOwnerQuiet(player_id_t owner) override { m_Owner = owner; }
};

class MockPositionTerrSov : public ICmpPosition
{
public:
	DEFAULT_MOCK_COMPONENT()

	bool m_InWorld = true;
	CFixedVector3D m_Pos;

	bool IsInWorld() const override { return m_InWorld; }
	void MoveOutOfWorld() override { m_InWorld = false; }
	CFixedVector3D GetPosition() const override { return m_Pos; }
	CFixedVector2D GetPosition2D() const override { return CFixedVector2D(m_Pos.X, m_Pos.Z); }
	CMatrix3D GetInterpolatedTransform(float) const override { return CMatrix3D(); }

	void SetTurretParent(entity_id_t, const CFixedVector3D&) override {}
	entity_id_t GetTurretParent() const override { return INVALID_ENTITY; }
	void UpdateTurretPosition() override {}
	std::set<entity_id_t>* GetTurrets() override { return nullptr; }
	void MoveTo(entity_pos_t, entity_pos_t) override {}
	void MoveAndTurnTo(entity_pos_t, entity_pos_t, entity_angle_t) override {}
	void JumpTo(entity_pos_t, entity_pos_t) override {}
	void SetHeightOffset(entity_pos_t) override {}
	entity_pos_t GetHeightOffset() const override { return entity_pos_t::Zero(); }
	void SetHeightFixed(entity_pos_t) override {}
	entity_pos_t GetHeightFixed() const override { return entity_pos_t::Zero(); }
	entity_pos_t GetHeightAtFixed(entity_pos_t, entity_pos_t) const override { return entity_pos_t::Zero(); }
	bool IsHeightRelative() const override { return true; }
	void SetHeightRelative(bool) override {}
	bool CanFloat() const override { return false; }
	void SetFloating(bool) override {}
	void SetActorFloating(bool) override {}
	void SetActorAnchor(const CStr&) override {}
	void SetConstructionProgress(fixed) override {}
	CFixedVector3D GetPreviousPosition() const override { return CFixedVector3D(); }
	CFixedVector2D GetPreviousPosition2D() const override { return CFixedVector2D(); }
	fixed GetTurnRate() const override { return fixed::Zero(); }
	void TurnTo(entity_angle_t) override {}
	void SetYRotation(entity_angle_t) override {}
	void SetXZRotation(entity_angle_t, entity_angle_t) override {}
	CFixedVector3D GetRotation() const override { return CFixedVector3D(); }
	fixed GetDistanceTravelled() const override { return fixed::Zero(); }
	void GetInterpolatedPosition2D(float, float&, float&, float&) const override {}
};

/**
 * Square footprint centred on (m_CentreX, m_CentreZ), matching how
 * CCmpFootprint::GetGridTiles covers tile centres.
 */
class MockFootprintTerrSov : public ICmpFootprint
{
public:
	DEFAULT_MOCK_COMPONENT()

	entity_pos_t m_Size = entity_pos_t::FromInt(20);
	entity_pos_t m_CentreX;
	entity_pos_t m_CentreZ;
	bool m_Enabled = true;

	void GetShape(EShape& shape, entity_pos_t& size0, entity_pos_t& size1, entity_pos_t& height) const override
	{
		shape = SQUARE;
		size0 = m_Size;
		size1 = m_Size;
		height = entity_pos_t::FromInt(4);
	}

	CFixedVector3D PickSpawnPoint(entity_id_t) const override { return CFixedVector3D(); }
	CFixedVector3D PickSpawnPointBothPass(entity_id_t) const override { return CFixedVector3D(); }

	void GetGridTiles(
		const entity_pos_t& tileSize,
		const std::uint16_t tilesW,
		const std::uint16_t tilesH,
		std::vector<std::pair<std::uint16_t, std::uint16_t>>& tiles) const override;
};

/**
 * A sovereignty grid filled directly with owner bytes. This tests the territory
 * interaction without depending on the sovereignty rasterizer.
 */
class ByteSovereigntyManager : public ICmpSovereigntyManager
{
public:
	DEFAULT_MOCK_COMPONENT()

	Grid<std::uint8_t> m_Grid;

	bool NeedUpdateTexture(size_t*) override { return false; }
	const Grid<std::uint8_t>& GetSovereigntyGrid() override { return m_Grid; }
	player_id_t GetOwner(entity_pos_t x, entity_pos_t z) override
	{
		if (m_Grid.width() == 0)
			return INVALID_PLAYER;
		const entity_pos_t scale = Pathfinding::NAVCELL_SIZE * ICmpTerritoryManager::NAVCELLS_PER_TERRITORY_TILE;
		const std::uint16_t i = Clamp((x / scale).ToInt_RoundToNegInfinity(), 0, static_cast<int>(m_Grid.width()) - 1);
		const std::uint16_t j = Clamp((z / scale).ToInt_RoundToNegInfinity(), 0, static_cast<int>(m_Grid.height()) - 1);
		const std::uint8_t owner = m_Grid.get(i, j);
		return owner == 0 ? INVALID_PLAYER : owner;
	}
	bool UpdateBoundaryLines() override { return false; }
};

void MockFootprintTerrSov::GetGridTiles(
	const entity_pos_t& tileSize,
	const std::uint16_t tilesW,
	const std::uint16_t tilesH,
	std::vector<std::pair<std::uint16_t, std::uint16_t>>& tiles) const
{
	tiles.clear();
	if (!m_Enabled)
		return;
	// Every tile whose centre lies inside the square, matching the real component.
	const entity_pos_t half = m_Size / 2;
	for (std::uint16_t i = 0; i < tilesW; ++i)
	{
		const entity_pos_t cx = tileSize * i + tileSize / 2;
		if (cx < m_CentreX - half || cx > m_CentreX + half)
			continue;
		for (std::uint16_t j = 0; j < tilesH; ++j)
		{
			const entity_pos_t cz = tileSize * j + tileSize / 2;
			if (cz >= m_CentreZ - half && cz <= m_CentreZ + half)
				tiles.emplace_back(i, j);
		}
	}
}

class TestTerritorySovereignty : public CxxTest::TestSuite
{
	std::optional<CXeromycesEngine> xeromycesEngine;

	// grid side in territory tiles
	static constexpr std::uint16_t T = 10;

public:
	void setUp()
	{
		CxxTest::setAbortTestOnFail(true);
		g_VFS = CreateVfs();
		TS_ASSERT_OK(g_VFS->Mount(L"", DataDir() / "mods" / "_test.sim" / "", VFS_MOUNT_MUST_EXIST));
		TS_ASSERT_OK(g_VFS->Mount(L"cache", DataDir() / "_testcache" / "", 0, VFS_MAX_PRIORITY));
		xeromycesEngine.emplace();
	}

	void tearDown()
	{
		xeromycesEngine.reset();
		g_VFS.reset();
		DeleteDirectory(DataDir()/"_testcache");
	}

	static entity_pos_t At(int metres)
	{
		return entity_pos_t::FromInt(metres);
	}

	struct Source
	{
		entity_id_t ent;
		std::unique_ptr<MockOwnershipTerrSov> ownership;
		std::unique_ptr<MockTerrInfTerrSov> influence;
		std::unique_ptr<MockPositionTerrSov> position;
	};

	// Adds a territory influence source at (x, z) metres owned by player.
	// The mocks are returned because the component manager does not own them.
	Source AddSource(ComponentTestHelper& test, entity_id_t ent, player_id_t owner, int x, int z,
		std::uint32_t radius, bool sovereigntyAware)
	{
		Source source;
		source.ent = ent;
		source.ownership = std::make_unique<MockOwnershipTerrSov>();
		source.ownership->m_Owner = owner;
		test.AddMock(ent, IID_Ownership, *source.ownership);

		source.position = std::make_unique<MockPositionTerrSov>();
		source.position->m_Pos = CFixedVector3D(At(x), At(1), At(z));
		test.AddMock(ent, IID_Position, *source.position);

		source.influence = std::make_unique<MockTerrInfTerrSov>();
		source.influence->m_Radius = radius * Pathfinding::NAVCELL_SIZE_INT * ICmpTerritoryManager::NAVCELLS_PER_TERRITORY_TILE;
		source.influence->m_SovereigntyAware = sovereigntyAware;
		test.AddMock(ent, IID_TerritoryInfluence, *source.influence);

		return source;
	}

	// Ownership of a single territory tile via the manager interface.
	player_id_t OwnerAt(ComponentTestHelper& test, ICmpTerritoryManager* cmp, int tileI, int tileJ)
	{
		const entity_pos_t scale = Pathfinding::NAVCELL_SIZE * ICmpTerritoryManager::NAVCELLS_PER_TERRITORY_TILE;
		return cmp->GetOwner(scale * tileI + scale / 2, scale * tileJ + scale / 2);
	}

	void BuildPassability(ComponentTestHelper& test, MockPathfinderTerrSov& pathfinder)
	{
		pathfinder.m_PassabilityGrid.resize(
			T * ICmpTerritoryManager::NAVCELLS_PER_TERRITORY_TILE,
			T * ICmpTerritoryManager::NAVCELLS_PER_TERRITORY_TILE);
	}

	void test_domestic_border_clipping()
	{
		ComponentTestHelper test(*g_ScriptContext);

		MockPathfinderTerrSov pathfinder;
		BuildPassability(test, pathfinder);
		test.AddMock(SYSTEM_ENTITY, IID_Pathfinder, pathfinder);

		MockPlayerMgrTerrSov players;
		test.AddMock(SYSTEM_ENTITY, IID_PlayerManager, players);

		// Vertical border: x tiles 0..4 sovereign to 1, tiles 5..9 sovereign to 2.
		ByteSovereigntyManager sovereignty;
		sovereignty.m_Grid.resize(T, T);
		for (std::uint16_t j = 0; j < T; ++j)
			for (std::uint16_t i = 0; i < T; ++i)
				sovereignty.m_Grid.set(i, j, i < 5 ? 1 : 2);
		test.AddMock(SYSTEM_ENTITY, IID_SovereigntyManager, sovereignty);

		ICmpTerritoryManager* cmp = test.Add<ICmpTerritoryManager>(CID_TerritoryManager, "", SYSTEM_ENTITY);

		Source source = AddSource(test, 5, 1, 20, 40, T, true);

		// Player 1 domestic influence fills its own half and never enters player 2's.
		for (std::uint16_t j = 0; j < T; ++j)
			for (std::uint16_t i = 0; i < T; ++i)
			{
				const player_id_t owner = OwnerAt(test, cmp, i, j);
				if (i < 5)
				{
					TS_ASSERT_EQUALS(owner, 1);
				}
				else
				{
					TS_ASSERT_EQUALS(owner, 0);
				}
			}
	}

	void test_symmetric_player2()
	{
		ComponentTestHelper test(*g_ScriptContext);

		MockPathfinderTerrSov pathfinder;
		BuildPassability(test, pathfinder);
		test.AddMock(SYSTEM_ENTITY, IID_Pathfinder, pathfinder);

		MockPlayerMgrTerrSov players;
		test.AddMock(SYSTEM_ENTITY, IID_PlayerManager, players);

		ByteSovereigntyManager sovereignty;
		sovereignty.m_Grid.resize(T, T);
		for (std::uint16_t j = 0; j < T; ++j)
			for (std::uint16_t i = 0; i < T; ++i)
				sovereignty.m_Grid.set(i, j, i < 5 ? 1 : 2);
		test.AddMock(SYSTEM_ENTITY, IID_SovereigntyManager, sovereignty);

		ICmpTerritoryManager* cmp = test.Add<ICmpTerritoryManager>(CID_TerritoryManager, "", SYSTEM_ENTITY);

		Source source = AddSource(test, 5, 2, 60, 40, T, true);

		for (std::uint16_t j = 0; j < T; ++j)
			for (std::uint16_t i = 0; i < T; ++i)
			{
				const player_id_t owner = OwnerAt(test, cmp, i, j);
				if (i >= 5)
				{
					TS_ASSERT_EQUALS(owner, 2);
				}
				else
				{
					TS_ASSERT_EQUALS(owner, 0);
				}
			}
	}

	void test_unrestricted_legacy_unchanged()
	{
		ComponentTestHelper test(*g_ScriptContext);

		MockPathfinderTerrSov pathfinder;
		BuildPassability(test, pathfinder);
		test.AddMock(SYSTEM_ENTITY, IID_Pathfinder, pathfinder);

		MockPlayerMgrTerrSov players;
		test.AddMock(SYSTEM_ENTITY, IID_PlayerManager, players);

		ByteSovereigntyManager sovereignty;
		sovereignty.m_Grid.resize(T, T);
		for (std::uint16_t j = 0; j < T; ++j)
			for (std::uint16_t i = 0; i < T; ++i)
				sovereignty.m_Grid.set(i, j, i < 5 ? 1 : 2);
		test.AddMock(SYSTEM_ENTITY, IID_SovereigntyManager, sovereignty);

		ICmpTerritoryManager* cmp = test.Add<ICmpTerritoryManager>(CID_TerritoryManager, "", SYSTEM_ENTITY);

		// Unrestricted influence ignores sovereignty entirely.
		Source source = AddSource(test, 5, 1, 40, 40, T, false);

		for (std::uint16_t j = 0; j < T; ++j)
			for (std::uint16_t i = 0; i < T; ++i)
				TS_ASSERT_EQUALS(OwnerAt(test, cmp, i, j), 1);
	}

	void test_map_without_sovereignty()
	{
		ComponentTestHelper test(*g_ScriptContext);

		MockPathfinderTerrSov pathfinder;
		BuildPassability(test, pathfinder);
		test.AddMock(SYSTEM_ENTITY, IID_Pathfinder, pathfinder);

		MockPlayerMgrTerrSov players;
		test.AddMock(SYSTEM_ENTITY, IID_PlayerManager, players);

		// No sovereignty mock at all: an OwnSovereignty source behaves unrestricted.
		ICmpTerritoryManager* cmp = test.Add<ICmpTerritoryManager>(CID_TerritoryManager, "", SYSTEM_ENTITY);

		Source source = AddSource(test, 5, 1, 40, 40, T, true);

		for (std::uint16_t j = 0; j < T; ++j)
			for (std::uint16_t i = 0; i < T; ++i)
				TS_ASSERT_EQUALS(OwnerAt(test, cmp, i, j), 1);
	}

	void test_foreign_administration_control()
	{
		ComponentTestHelper test(*g_ScriptContext);

		MockPathfinderTerrSov pathfinder;
		BuildPassability(test, pathfinder);
		test.AddMock(SYSTEM_ENTITY, IID_Pathfinder, pathfinder);

		MockPlayerMgrTerrSov players;
		test.AddMock(SYSTEM_ENTITY, IID_PlayerManager, players);

		ByteSovereigntyManager sovereignty;
		sovereignty.m_Grid.resize(T, T);
		for (std::uint16_t j = 0; j < T; ++j)
			for (std::uint16_t i = 0; i < T; ++i)
				sovereignty.m_Grid.set(i, j, i < 5 ? 1 : 2);
		test.AddMock(SYSTEM_ENTITY, IID_SovereigntyManager, sovereignty);

		ICmpTerritoryManager* cmp = test.Add<ICmpTerritoryManager>(CID_TerritoryManager, "", SYSTEM_ENTITY);

		// A player 2 source standing inside player 1 sovereignty, unrestricted:
		// the foreign administration model. It controls player 1 sovereign cells.
		Source source = AddSource(test, 5, 2, 20, 40, T, false);

		for (std::uint16_t j = 0; j < T; ++j)
			for (std::uint16_t i = 0; i < T; ++i)
				TS_ASSERT_EQUALS(OwnerAt(test, cmp, i, j), 2);

		// Sovereignty remains player 1 west of the border.
		TS_ASSERT_EQUALS(sovereignty.GetOwner(At(20), At(40)), 1);
	}

	void test_blocked_source_claims_nothing()
	{
		ComponentTestHelper test(*g_ScriptContext);

		MockPathfinderTerrSov pathfinder;
		BuildPassability(test, pathfinder);
		test.AddMock(SYSTEM_ENTITY, IID_Pathfinder, pathfinder);

		MockPlayerMgrTerrSov players;
		test.AddMock(SYSTEM_ENTITY, IID_PlayerManager, players);

		ByteSovereigntyManager sovereignty;
		sovereignty.m_Grid.resize(T, T);
		for (std::uint16_t j = 0; j < T; ++j)
			for (std::uint16_t i = 0; i < T; ++i)
				sovereignty.m_Grid.set(i, j, i < 5 ? 1 : 2);
		test.AddMock(SYSTEM_ENTITY, IID_SovereigntyManager, sovereignty);

		ICmpTerritoryManager* cmp = test.Add<ICmpTerritoryManager>(CID_TerritoryManager, "", SYSTEM_ENTITY);

		// A sovereignty-aware player 1 source standing entirely inside player 2 land.
		Source source = AddSource(test, 5, 1, 80, 40, T, true);

		for (std::uint16_t j = 0; j < T; ++j)
			for (std::uint16_t i = 0; i < T; ++i)
				TS_ASSERT_EQUALS(OwnerAt(test, cmp, i, j), 0);
	}

	void test_unclaimed_not_claimed_by_aware_sources()
	{
		ComponentTestHelper test(*g_ScriptContext);

		MockPathfinderTerrSov pathfinder;
		BuildPassability(test, pathfinder);
		test.AddMock(SYSTEM_ENTITY, IID_Pathfinder, pathfinder);

		MockPlayerMgrTerrSov players;
		test.AddMock(SYSTEM_ENTITY, IID_PlayerManager, players);

		// Everything unclaimed except the source's own tile.
		ByteSovereigntyManager sovereignty;
		sovereignty.m_Grid.resize(T, T);
		for (std::uint16_t j = 0; j < T; ++j)
			for (std::uint16_t i = 0; i < T; ++i)
				sovereignty.m_Grid.set(i, j, 0);
		sovereignty.m_Grid.set(4, 4, 1);
		test.AddMock(SYSTEM_ENTITY, IID_SovereigntyManager, sovereignty);

		ICmpTerritoryManager* cmp = test.Add<ICmpTerritoryManager>(CID_TerritoryManager, "", SYSTEM_ENTITY);

		// Source at the centre tile (4, 4) = (36, 36) metres.
		Source source = AddSource(test, 5, 1, 36, 36, T, true);

		// Only its own sovereign tile is claimed; the unclaimed hinterland is not filled.
		TS_ASSERT_EQUALS(OwnerAt(test, cmp, 4, 4), 1);
		for (std::uint16_t j = 0; j < T; ++j)
			for (std::uint16_t i = 0; i < T; ++i)
				if (i != 4 || j != 4)
					TS_ASSERT_EQUALS(OwnerAt(test, cmp, i, j), 0);
	}

	void test_no_jumping_through_foreign_land()
	{
		ComponentTestHelper test(*g_ScriptContext);

		MockPathfinderTerrSov pathfinder;
		BuildPassability(test, pathfinder);
		test.AddMock(SYSTEM_ENTITY, IID_Pathfinder, pathfinder);

		MockPlayerMgrTerrSov players;
		test.AddMock(SYSTEM_ENTITY, IID_PlayerManager, players);

		// Columns: 0-2 player 1, 3-6 player 2, 7-9 player 1.
		ByteSovereigntyManager sovereignty;
		sovereignty.m_Grid.resize(T, T);
		for (std::uint16_t j = 0; j < T; ++j)
			for (std::uint16_t i = 0; i < T; ++i)
				sovereignty.m_Grid.set(i, j, i <= 2 || i >= 7 ? 1 : 2);
		test.AddMock(SYSTEM_ENTITY, IID_SovereigntyManager, sovereignty);

		ICmpTerritoryManager* cmp = test.Add<ICmpTerritoryManager>(CID_TerritoryManager, "", SYSTEM_ENTITY);

		// Source in the first (western) enclave.
		Source source = AddSource(test, 5, 1, 12, 40, T, true);

		for (std::uint16_t j = 0; j < T; ++j)
			for (std::uint16_t i = 0; i < T; ++i)
			{
				const player_id_t owner = OwnerAt(test, cmp, i, j);
				if (i <= 2)
				{
					TS_ASSERT_EQUALS(owner, 1);
				}
				else
				{
					TS_ASSERT_EQUALS(owner, 0);
				}
			}
	}

	void test_competing_domestic_sources_no_gap()
	{
		ComponentTestHelper test(*g_ScriptContext);

		MockPathfinderTerrSov pathfinder;
		BuildPassability(test, pathfinder);
		test.AddMock(SYSTEM_ENTITY, IID_Pathfinder, pathfinder);

		MockPlayerMgrTerrSov players;
		test.AddMock(SYSTEM_ENTITY, IID_PlayerManager, players);

		ByteSovereigntyManager sovereignty;
		sovereignty.m_Grid.resize(T, T);
		for (std::uint16_t j = 0; j < T; ++j)
			for (std::uint16_t i = 0; i < T; ++i)
				sovereignty.m_Grid.set(i, j, i < 5 ? 1 : 2);
		test.AddMock(SYSTEM_ENTITY, IID_SovereigntyManager, sovereignty);

		ICmpTerritoryManager* cmp = test.Add<ICmpTerritoryManager>(CID_TerritoryManager, "", SYSTEM_ENTITY);

		// Both sources sit one tile from the border, on their own sides.
		Source sourceWest = AddSource(test, 5, 1, 36, 40, T, true);
		Source sourceEast = AddSource(test, 6, 2, 44, 40, T, true);

		// Every sovereign cell is controlled by its sovereign; no neutral gap.
		for (std::uint16_t j = 0; j < T; ++j)
			for (std::uint16_t i = 0; i < T; ++i)
				TS_ASSERT_EQUALS(OwnerAt(test, cmp, i, j), i < 5 ? 1 : 2);
	}

	void test_third_state_transit()
	{
		ComponentTestHelper test(*g_ScriptContext);

		MockPathfinderTerrSov pathfinder;
		BuildPassability(test, pathfinder);
		test.AddMock(SYSTEM_ENTITY, IID_Pathfinder, pathfinder);

		MockPlayerMgrTerrSov players;
		players.m_NumPlayers = 5;
		test.AddMock(SYSTEM_ENTITY, IID_PlayerManager, players);

		// Columns: 0-2 player 1, 3-6 player 4 (transit), 7-9 player 2.
		ByteSovereigntyManager sovereignty;
		sovereignty.m_Grid.resize(T, T);
		for (std::uint16_t j = 0; j < T; ++j)
			for (std::uint16_t i = 0; i < T; ++i)
				sovereignty.m_Grid.set(i, j, i <= 2 ? 1 : (i <= 6 ? 4 : 2));
		test.AddMock(SYSTEM_ENTITY, IID_SovereigntyManager, sovereignty);

		ICmpTerritoryManager* cmp = test.Add<ICmpTerritoryManager>(CID_TerritoryManager, "", SYSTEM_ENTITY);

		Source sourceWest = AddSource(test, 5, 1, 12, 40, T, true);
		Source sourceEast = AddSource(test, 6, 2, 76, 40, T, true);

		for (std::uint16_t j = 0; j < T; ++j)
			for (std::uint16_t i = 0; i < T; ++i)
			{
				const player_id_t expected = i <= 2 ? 1 : (i <= 6 ? 0 : 2);
				TS_ASSERT_EQUALS(OwnerAt(test, cmp, i, j), expected);
			}
	}

	void test_footprint_respects_sovereignty()
	{
		ComponentTestHelper test(*g_ScriptContext);

		MockPathfinderTerrSov pathfinder;
		BuildPassability(test, pathfinder);
		test.AddMock(SYSTEM_ENTITY, IID_Pathfinder, pathfinder);

		MockPlayerMgrTerrSov players;
		test.AddMock(SYSTEM_ENTITY, IID_PlayerManager, players);

		ByteSovereigntyManager sovereignty;
		sovereignty.m_Grid.resize(T, T);
		for (std::uint16_t j = 0; j < T; ++j)
			for (std::uint16_t i = 0; i < T; ++i)
				sovereignty.m_Grid.set(i, j, i < 5 ? 1 : 2);
		test.AddMock(SYSTEM_ENTITY, IID_SovereigntyManager, sovereignty);

		ICmpTerritoryManager* cmp = test.Add<ICmpTerritoryManager>(CID_TerritoryManager, "", SYSTEM_ENTITY);

		// Player 1 building at the border with a footprint spanning it.
		MockOwnershipTerrSov ownership;
		ownership.m_Owner = 1;
		test.AddMock(5, IID_Ownership, ownership);

		MockPositionTerrSov position;
		position.m_Pos = CFixedVector3D(At(36), At(1), At(40));
		test.AddMock(5, IID_Position, position);
		MockTerrInfTerrSov influence;
		influence.m_Radius = T * Pathfinding::NAVCELL_SIZE_INT * ICmpTerritoryManager::NAVCELLS_PER_TERRITORY_TILE;
		influence.m_SovereigntyAware = true;
		test.AddMock(5, IID_TerritoryInfluence, influence);

		MockFootprintTerrSov footprint;
		footprint.m_Size = entity_pos_t::FromInt(32); // spans tiles 2..6 in x
		footprint.m_CentreX = At(36);
		footprint.m_CentreZ = At(40);
		test.AddMock(5, IID_Footprint, footprint);

		// Footprint tiles east of the border stay player 2-free (unclaimed by this source).
		for (std::uint16_t j = 4; j <= 5; ++j)
		{
			for (std::uint16_t i = 2; i <= 4; ++i)
				TS_ASSERT_EQUALS(OwnerAt(test, cmp, i, j), 1);
			for (std::uint16_t i = 5; i <= 6; ++i)
				TS_ASSERT_EQUALS(OwnerAt(test, cmp, i, j), 0);
		}

		// An unrestricted footprint claims across the border (upstream behavior).
		ComponentTestHelper test2(*g_ScriptContext);
		MockPathfinderTerrSov pathfinder2;
		BuildPassability(test2, pathfinder2);
		test2.AddMock(SYSTEM_ENTITY, IID_Pathfinder, pathfinder2);
		MockPlayerMgrTerrSov players2;
		test2.AddMock(SYSTEM_ENTITY, IID_PlayerManager, players2);
		ByteSovereigntyManager sovereignty2;
		sovereignty2.m_Grid.resize(T, T);
		for (std::uint16_t j = 0; j < T; ++j)
			for (std::uint16_t i = 0; i < T; ++i)
				sovereignty2.m_Grid.set(i, j, i < 5 ? 1 : 2);
		test2.AddMock(SYSTEM_ENTITY, IID_SovereigntyManager, sovereignty2);
		ICmpTerritoryManager* cmp2 = test2.Add<ICmpTerritoryManager>(CID_TerritoryManager, "", SYSTEM_ENTITY);

		MockOwnershipTerrSov ownership2;
		ownership2.m_Owner = 1;
		test2.AddMock(5, IID_Ownership, ownership2);
		MockPositionTerrSov position2;
		position2.m_Pos = CFixedVector3D(At(36), At(1), At(40));
		test2.AddMock(5, IID_Position, position2);
		MockTerrInfTerrSov influence2;
		influence2.m_Radius = T * Pathfinding::NAVCELL_SIZE_INT * ICmpTerritoryManager::NAVCELLS_PER_TERRITORY_TILE;
		influence2.m_SovereigntyAware = false;
		test2.AddMock(5, IID_TerritoryInfluence, influence2);
		MockFootprintTerrSov footprint2;
		footprint2.m_Size = entity_pos_t::FromInt(32);
		footprint2.m_CentreX = At(36);
		footprint2.m_CentreZ = At(40);
		test2.AddMock(5, IID_Footprint, footprint2);

		for (std::uint16_t j = 4; j <= 5; ++j)
			for (std::uint16_t i = 2; i <= 6; ++i)
				TS_ASSERT_EQUALS(OwnerAt(test2, cmp2, i, j), 1);
	}

	void test_food_crisis_geometry()
	{
		ComponentTestHelper test(*g_ScriptContext);

		MockPathfinderTerrSov pathfinder;
		// Real food-crisis size: 1536 metres = 192 sovereignty/territory tiles
		// = 192 * 8 navcells = 1536 navcells per side.
		pathfinder.m_PassabilityGrid.resize(
			192 * ICmpTerritoryManager::NAVCELLS_PER_TERRITORY_TILE,
			192 * ICmpTerritoryManager::NAVCELLS_PER_TERRITORY_TILE);
		test.AddMock(SYSTEM_ENTITY, IID_Pathfinder, pathfinder);

		MockPlayerMgrTerrSov players;
		test.AddMock(SYSTEM_ENTITY, IID_PlayerManager, players);

		// Rasterize the authored food-crisis polygons approximately: border near x=1020-1080.
		// Use the same even-odd center test as the sovereignty manager via a direct fill:
		// cells are 8m; the Densira-Adomé frontier wiggles between x=980 and x=1080.
		ByteSovereigntyManager sovereignty;
		sovereignty.m_Grid.resize(192, 192);
		for (std::uint16_t j = 0; j < 192; ++j)
		{
			// frontier x in metres as in the authored polygon, by row band
			double frontier;
			const double z = j * 8.0 + 4.0;
			if (z < 400) frontier = 980.0 + (1020.0 - 980.0) * (z / 400.0);
			else if (z < 800) frontier = 1060.0 + (990.0 - 1060.0) * ((z - 400.0) / 400.0);
			else if (z < 1200) frontier = 990.0 + (1080.0 - 990.0) * ((z - 800.0) / 400.0);
			else frontier = 1080.0;
			for (std::uint16_t i = 0; i < 192; ++i)
			{
				const double x = i * 8.0 + 4.0;
				sovereignty.m_Grid.set(i, j, x < frontier ? 1 : 2);
			}
		}
		test.AddMock(SYSTEM_ENTITY, IID_SovereigntyManager, sovereignty);

		ICmpTerritoryManager* cmp = test.Add<ICmpTerritoryManager>(CID_TerritoryManager, "", SYSTEM_ENTITY);

		// The real northern district office at (800, 252), radius 72m.
		Source source = AddSource(test, 5, 1, 800, 252, 72 / 8, true);

		// Territory must stay west of the frontier in every row the influence reaches.
		const entity_pos_t scale = Pathfinding::NAVCELL_SIZE * ICmpTerritoryManager::NAVCELLS_PER_TERRITORY_TILE;
		for (std::uint16_t j = 0; j < 192; ++j)
		{
			for (std::uint16_t i = 0; i < 192; ++i)
			{
				const double x = i * 8.0 + 4.0;
				double frontier;
				const double z = j * 8.0 + 4.0;
				if (z < 400) frontier = 980.0 + (1020.0 - 980.0) * (z / 400.0);
				else if (z < 800) frontier = 1060.0 + (990.0 - 1060.0) * ((z - 400.0) / 400.0);
				else if (z < 1200) frontier = 990.0 + (1080.0 - 990.0) * ((z - 800.0) / 400.0);
				else frontier = 1080.0;
				const bool sovereignTwo = x >= frontier;
				const player_id_t owner = cmp->GetOwner(scale * i + scale / 2, scale * j + scale / 2);
				if (sovereignTwo)
				{
					// No Densiran administrative cell may exist east of the frontier.
					TS_ASSERT_EQUALS(owner, 0);
				}
				else if (std::fabs(z - 252.0) < 32.0 && std::fabs(x - 800.0) < 64.0)
				{
					// Near the office itself, on Densiran soil, control exists.
					TS_ASSERT_EQUALS(owner, 1);
				}
			}
		}
		(void)scale;
	}
};
