namespace EquipmentTracker.Api.Models;

public class Account
{
    public int Id { get; set; }
    public string Login { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;

    // Метка безопасности: попадает в JWT и сверяется при каждом запросе. Меняется при смене
    // пароля — все ранее выданные токены этой учётной записи сразу перестают действовать.
    public string SecurityStamp { get; set; } = Guid.NewGuid().ToString("N");

    public ICollection<AccountRole> AccountRoles { get; set; } = new List<AccountRole>();
}
