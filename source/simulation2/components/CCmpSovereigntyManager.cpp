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

#include "precompiled.h"

#include "ICmpSovereigntyManager.h"

#include "graphics/Color.h"
#include "graphics/Overlay.h"
#include "graphics/TerritoryBoundary.h"
#include "graphics/Texture.h"
#include "graphics/TextureManager.h"
#include "maths/MathUtil.h"
#include "ps/CLogger.h"
#include "renderer/Renderer.h"
#include "renderer/Scene.h"
#include "scriptinterface/Object.h"
#include "simulation2/MessageTypes.h"
#include "simulation2/components/ICmpPlayerManager.h"
#include "simulation2/components/ICmpTerrain.h"
#include "simulation2/components/ICmpTerritoryManager.h"
#include "simulation2/helpers/Grid.h"
#include "simulation2/helpers/Pathfinding.h"
#include "simulation2/helpers/Render.h"
#include "simulation2/system/Component.h"

#include <cmath>
#include <cstdint>
#include <limits>
#include <string>
#include <utility>
#include <vector>

namespace
{

// Same 5-bit player field territory uses, so the two grids stay comparable.
constexpr int MAX_SOVEREIGN_PLAYER = ICmpTerritoryManager::TERRITORY_PLAYER_MASK;

// Territory control borders are 0.75m and player-colored. A national border is one
// shared line, drawn as thicker neutral ink on the cell edge.
constexpr float SOVEREIGNTY_BORDER_THICKNESS = 3.0f;
const CColor SOVEREIGNTY_BORDER_COLOR(0.10f, 0.08f, 0.06f, 0.95f);

struct SRegion
{
	player_id_t owner;
	std::vector<std::pair<double, double>> points;
};

/**
 * Same cell index as CCmpTerritoryManager.cpp NearestTerritoryTile.
 * Not extracted from that file: this step does not edit territory behavior.
 */
void NearestSovereigntyCell(entity_pos_t x, entity_pos_t z, std::uint16_t& i, std::uint16_t& j,
	std::uint16_t w, std::uint16_t h)
{
	const entity_pos_t scale = Pathfinding::NAVCELL_SIZE * ICmpTerritoryManager::NAVCELLS_PER_TERRITORY_TILE;
	i = static_cast<std::uint16_t>(Clamp((x / scale).ToInt_RoundToNegInfinity(), 0, w - 1));
	j = static_cast<std::uint16_t>(Clamp((z / scale).ToInt_RoundToNegInfinity(), 0, h - 1));
}

bool PointOnSegment(double x, double z, double ax, double az, double bx, double bz)
{
	const double cross = (z - az) * (bx - ax) - (x - ax) * (bz - az);
	if (cross != 0.0)
		return false;

	const double dot = (x - ax) * (bx - ax) + (z - az) * (bz - az);
	if (dot < 0.0)
		return false;

	const double lengthSquared = (bx - ax) * (bx - ax) + (bz - az) * (bz - az);
	return dot <= lengthSquared;
}

/**
 * Even-odd ray cast along +x. A point on a segment is inside.
 * This is the Nation Sovereignty.js test, evaluated only while rasterizing.
 */
bool PointInPolygon(double x, double z, const std::vector<std::pair<double, double>>& points)
{
	const size_t count = points.size();
	for (size_t i = 0, j = count - 1; i < count; j = i++)
		if (PointOnSegment(x, z, points[j].first, points[j].second, points[i].first, points[i].second))
			return true;

	bool inside = false;
	for (size_t i = 0, j = count - 1; i < count; j = i++)
	{
		const double xi = points[i].first;
		const double zi = points[i].second;
		const double xj = points[j].first;
		const double zj = points[j].second;
		const bool crossesZ = (zi > z) != (zj > z);
		if (crossesZ && x < (xj - xi) * (z - zi) / (zj - zi) + xi)
			inside = !inside;
	}
	return inside;
}

bool ReadFinite(const Script::Request& rq, JS::HandleValue obj, const char* name, double& out)
{
	JS::RootedValue value(rq.cx);
	if (!Script::GetProperty(rq, obj, name, &value) || !value.isNumber())
		return false;

	const double number = value.toNumber();
	if (!std::isfinite(number))
		return false;

	out = number;
	return true;
}

} // namespace

