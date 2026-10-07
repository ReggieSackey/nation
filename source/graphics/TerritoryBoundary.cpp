/* Copyright (C) 2025 Wildfire Games.
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

#include "TerritoryBoundary.h"

#include "lib/debug.h"
#include "maths/Fixed.h"
#include "simulation2/components/ICmpTerritoryManager.h"
#include "simulation2/helpers/Grid.h"
#include "simulation2/helpers/Pathfinding.h"

#include <algorithm>
#include <cmath>
#include <set>
#include <tuple>
#include <utility>

namespace
{

struct SegmentKey
{
	int x0;
	int y0;
	int x1;
	int y1;

	bool operator<(const SegmentKey& rhs) const
	{
		return std::tie(x0, y0, x1, y1) < std::tie(rhs.x0, rhs.y0, rhs.x1, rhs.y1);
	}
};

int Quantise(float value)
{
	return static_cast<int>(std::lround(value));
}

SegmentKey Undirected(const CVector2D& a, const CVector2D& b)
{
	SegmentKey key{Quantise(a.X), Quantise(a.Y), Quantise(b.X), Quantise(b.Y)};
	if (std::tie(key.x1, key.y1) < std::tie(key.x0, key.y0))
	{
		std::swap(key.x0, key.x1);
		std::swap(key.y0, key.y1);
	}
	return key;
}

/**
 * The walker traces each owned region, including the outer map perimeter, because a
 * region that touches j=0 has to start somewhere. Sovereignty does not want that
 * perimeter as a decorative rectangle. Segments with both ends on the map edge are
 * dropped. A segment with one end on the edge is kept, so a shared border still
 * meets the map. Each undirected segment is emitted once.
 */
std::vector<STerritoryBoundary> OmitMapEdge(std::vector<STerritoryBoundary> loops, float mapW, float mapH)
{
	const float eps = 0.01f;
	auto onPerimeter = [&](const CVector2D& point)
	{
		return point.X <= eps || point.Y <= eps || point.X >= mapW - eps || point.Y >= mapH - eps;
	};

	std::vector<STerritoryBoundary> result;
	// The opposite loop of a shared border is not an identical point list: each side
	// keeps its own corner where the border meets the map. Dedup the edge itself.
	std::set<SegmentKey> seen;
	std::set<std::pair<int, int>> usedVertices;

	auto vertexKey = [](const CVector2D& point)
	{
		return std::make_pair(Quantise(point.X), Quantise(point.Y));
	};

	for (const STerritoryBoundary& loop : loops)
	{
		const std::vector<CVector2D>& points = loop.points;
		const size_t count = points.size();
		if (count < 2)
			continue;

		std::vector<char> drop(count, 0);
		bool anyDrop = false;
		bool anyKeep = false;
		for (size_t i = 0; i < count; ++i)
		{
			const CVector2D& start = points[i];
			const CVector2D& end = points[(i + 1) % count];
			const bool startEdge = onPerimeter(start);
			const bool endEdge = onPerimeter(end);
			bool dropped = startEdge && endEdge;
			if (!dropped && seen.count(Undirected(start, end)) != 0)
				dropped = true;
			// The other side's corner stub meets this border at an already drawn vertex.
			if (!dropped && startEdge != endEdge)
			{
				const CVector2D& interior = startEdge ? end : start;
				if (usedVertices.count(vertexKey(interior)) != 0)
					dropped = true;
			}
			drop[i] = dropped ? 1 : 0;
			anyDrop = anyDrop || dropped;
			anyKeep = anyKeep || !dropped;
		}
		if (!anyKeep)
			continue;

		auto emit = [&](const std::vector<CVector2D>& chain, bool closed)
		{
			if (chain.size() < 2)
				return;

			const size_t segments = closed ? chain.size() : chain.size() - 1;
			for (size_t i = 0; i < segments; ++i)
			{
				const CVector2D& start = chain[i];
				const CVector2D& end = chain[(i + 1) % chain.size()];
				seen.insert(Undirected(start, end));
				usedVertices.insert(vertexKey(start));
				usedVertices.insert(vertexKey(end));
			}

			STerritoryBoundary boundary;
			boundary.blinking = loop.blinking;
			boundary.closed = closed;
			boundary.owner = loop.owner;
			boundary.points = chain;
			result.push_back(std::move(boundary));
		};

		if (!anyDrop)
		{
			emit(points, true);
			continue;
		}

		size_t begin = 0;
		while (begin < count && !drop[begin])
			++begin;

		size_t index = (begin + 1) % count;
		size_t walked = 0;
		while (walked < count)
		{
			while (walked < count && drop[index])
			{
				index = (index + 1) % count;
				++walked;
			}
			if (walked >= count)
				break;

			std::vector<CVector2D> chain;
			chain.push_back(points[index]);
			while (walked < count && !drop[index])
			{
				const size_t next = (index + 1) % count;
				chain.push_back(points[next]);
				index = next;
				++walked;
			}
			emit(chain, false);
		}
	}

	return result;
}

} // namespace

