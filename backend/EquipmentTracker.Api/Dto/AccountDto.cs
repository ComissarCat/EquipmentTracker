namespace EquipmentTracker.Api.Dto;

public record AccountDto(int Id, string Login, string FullName, List<string> Roles);
public record CreateAccountRequest(string Login, string Password, string FullName, List<string> Roles);
public record UpdateAccountRequest(string FullName, List<string> Roles, string? NewPassword);
