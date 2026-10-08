function PublicService() {}

PublicService.prototype.Schema =
	"<element name='Type'><choice><value>education</value><value>healthcare</value><value>electricity</value></choice></element>" +
	"<element name='Radius'><data type='positiveInteger'/></element>" +
	"<element name='Level'><data type='positiveInteger'/></element>";

PublicService.prototype.GetService = function()
{
	return {
		"type": this.template.Type,
		"radius": +this.template.Radius,
		"level": +this.template.Level
	};
};

Engine.RegisterComponentType(IID_PublicService, "PublicService", PublicService);
