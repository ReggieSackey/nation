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

#include "graphics/Terrain.h"
#include "maths/Fixed.h"
#include "maths/FixedVector3D.h"
#include "maths/Vector3D.h"
#include "ps/CLogger.h"
#include "ps/XML/Xeromyces.h"
#include "scriptinterface/Interface.h"
#include "scriptinterface/Object.h"
#include "simulation2/MessageTypes.h"
#include "simulation2/components/ICmpPlayerManager.h"
#include "simulation2/components/ICmpSovereigntyManager.h"
#include "simulation2/components/ICmpTerrain.h"
#include "simulation2/helpers/Grid.h"
#include "simulation2/helpers/Player.h"
#include "simulation2/serialization/StdDeserializer.h"
#include "simulation2/serialization/StdSerializer.h"
#include "simulation2/system/Component.h"
#include "simulation2/system/ComponentTest.h"

#include <cstdint>
#include <sstream>
#include <string>

class MockSovereigntyPlayerManager : public ICmpPlayerManager
{
public:
	DEFAULT_MOCK_COMPONENT()

	std::int32_t GetNumPlayers() override { return 3; }
	entity_id_t GetPlayerByID(std::int32_t id) override { return id + 1; }
};

class SizedSovereigntyTerrain : public ICmpTerrain
{
public:
	DEFAULT_MOCK_COMPONENT()

	std::uint16_t m_Tiles = 16;

	bool IsLoaded() const override { return m_Tiles != 0; }
	CFixedVector3D CalcNormal(entity_pos_t, entity_pos_t) const override
	{
		return CFixedVector3D(fixed::FromInt(0), fixed::FromInt(1), fixed::FromInt(0));
	}
	CVector3D CalcExactNormal(float, float) const override { return CVector3D(0.f, 1.f, 0.f); }
	entity_pos_t GetGroundLevel(entity_pos_t, entity_pos_t) const override { return entity_pos_t::FromInt(50); }
	float GetExactGroundLevel(float, float) const override { return 50.f; }
	std::uint16_t GetTilesPerSide() const override { return m_Tiles; }
	std::uint32_t GetMapSize() const override { return static_cast<std::uint32_t>(m_Tiles) * TERRAIN_TILE_SIZE; }
	std::uint16_t GetVerticesPerSide() const override { return static_cast<std::uint16_t>(m_Tiles + 1); }
	CTerrain* GetCTerrain() override { return nullptr; }
	void MakeDirty(std::int32_t, std::int32_t, std::int32_t, std::int32_t) override {}
	void ReloadTerrain(bool) override {}
};

class TestCmpSovereigntyManager : public CxxTest::TestSuite
{
	SizedSovereigntyTerrain m_Terrain;
	MockSovereigntyPlayerManager m_Players;

	void SetRegions(ComponentTestHelper& test, const std::string& regionsJs)
	{
		const Script::Interface& script = test.GetScriptInterface();
		Script::Request rq(script);
		JS::RootedValue value(rq.cx);
		const std::string code = "({ settings: { Sovereignty: " + regionsJs + " } })";
		TS_ASSERT(script.Eval(code, &value));
		JS::RootedValue global(rq.cx, rq.globalValue());
		TS_ASSERT(Script::SetProperty(rq, global, "InitAttributes", value));
	}

	ICmpSovereigntyManager* Add(ComponentTestHelper& test)
	{
		test.AddMock(SYSTEM_ENTITY, IID_Terrain, m_Terrain);
		test.AddMock(SYSTEM_ENTITY, IID_PlayerManager, m_Players);
		return test.Add<ICmpSovereigntyManager>(CID_SovereigntyManager, "", SYSTEM_ENTITY);
	}

	static entity_pos_t At(int metres)
	{
		return entity_pos_t::FromInt(metres);
	}

public:
	void setUp()
	{
		m_Terrain.m_Tiles = 16;
	}

