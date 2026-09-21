namespace EquipmentTracker.Api.Models;

// Справочник расходных (запасных) частей с текущим остатком.
// Quantity меняется только через SparePartsController (правила зависят от роли),
// каждое изменение попадает в историю редактирования.
public class SparePart
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int Quantity { get; set; }
}
