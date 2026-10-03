Engine.RegisterInterface("SovereignBorderTracker");

/**
 * Message of the form { "entity": number, "from": number, "to": number }
 * sent when a mobile unit's sovereign location changes.
 * from and to are sovereign owners of the land, not the entity's owner.
 */
Engine.RegisterMessageType("SovereignBorderCrossed");