class CCmpSovereigntyManager final : public ICmpSovereigntyManager
{
public:
	static void ClassInit(CComponentManager& componentManager)
	{
		componentManager.SubscribeToMessageType(MT_TerrainChanged);
		componentManager.SubscribeToMessageType(MT_Interpolate);
		componentManager.SubscribeToMessageType(MT_RenderSubmit);
	}

	DEFAULT_COMPONENT_ALLOCATOR(SovereigntyManager)

	static std::string GetSchema()
	{
		return "<a:component type='system'/><empty/>";
	}

	void Init(const CParamNode&) override
	{
		m_Regions.clear();
		m_Grid.resize(0, 0);
		m_DirtyID = 0;
		m_AuthoringLoaded = false;
		m_BoundaryGeometry.clear();
		m_BoundaryLines.clear();
		m_RenderedDirtyID = std::numeric_limits<size_t>::max();
		m_BoundaryForce = true;
		m_OverlaysReady = false;
	}

	void Deinit() override
	{
	}

	void Serialize(ISerializer& serialize) override
	{
		serialize.NumberU32_Unbounded("region count", static_cast<std::uint32_t>(m_Regions.size()));
		for (const SRegion& region : m_Regions)
		{
			serialize.NumberI32("owner", region.owner, 1, MAX_SOVEREIGN_PLAYER);
			serialize.NumberU32_Unbounded("point count", static_cast<std::uint32_t>(region.points.size()));
			for (const std::pair<double, double>& point : region.points)
			{
				serialize.NumberDouble_Unbounded("x", point.first);
				serialize.NumberDouble_Unbounded("z", point.second);
			}
		}
		serialize.NumberU32_Unbounded("dirty", static_cast<std::uint32_t>(m_DirtyID));
	}

	void Deserialize(const CParamNode& paramNode, IDeserializer& deserialize) override
	{
		Init(paramNode);

		std::uint32_t regionCount = 0;
		deserialize.NumberU32_Unbounded("region count", regionCount);
		m_Regions.resize(regionCount);
		for (SRegion& region : m_Regions)
		{
			deserialize.NumberI32("owner", region.owner, 1, MAX_SOVEREIGN_PLAYER);
			std::uint32_t pointCount = 0;
			deserialize.NumberU32_Unbounded("point count", pointCount);
			region.points.resize(pointCount);
			for (std::pair<double, double>& point : region.points)
			{
				deserialize.NumberDouble_Unbounded("x", point.first);
				deserialize.NumberDouble_Unbounded("z", point.second);
			}
		}

		std::uint32_t dirty = 0;
		deserialize.NumberU32_Unbounded("dirty", dirty);
		m_DirtyID = dirty;
		// The grid is derived. Do not read it back from the archive.
		m_AuthoringLoaded = true;
		RebuildGrid(false);
	}

	void HandleMessage(const CMessage& msg, bool /*global*/) override
	{
		switch (msg.GetType())
		{
		case MT_TerrainChanged:
			// A same-size edit does not move the legal border. Overlay Y is cached
			// when the line is built, so the lines still need another pass.
			m_BoundaryForce = true;
			RebuildGrid(true);
			break;
		case MT_Interpolate:
			UpdateBoundaryLines();
			break;
		case MT_RenderSubmit:
		{
			const CMessageRenderSubmit& msgData = static_cast<const CMessageRenderSubmit&>(msg);
			RenderSubmit(msgData.collector, msgData.frustum, msgData.culling);
			break;
		}
		}
	}

	bool NeedUpdateTexture(size_t* dirtyID) override
	{
		if (*dirtyID == m_DirtyID)
			return false;

		*dirtyID = m_DirtyID;
		return true;
	}

	const Grid<std::uint8_t>& GetSovereigntyGrid() override
	{
		EnsureGrid();
		return m_Grid;
	}