SBoundaryClassifier CTerritoryBoundaryCalculator::TerritoryClassifier()
{
	SBoundaryClassifier classifier;
	classifier.discriminatorMask = static_cast<std::uint8_t>(
		ICmpTerritoryManager::TERRITORY_BLINKING_MASK | ICmpTerritoryManager::TERRITORY_PLAYER_MASK);
	classifier.processedMask = static_cast<std::uint8_t>(ICmpTerritoryManager::TERRITORY_PROCESSED_MASK);
	classifier.ownerMask = static_cast<std::uint8_t>(ICmpTerritoryManager::TERRITORY_PLAYER_MASK);
	classifier.blinkingMask = static_cast<std::uint8_t>(ICmpTerritoryManager::TERRITORY_BLINKING_MASK);
	classifier.omitMapEdge = false;
	return classifier;
}

SBoundaryClassifier CTerritoryBoundaryCalculator::SovereigntyClassifier()
{
	SBoundaryClassifier classifier;
	// Owner byte only. Processed is a scratch bit on the copied grid, not ownership.
	classifier.discriminatorMask = static_cast<std::uint8_t>(ICmpTerritoryManager::TERRITORY_PLAYER_MASK);
	classifier.processedMask = static_cast<std::uint8_t>(ICmpTerritoryManager::TERRITORY_PROCESSED_MASK);
	classifier.ownerMask = static_cast<std::uint8_t>(ICmpTerritoryManager::TERRITORY_PLAYER_MASK);
	classifier.blinkingMask = 0;
	classifier.omitMapEdge = true;
	return classifier;
}

std::vector<STerritoryBoundary> CTerritoryBoundaryCalculator::ComputeBoundaries(const Grid<std::uint8_t>* territories)
{
	return ComputeBoundaries(territories, TerritoryClassifier());
}