	void test_rectangles_unclaimed_and_cell_quantization()
	{
		CXeromycesEngine xeromycesEngine;
		ComponentTestHelper test(*g_ScriptContext);
		ICmpSovereigntyManager* cmp = Add(test);

		TS_ASSERT_EQUALS(cmp->GetOwner(At(4), At(4)), INVALID_PLAYER);
		TS_ASSERT_EQUALS(cmp->GetSovereigntyGrid().width(), 0);

		// 16 terrain tiles is 64 metres and 8 sovereignty cells.
		// Player 1 owns x,z in [0, 32]. Player 2 owns x in [32, 48], z in [0, 32].
		SetRegions(test,
			"["
			"{owner:1,points:[{x:0,z:0},{x:32,z:0},{x:32,z:32},{x:0,z:32}]},"
			"{owner:2,points:[{x:32,z:0},{x:48,z:0},{x:48,z:32},{x:32,z:32}]}"
			"]");

		TS_ASSERT_EQUALS(cmp->GetSovereigntyGrid().width(), 8);
		TS_ASSERT_EQUALS(cmp->GetSovereigntyGrid().height(), 8);

		// Cell 0 center (4, 4) is inside player 1. Any point in that 8m cell agrees.
		TS_ASSERT_EQUALS(cmp->GetOwner(At(0), At(0)), 1);
		TS_ASSERT_EQUALS(cmp->GetOwner(At(4), At(4)), 1);
		TS_ASSERT_EQUALS(cmp->GetOwner(At(7), At(7)), 1);
		TS_ASSERT_EQUALS(cmp->GetSovereigntyGrid().get(0, 0), 1);

		// Cell 3 center is (28, 4), still inside the player 1 rectangle.
		TS_ASSERT_EQUALS(cmp->GetOwner(At(24), At(4)), 1);
		TS_ASSERT_EQUALS(cmp->GetOwner(At(31), At(4)), 1);
		TS_ASSERT_EQUALS(cmp->GetSovereigntyGrid().get(3, 0), 1);

		// Cell 4 center is (36, 4), inside player 2.
		TS_ASSERT_EQUALS(cmp->GetOwner(At(32), At(4)), 2);
		TS_ASSERT_EQUALS(cmp->GetOwner(At(36), At(12)), 2);
		TS_ASSERT_EQUALS(cmp->GetSovereigntyGrid().get(4, 0), 2);

		// Cell 7 center is (60, 4), outside both rectangles.
		TS_ASSERT_EQUALS(cmp->GetOwner(At(60), At(4)), INVALID_PLAYER);
		TS_ASSERT_EQUALS(cmp->GetSovereigntyGrid().get(7, 0), 0);
		TS_ASSERT_EQUALS(cmp->GetOwner(At(4), At(60)), INVALID_PLAYER);
		TS_ASSERT_EQUALS(cmp->GetSovereigntyGrid().get(0, 7), 0);
	}

	void test_overlap_and_shared_edge_use_the_cell_center()
	{
		CXeromycesEngine xeromycesEngine;
		ComponentTestHelper test(*g_ScriptContext);
		ICmpSovereigntyManager* cmp = Add(test);

		// Shared edge x = 20. Cell 2 covers x in [16, 24) and its center is exactly 20.
		// The center lies on player 1's edge, so the earlier region wins.
		// x = 23 is inside only player 2's polygon, but it is still cell 2.
		SetRegions(test,
			"["
			"{owner:1,points:[{x:0,z:0},{x:20,z:0},{x:20,z:32},{x:0,z:32}]},"
			"{owner:2,points:[{x:20,z:0},{x:48,z:0},{x:48,z:32},{x:20,z:32}]}"
			"]");

		TS_ASSERT_EQUALS(cmp->GetOwner(At(16), At(4)), 1);
		TS_ASSERT_EQUALS(cmp->GetOwner(At(20), At(4)), 1);
		TS_ASSERT_EQUALS(cmp->GetOwner(At(23), At(4)), 1);
		TS_ASSERT_EQUALS(cmp->GetSovereigntyGrid().get(2, 0), 1);

		// Cell 3 center (28, 4) is inside only player 2.
		TS_ASSERT_EQUALS(cmp->GetOwner(At(28), At(4)), 2);
		TS_ASSERT_EQUALS(cmp->GetSovereigntyGrid().get(3, 0), 2);
	}

