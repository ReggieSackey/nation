Engine.RegisterInterface("ForeignMilitaryPresence");

/**
 * Message of the form { "foreignPlayer": number, "hostPlayer": number }
 * sent when the first unit owned by foreignPlayer is inside land sovereign to hostPlayer.
 */
Engine.RegisterMessageType("ForeignMilitaryPresenceStarted");

/**
 * Message of the form { "foreignPlayer": number, "hostPlayer": number }
 * sent when the last such unit leaves or is destroyed.
 */
Engine.RegisterMessageType("ForeignMilitaryPresenceEnded");
