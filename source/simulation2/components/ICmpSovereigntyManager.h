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

#ifndef INCLUDED_ICMPSOVEREIGNTYMANAGER
#define INCLUDED_ICMPSOVEREIGNTYMANAGER

#include "simulation2/helpers/Player.h"
#include "simulation2/helpers/Position.h"
#include "simulation2/system/Component.h"
#include "simulation2/system/Interface.h"

#include <cstddef>
#include <cstdint>

template<typename T> class Grid;

/**
 * Legal national geography. This is not TerritoryManager.
 * The grid stores a plain owner byte: 0 is unclaimed land, 1..31 is a sovereign player.
 * GetOwner maps byte 0 to INVALID_PLAYER. TerritoryManager::GetOwner maps its 0 to "neutral".
 */
class ICmpSovereigntyManager : public IComponent
{
public:
	/**
	 * Returns whether a future sovereignty texture needs to be updated.
	 * Step A has no texture. The counter still advances when the grid is replaced.
	 */
	virtual bool NeedUpdateTexture(size_t* dirtyID) = 0;

	/**
	 * Authoritative ownership bytes. 0 is unclaimed. Not exposed to scripts.
	 */
	virtual const Grid<std::uint8_t>& GetSovereigntyGrid() = 0;

	/**
	 * Sovereign of the territory cell containing (x, z).
	 * @return player id, or INVALID_PLAYER when the cell byte is 0 or the grid is not built.
	 */
	virtual player_id_t GetOwner(entity_pos_t x, entity_pos_t z) = 0;

	DECLARE_INTERFACE_TYPE(SovereigntyManager)
};

#endif // INCLUDED_ICMPSOVEREIGNTYMANAGER