	void test_overlap_first_region_wins()
	{
		CXeromycesEngine xeromycesEngine;
		ComponentTestHelper test(*g_ScriptContext);
		ICmpSovereigntyManager* cmp = Add(test);
		SetRegions(test,
			"["
			"{owner:1,points:[{x:0,z:0},{x:40,z:0},{x:40,z:32},{x:0,z:32}]},"
			"{owner:2,points:[{x:16,z:0},{x:56,z:0},{x:56,z:32},{x:16,z:32}]}"
			"]");

		TS_ASSERT_EQUALS(cmp->GetOwner(At(20), At(4)), 1);
		TS_ASSERT_EQUALS(cmp->GetSovereigntyGrid().get(2, 0), 1);
		TS_ASSERT_EQUALS(cmp->GetOwner(At(44), At(4)), 2);
		TS_ASSERT_EQUALS(cmp->GetSovereigntyGrid().get(5, 0), 2);
	}

	void test_invalid_region_set_paints_nothing()
	{
		CXeromycesEngine xeromycesEngine;
		const char* cases[] = {
			"[{owner:0,points:[{x:0,z:0},{x:32,z:0},{x:0,z:32}]}]",
			"[{owner:32,points:[{x:0,z:0},{x:32,z:0},{x:0,z:32}]}]",
			"[{owner:1,points:[{x:0,z:0},{x:32,z:0}]}]",
			"[{owner:1,points:[{x:NaN,z:0},{x:32,z:0},{x:0,z:32}]}]",
			"["
			"{owner:1,points:[{x:0,z:0},{x:32,z:0},{x:32,z:32},{x:0,z:32}]},"
			"{owner:0,points:[{x:0,z:0},{x:8,z:0},{x:0,z:8}]}"
			"]",
			"{owner:1}"
		};

		for (const char* regions : cases)
		{
			ComponentTestHelper test(*g_ScriptContext);
			ICmpSovereigntyManager* cmp = Add(test);
			TestLogger logger;
			SetRegions(test, regions);
			TS_ASSERT_EQUALS(cmp->GetSovereigntyGrid().width(), 8);
			for (std::uint16_t j = 0; j < 8; ++j)
				for (std::uint16_t i = 0; i < 8; ++i)
					TS_ASSERT_EQUALS(cmp->GetSovereigntyGrid().get(i, j), 0);
			TS_ASSERT_EQUALS(cmp->GetOwner(At(4), At(4)), INVALID_PLAYER);
			(void)logger;
		}
	}

	void test_serialization_rebuilds_the_same_owners()
	{
		CXeromycesEngine xeromycesEngine;
		ComponentTestHelper test(*g_ScriptContext);
		ICmpSovereigntyManager* cmp = Add(test);
		SetRegions(test,
			"[{owner:1,points:[{x:0,z:0},{x:32,z:0},{x:32,z:32},{x:0,z:32}]}]");
		TS_ASSERT_EQUALS(cmp->GetOwner(At(4), At(4)), 1);
		TS_ASSERT_EQUALS(cmp->GetOwner(At(40), At(4)), INVALID_PLAYER);

		std::stringstream stream;
		CStdSerializer serializer(test.GetScriptInterface(), stream);
		cmp->Serialize(serializer);

		ComponentTestHelper restored(*g_ScriptContext);
		SizedSovereigntyTerrain terrain;
		terrain.m_Tiles = 16;
		MockSovereigntyPlayerManager players;
		restored.AddMock(SYSTEM_ENTITY, IID_Terrain, terrain);
		restored.AddMock(SYSTEM_ENTITY, IID_PlayerManager, players);
		ICmpSovereigntyManager* cmp2 = restored.Add<ICmpSovereigntyManager>(CID_SovereigntyManager, "", SYSTEM_ENTITY);

		CStdDeserializer deserializer(restored.GetScriptInterface(), stream);
		CParamNode param;
		cmp2->Deserialize(param, deserializer);
		TS_ASSERT_EQUALS(stream.peek(), EOF);

		TS_ASSERT_EQUALS(cmp2->GetOwner(At(4), At(4)), 1);
		TS_ASSERT_EQUALS(cmp2->GetOwner(At(28), At(28)), 1);
		TS_ASSERT_EQUALS(cmp2->GetOwner(At(40), At(4)), INVALID_PLAYER);
		TS_ASSERT_EQUALS(cmp2->GetSovereigntyGrid().get(0, 0), 1);
		TS_ASSERT_EQUALS(cmp2->GetSovereigntyGrid().get(5, 0), 0);
		TS_ASSERT_EQUALS(cmp2->GetSovereigntyGrid().width(), 8);
	}

