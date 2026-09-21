namespace EquipmentTracker.Api.Models;

public class AccountRole
{
    public int AccountId { get; set; }
    public Account Account { get; set; } = null!;

    public int RoleId { get; set; }
    public Role Role { get; set; } = null!;
}