	player_id_t GetOwner(entity_pos_t x, entity_pos_t z) override
	{
		EnsureGrid();
		if (m_Grid.width() == 0 || m_Grid.height() == 0)
			return INVALID_PLAYER;

		std::uint16_t i = 0;
		std::uint16_t j = 0;
		NearestSovereigntyCell(x, z, i, j, m_Grid.width(), m_Grid.height());
		const std::uint8_t owner = m_Grid.get(i, j);
		// Byte 0 is unclaimed land. It is not Gaia and not territory-neutral.
		return owner == 0 ? INVALID_PLAYER : static_cast<player_id_t>(owner);
	}

	bool UpdateBoundaryLines() override
	{
		EnsureGrid();

		const bool geometryStale = m_BoundaryForce || m_RenderedDirtyID != m_DirtyID;
		if (!geometryStale && m_OverlaysReady)
			return false;

		if (geometryStale)
		{
			m_BoundaryForce = false;
			m_RenderedDirtyID = m_DirtyID;
			m_BoundaryLines.clear();
			m_OverlaysReady = false;
			m_BoundaryGeometry.clear();
			if (m_Grid.width() != 0 && m_Grid.height() != 0)
			{
				m_BoundaryGeometry = CTerritoryBoundaryCalculator::ComputeBoundaries(
					&m_Grid, CTerritoryBoundaryCalculator::SovereigntyClassifier());
			}
		}

		if (!CRenderer::IsInitialised())
			return geometryStale;

		BuildOverlays();
		m_OverlaysReady = true;
		return geometryStale;
	}

private:
	std::vector<SRegion> m_Regions;
	Grid<std::uint8_t> m_Grid;
	size_t m_DirtyID = 0;
	bool m_AuthoringLoaded = false;

	// Render state. Not serialized, and not per-player knowledge.
	std::vector<STerritoryBoundary> m_BoundaryGeometry;
	std::vector<SOverlayTexturedLine> m_BoundaryLines;
	size_t m_RenderedDirtyID = std::numeric_limits<size_t>::max();
	bool m_BoundaryForce = true;
	bool m_OverlaysReady = false;

	void BuildOverlays()
	{
		m_BoundaryLines.clear();

		CTextureProperties texturePropsBase("art/textures/misc/territory_border.png");
		texturePropsBase.SetAddressMode(
			Renderer::Backend::Sampler::AddressMode::CLAMP_TO_BORDER,
			Renderer::Backend::Sampler::AddressMode::CLAMP_TO_EDGE);
		texturePropsBase.SetAnisotropicFilter(true);
		CTexturePtr textureBase = g_Renderer.GetTextureManager().CreateTexture(texturePropsBase);

		CTextureProperties texturePropsMask("art/textures/misc/territory_border_mask.png");
		texturePropsMask.SetAddressMode(
			Renderer::Backend::Sampler::AddressMode::CLAMP_TO_BORDER,
			Renderer::Backend::Sampler::AddressMode::CLAMP_TO_EDGE);
		texturePropsMask.SetAnisotropicFilter(true);
		CTexturePtr textureMask = g_Renderer.GetTextureManager().CreateTexture(texturePropsMask);

		m_BoundaryLines.reserve(m_BoundaryGeometry.size());
		for (const STerritoryBoundary& boundary : m_BoundaryGeometry)
		{
			if (boundary.points.size() < 2)
				continue;

			m_BoundaryLines.emplace_back();
			SOverlayTexturedLine& overlay = m_BoundaryLines.back();
			overlay.m_SimContext = &GetSimContext();
			overlay.m_TextureBase = textureBase;
			overlay.m_TextureMask = textureMask;
			overlay.m_Color = SOVEREIGNTY_BORDER_COLOR;
			overlay.m_Thickness = SOVEREIGNTY_BORDER_THICKNESS;
			overlay.m_Closed = boundary.closed;
			// Always visible for this prototype. Knowledge of a national border is not LOS.
			overlay.m_AlwaysVisible = true;

			std::vector<CVector2D> points = boundary.points;
			SimRender::SmoothPointsAverage(points, overlay.m_Closed);
			SimRender::InterpolatePointsRNS(points, overlay.m_Closed, 0.0f);
			overlay.m_Coords = std::move(points);
		}
	}

