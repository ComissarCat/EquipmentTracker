namespace EquipmentTracker.Api.Models;

public class Account
{
    public int Id { get; set; }
    public string Login { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;

    public ICollection<AccountRole> AccountRoles { get; set; } = new List<AccountRole>();
}
