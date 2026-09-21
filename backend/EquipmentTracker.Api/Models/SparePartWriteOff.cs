namespace EquipmentTracker.Api.Models;

// Единая таблица списаний расходных частей. Списание всегда относится ровно к одному
// основанию: ремонту (RepairId) или выдаче (IssueId) — это гарантирует CHECK-ограничение в БД.
// Дата и автор хранятся в самом основании (Repair / SparePartIssue).
public class SparePartWriteOff
{
    public int Id { get; set; }

    public int SparePartId { get; set; }
    public SparePart SparePart { get; set; } = null!;

    public int Quantity { get; set; }

    public int? RepairId { get; set; }
    public Repair? Repair { get; set; }

    public int? IssueId { get; set; }
    public SparePartIssue? Issue { get; set; }
}

// Выдача расходных частей, не связанных с ремонтом (например, компакт-диски).
public class SparePartIssue
{
    public int Id { get; set; }

    public DateOnly Date { get; set; }

    // Кому выдано — свободный текст, не из списка
    public string Recipient { get; set; } = string.Empty;

    // Кем выдано — учётная запись, зафиксировавшая выдачу (снимком, как у ремонта)
    public int? AccountId { get; set; }
    public string AccountLogin { get; set; } = string.Empty;

    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;

    public ICollection<SparePartWriteOff> WriteOffs { get; set; } = new List<SparePartWriteOff>();
}