	void RenderSubmit(SceneCollector& collector, const CFrustum& frustum, bool culling)
	{
		for (SOverlayTexturedLine& line : m_BoundaryLines)
		{
			if (culling && !line.IsVisibleInFrustum(frustum))
				continue;
			collector.Submit(&line);
		}
	}

	/**
	 * The grid is a cache of the polygons, filled on query.
	 * This matches TerritoryManager::GetOwner, which calculates when asked.
	 * InitAttributes is not a message, and InitGame is registered from script
	 * after ClassInit, so there is no native subscription for it.
	 */
	void EnsureGrid()
	{
		if (!m_AuthoringLoaded)
			LoadAuthoring();
		RebuildGrid(true);
	}

	void LoadAuthoring()
	{
		if (m_AuthoringLoaded)
			return;

		Script::Request rq(GetSimContext().GetScriptInterface());
		JS::RootedValue initAttributes(rq.cx);
		if (!Script::Interface::GetGlobalProperty(rq, "InitAttributes", &initAttributes) ||
			!initAttributes.isObject())
			return;

		JS::RootedValue sovereignty(rq.cx);
		JS::RootedValue settings(rq.cx);
		if (Script::HasProperty(rq, initAttributes, "settings") &&
			Script::GetProperty(rq, initAttributes, "settings", &settings) &&
			settings.isObject() &&
			Script::HasProperty(rq, settings, "Sovereignty"))
		{
			if (!Script::GetProperty(rq, settings, "Sovereignty", &sovereignty))
				return;
		}

		std::string error;
		std::vector<SRegion> regions;
		if (!ParseRegions(rq, sovereignty, regions, error))
		{
			LOGERROR("%s", error.c_str());
			m_Regions.clear();
		}
		else
			m_Regions = std::move(regions);

		m_AuthoringLoaded = true;
		RebuildGrid(true);
	}

