namespace EquipmentTracker.Api.Models;

public static class RoleNames
{
    public const string Operator = "Operator";
    public const string Administrator = "Administrator";
    // «Только чтение»: просмотр всех данных и экспорт без права что-либо изменять
    public const string Viewer = "Viewer";
}

public class Role
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;

    public ICollection<AccountRole> AccountRoles { get; set; } = new List<AccountRole>();
}
