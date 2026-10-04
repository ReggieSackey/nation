Engine.RegisterInterface("PopulationFoodConsumption");

/**
 * Broadcast when ConsumeFood has stored the latest interval for every player.
 * The message carries no politics. Listeners read GetFoodStatus themselves.
 */
Engine.RegisterMessageType("FoodConsumptionCompleted");