	bool ParseRegions(const Script::Request& rq, JS::HandleValue sovereignty, std::vector<SRegion>& regions, std::string& error) const
	{
		regions.clear();
		if (sovereignty.isUndefined() || sovereignty.isNull())
			return true;

		bool isArray = false;
		if (!sovereignty.isObject())
		{
			error = "Sovereignty: expected an array of regions";
			return false;
		}

		JS::RootedObject array(rq.cx, &sovereignty.toObject());
		if (!JS::IsArrayObject(rq.cx, array, &isArray) || !isArray)
		{
			error = "Sovereignty: expected an array of regions";
			return false;
		}

		std::uint32_t length = 0;
		if (!JS::GetArrayLength(rq.cx, array, &length))
		{
			error = "Sovereignty: expected an array of regions";
			return false;
		}

		CmpPtr<ICmpPlayerManager> cmpPlayerManager(GetSystemEntity());
		const std::int32_t numPlayers = cmpPlayerManager ? cmpPlayerManager->GetNumPlayers() : -1;

		for (std::uint32_t i = 0; i < length; ++i)
		{
			JS::RootedValue regionValue(rq.cx);
			if (!Script::GetPropertyInt(rq, sovereignty, static_cast<int>(i), &regionValue) || !regionValue.isObject())
			{
				error = "Sovereignty: region " + std::to_string(i) + " needs an integer owner from 1 to " + std::to_string(MAX_SOVEREIGN_PLAYER);
				return false;
			}

			JS::RootedValue ownerValue(rq.cx);
			if (!Script::GetProperty(rq, regionValue, "owner", &ownerValue) || !ownerValue.isNumber())
			{
				error = "Sovereignty: region " + std::to_string(i) + " needs an integer owner from 1 to " + std::to_string(MAX_SOVEREIGN_PLAYER);
				return false;
			}

			const double ownerNumber = ownerValue.toNumber();
			if (!std::isfinite(ownerNumber) || ownerNumber != std::trunc(ownerNumber))
			{
				error = "Sovereignty: region " + std::to_string(i) + " needs an integer owner from 1 to " + std::to_string(MAX_SOVEREIGN_PLAYER);
				return false;
			}

			const int owner = static_cast<int>(ownerNumber);
			if (owner < 1 || owner > MAX_SOVEREIGN_PLAYER || (numPlayers >= 0 && owner >= numPlayers))
			{
				error = "Sovereignty: region " + std::to_string(i) + " owner " + std::to_string(owner) + " is not a sovereign player";
				return false;
			}

			JS::RootedValue pointsValue(rq.cx);
			bool pointsAreArray = false;
			if (!Script::GetProperty(rq, regionValue, "points", &pointsValue) || !pointsValue.isObject())
			{
				error = "Sovereignty: region " + std::to_string(i) + " needs at least 3 points";
				return false;
			}

			JS::RootedObject pointsObject(rq.cx, &pointsValue.toObject());
			if (!JS::IsArrayObject(rq.cx, pointsObject, &pointsAreArray) || !pointsAreArray)
			{
				error = "Sovereignty: region " + std::to_string(i) + " needs at least 3 points";
				return false;
			}

			std::uint32_t pointCount = 0;
			if (!JS::GetArrayLength(rq.cx, pointsObject, &pointCount) || pointCount < 3)
			{
				error = "Sovereignty: region " + std::to_string(i) + " needs at least 3 points";
				return false;
			}

			SRegion region;
			region.owner = owner;
			region.points.reserve(pointCount);
			for (std::uint32_t p = 0; p < pointCount; ++p)
			{
				JS::RootedValue pointValue(rq.cx);
				double x = 0.0;
				double z = 0.0;
				if (!Script::GetPropertyInt(rq, pointsValue, static_cast<int>(p), &pointValue) ||
					!pointValue.isObject() ||
					!ReadFinite(rq, pointValue, "x", x) ||
					!ReadFinite(rq, pointValue, "z", z))
				{
					error = "Sovereignty: region " + std::to_string(i) + " point " + std::to_string(p) + " needs numeric x and z";
					return false;
				}
				region.points.emplace_back(x, z);
			}
			regions.push_back(std::move(region));
		}
		return true;
	}

	std::uint16_t CellsPerSide() const
	{
		CmpPtr<ICmpTerrain> cmpTerrain(GetSystemEntity());
		if (!cmpTerrain)
			return 0;

		const std::uint32_t cellMetres = static_cast<std::uint32_t>(ICmpTerritoryManager::NAVCELLS_PER_TERRITORY_TILE) *
			static_cast<std::uint32_t>(Pathfinding::NAVCELL_SIZE_INT);
		const std::uint32_t metres = cmpTerrain->GetMapSize();
		if (cellMetres == 0 || metres / cellMetres > 65535)
			return 0;

		return static_cast<std::uint16_t>(metres / cellMetres);
	}

	void RebuildGrid(bool bumpDirty)
	{
		if (!m_AuthoringLoaded)
			return;

		const std::uint16_t cells = CellsPerSide();
		if (cells == 0)
			return;

		if (m_Grid.width() == cells && m_Grid.height() == cells)
			return;

		Rasterize(cells);
		if (bumpDirty)
			++m_DirtyID;
	}

	void Rasterize(std::uint16_t cells)
	{
		m_Grid.resize(cells, cells);

		const double cell = static_cast<double>(ICmpTerritoryManager::NAVCELLS_PER_TERRITORY_TILE *
			Pathfinding::NAVCELL_SIZE_INT);
		for (std::uint16_t j = 0; j < cells; ++j)
		{
			for (std::uint16_t i = 0; i < cells; ++i)
			{
				const double x = i * cell + cell / 2.0;
				const double z = j * cell + cell / 2.0;
				for (const SRegion& region : m_Regions)
				{
					if (!PointInPolygon(x, z, region.points))
						continue;

					m_Grid.set(i, j, static_cast<std::uint8_t>(region.owner));
					break;
				}
			}
		}
	}
};

REGISTER_COMPONENT_TYPE(SovereigntyManager)