std::vector<STerritoryBoundary> CTerritoryBoundaryCalculator::ComputeBoundaries(
	const Grid<std::uint8_t>* territory, const SBoundaryClassifier& classifier)
{
	std::vector<STerritoryBoundary> boundaries;

	// Copy the territories grid so we can mess with it
	Grid<std::uint8_t> grid(*territory);

	// Some constants for the border walk
	CVector2D edgeOffsets[] = {
		CVector2D(0.5f, 0.0f),
		CVector2D(1.0f, 0.5f),
		CVector2D(0.5f, 1.0f),
		CVector2D(0.0f, 0.5f)
	};

	// syntactic sugar
	const std::uint8_t TILE_BOTTOM = 0;
	const std::uint8_t TILE_RIGHT = 1;
	const std::uint8_t TILE_TOP = 2;
	const std::uint8_t TILE_LEFT = 3;

	const int CURVE_CW = -1;
	const int CURVE_CCW = 1;

	// === Find territory boundaries ===
	//
	// The territory boundaries delineate areas of tiles that belong to the same player, and that all have the same
	// connected-to-a-root-influence-entity status (see also STerritoryBoundary for a more wordy definition). Note that the grid
	// values contain bit-packed information (i.e. not just the owning player ID), so we must be careful to only compare grid
	// values using the player ID and connected flag bits. The joint mask to select these is referred to as the discriminator mask.
	//
	// The idea is to scan the (i,j)-grid going up row by row and look for tiles that have a different territory assignment from
	// the one right underneath it (or, if it's a tile on the first row, they need only have a territory assignment). These tiles
	// are necessarily edge tiles of a territory, and hence a territory boundary must pass through their bottom edge. Therefore,
	// we start tracing the outline of the territory starting from said bottom edge, and go CCW around the territory boundary.
	// Tracing continues until the starting point is reached, at which point the boundary is complete.
	//
	// While tracing a boundary, every tile in which the boundary passes through the bottom edge are marked as 'processed', so that
	// we know not to start a new run from these tiles when scanning continues (when the boundary is complete). This information
	// is maintained in the grid values themselves by means of the 'processed' bit mask (stressing the importance of using the
	// discriminator mask to compare only player ID and connected flag).
	//
	// Thus, we can identify the following conditions for starting a trace from a tile (i,j). Let g(i,j) indicate the
	// discriminator grid value at position (i,j); then the conditions are:
	//     - g(i,j) != 0; the tile must not be neutral
	//     - j=0 or g(i,j) != g(i,j-1);  the tile directly underneath it must have a different owner and/or connected flag
	//     - the tile must not already be marked as 'processed'
	//
	// Additionally, there is one more point to be made; the algorithm initially assumes it's tracing CCW around the territory.
	// If it's tracing an inner edge, however, this will actually cause it to trace in the CW direction (because inner edges curve
	// 'backwards' compared to the outer edges when starting the trace in the same direction). This turns out to actually be
	// exactly what the renderer needs to render two territory boundaries on the same edge back-to-back (instead of overlapping
	// each other).
	//
	// In either case, we keep track of the way the outline curves while we're tracing to determine whether we're going CW or CCW.
	// If at some point we ever need to revert the winding order or external code needs to know about it explicitly, then we can
	// do this by looking at a curvature value which we define to start at 0, and which is incremented by 1 for every CCW turn and
	// decremented by 1 for every CW turn. Hence, a negative multiple of 4 means a CW winding order, and a positive one means CCW.

	// Territory passes blinking|player. That mask does not include the connected bit.
	const std::uint8_t discrMask = classifier.discriminatorMask;
	const std::uint8_t processedMask = classifier.processedMask;
	const float territoryTileSize = (Pathfinding::NAVCELL_SIZE * ICmpTerritoryManager::NAVCELLS_PER_TERRITORY_TILE).ToFloat();

	// Try to find an assigned tile
	for (std::uint16_t j = 0; j < grid.m_H; ++j)
	{
		for (std::uint16_t i = 0; i < grid.m_W; ++i)
		{
			// saved tile state; from MSB to LSB:
			// processed bit, blinking bit, player ID
			std::uint8_t tileState = grid.get(i, j);
			std::uint8_t tileDiscr = (tileState & discrMask);

			// ignore neutral tiles (note that tiles without an owner should never have the blinking bit set)
			if (!tileDiscr)
				continue;

			bool tileProcessed = ((tileState & processedMask) != 0);
			bool tileEligible = (j == 0 || tileDiscr != (grid.get(i, j-1) & discrMask));

			if (tileProcessed || !tileEligible)
				continue;

			// Found the first tile (which must be the lowest j value of any non-zero tile);
			// start at the bottom edge of it and chase anticlockwise around the border until
			// we reach the starting point again

			int curvature = 0; // +1 for every CCW 90 degree turn, -1 for every CW 90 degree turn; must be multiple of 4 at the end

			boundaries.push_back(STerritoryBoundary());
			boundaries.back().owner = (tileState & classifier.ownerMask);
			boundaries.back().blinking = classifier.blinkingMask != 0 && (tileState & classifier.blinkingMask) != 0;
			boundaries.back().closed = true;
			std::vector<CVector2D>& points = boundaries.back().points;

			std::uint8_t dir = TILE_BOTTOM;

			std::uint8_t cdir = dir;
			std::uint16_t ci = i, cj = j;

			std::uint16_t maxi = static_cast<std::uint16_t>(grid.m_W - 1);
			std::uint16_t maxj = static_cast<std::uint16_t>(grid.m_H - 1);

			while (true)
			{
				points.push_back((CVector2D(ci, cj) + edgeOffsets[cdir]) * territoryTileSize);

				// Given that we're on an edge on a continuous boundary and aiming anticlockwise,
				// we can either carry on straight or turn left or turn right, so examine each
				// of the three possible cases (depending on initial direction):
				switch (cdir)
				{
				case TILE_BOTTOM:

					// mark tile as processed so we don't start a new run from it after this one is complete
					ENSURE(!(grid.get(ci, cj) & processedMask));
					grid.set(ci, cj, grid.get(ci, cj) | processedMask);

					if (ci < maxi && cj > 0 && (grid.get(ci+1, cj-1) & discrMask) == tileDiscr)
					{
						++ci;
						--cj;
						cdir = TILE_LEFT;
						curvature += CURVE_CW;
					}
					else if (ci < maxi && (grid.get(ci+1, cj) & discrMask) == tileDiscr)
						++ci;
					else
					{
						cdir = TILE_RIGHT;
						curvature += CURVE_CCW;
					}
					break;

				case TILE_RIGHT:
					if (ci < maxi && cj < maxj && (grid.get(ci+1, cj+1) & discrMask) == tileDiscr)
					{
						++ci;
						++cj;
						cdir = TILE_BOTTOM;
						curvature += CURVE_CW;
					}
					else if (cj < maxj && (grid.get(ci, cj+1) & discrMask) == tileDiscr)
						++cj;
					else
					{
						cdir = TILE_TOP;
						curvature += CURVE_CCW;
					}
					break;

				case TILE_TOP:
					if (ci > 0 && cj < maxj && (grid.get(ci-1, cj+1) & discrMask) == tileDiscr)
					{
						--ci;
						++cj;
						cdir = TILE_RIGHT;
						curvature += CURVE_CW;
					}
					else if (ci > 0 && (grid.get(ci-1, cj) & discrMask) == tileDiscr)
						--ci;
					else
					{
						cdir = TILE_LEFT;
						curvature += CURVE_CCW;
					}
					break;

				case TILE_LEFT:
					if (ci > 0 && cj > 0 && (grid.get(ci-1, cj-1) & discrMask) == tileDiscr)
					{
						--ci;
						--cj;
						cdir = TILE_TOP;
						curvature += CURVE_CW;
					}
					else if (cj > 0 && (grid.get(ci, cj-1) & discrMask) == tileDiscr)
						--cj;
					else
					{
						cdir = TILE_BOTTOM;
						curvature += CURVE_CCW;
					}
					break;
				}

				// Stop when we've reached the starting point again
				if (ci == i && cj == j && cdir == dir)
					break;
			}

			ENSURE(curvature != 0 && abs(curvature) % 4 == 0);
		}
	}

	if (!classifier.omitMapEdge)
		return boundaries;

	return OmitMapEdge(std::move(boundaries), grid.m_W * territoryTileSize, grid.m_H * territoryTileSize);
}