	void test_map_resize_rebuilds_from_the_same_regions()
	{
		CXeromycesEngine xeromycesEngine;
		ComponentTestHelper test(*g_ScriptContext);
		ICmpSovereigntyManager* cmp = Add(test);
		SetRegions(test,
			"[{owner:1,points:[{x:0,z:0},{x:32,z:0},{x:32,z:32},{x:0,z:32}]}]");
		TS_ASSERT_EQUALS(cmp->GetSovereigntyGrid().width(), 8);

		size_t dirty = 0;
		TS_ASSERT(cmp->NeedUpdateTexture(&dirty));
		TS_ASSERT_EQUALS(dirty, 1);
		TS_ASSERT(!cmp->NeedUpdateTexture(&dirty));

		CMessageTerrainChanged sameSize(0, 0, 16, 16);
		cmp->GetSimContext().GetComponentManager().BroadcastMessage(sameSize);
		TS_ASSERT(!cmp->NeedUpdateTexture(&dirty));
		TS_ASSERT_EQUALS(cmp->GetSovereigntyGrid().width(), 8);

		m_Terrain.m_Tiles = 32;
		CMessageTerrainChanged resized(0, 0, 32, 32);
		cmp->GetSimContext().GetComponentManager().BroadcastMessage(resized);
		TS_ASSERT(cmp->NeedUpdateTexture(&dirty));
		TS_ASSERT_EQUALS(dirty, 2);
		TS_ASSERT_EQUALS(cmp->GetSovereigntyGrid().width(), 16);
		TS_ASSERT_EQUALS(cmp->GetSovereigntyGrid().height(), 16);
		TS_ASSERT_EQUALS(cmp->GetOwner(At(4), At(4)), 1);
		TS_ASSERT_EQUALS(cmp->GetOwner(At(100), At(4)), INVALID_PLAYER);
		TS_ASSERT_EQUALS(cmp->GetSovereigntyGrid().get(12, 0), 0);
	}

	void test_food_crisis_interiors_and_extent_beyond_the_rings()
	{
		CXeromycesEngine xeromycesEngine;
		ComponentTestHelper test(*g_ScriptContext);
		// The authored rings are the food-crisis polygons. On the real 1536m map
		// (384 terrain tiles, 192 sovereignty cells) those two rings cover every cell.
		// This test uses 400 tiles, 1600m, so a cell can sit outside the polygons.
		// Cell (192, 0), center (1540, 4), is that synthetic extension.
		// It is not an unclaimed cell of the 1536m scenario.
		m_Terrain.m_Tiles = 400;
		ICmpSovereigntyManager* cmp = Add(test);
		SetRegions(test,
			"["
			"{owner:1,points:["
			"{x:0,z:0},{x:1020,z:0},{x:980,z:400},{x:1060,z:800},"
			"{x:990,z:1200},{x:1080,z:1536},{x:0,z:1536}]},"
			"{owner:2,points:["
			"{x:1020,z:0},{x:1536,z:0},{x:1536,z:1536},{x:1080,z:1536},"
			"{x:990,z:1200},{x:1060,z:800},{x:980,z:400}]}"
			"]");

		// Real-map interior. Esika (520, 800) is cell (65, 100), center (524, 804): Densira.
		TS_ASSERT_EQUALS(cmp->GetOwner(At(520), At(800)), 1);
		TS_ASSERT_EQUALS(cmp->GetOwner(At(524), At(804)), 1);
		TS_ASSERT_EQUALS(cmp->GetSovereigntyGrid().get(65, 100), 1);

		// Real-map interior. Avémé (1312, 820) is cell (164, 102), center (1316, 820): Adomé.
		TS_ASSERT_EQUALS(cmp->GetOwner(At(1312), At(820)), 2);
		TS_ASSERT_EQUALS(cmp->GetOwner(At(1316), At(820)), 2);
		TS_ASSERT_EQUALS(cmp->GetSovereigntyGrid().get(164, 102), 2);

		// Outside the authored rings only because this grid is larger than the scenario.
		TS_ASSERT_EQUALS(cmp->GetOwner(At(1540), At(4)), INVALID_PLAYER);
		TS_ASSERT_EQUALS(cmp->GetSovereigntyGrid().get(192, 0), 0);
	}
};
