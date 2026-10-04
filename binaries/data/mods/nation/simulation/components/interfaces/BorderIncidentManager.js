Engine.RegisterInterface("BorderIncidentManager");

/**
 * Message of the form { "offender": number, "defender": number, "entity": number }
 * sent when an unauthorized foreign entry opens a directional border incident.
 * Later entries by the same offender into the same state update that incident
 * and do not send this message again. This is not a declaration of war.
 */
Engine.RegisterMessageType("BorderIncidentStarted");
