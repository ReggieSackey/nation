Engine.RegisterInterface("SovereignEntryClassifier");

/**
 * Message of the form
 * { "entity", "entityOwner", "from", "to", "authorized" }
 * sent when a unit enters land sovereign to a player.
 * from and to are sovereign owners of the land.
 * entityOwner is the unit's owner.
 * authorized is entry permission only. It does not declare war.
 */
Engine.RegisterMessageType("SovereignEntryClassified");
