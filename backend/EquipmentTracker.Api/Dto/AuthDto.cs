namespace EquipmentTracker.Api.Dto;

public record LoginRequest(string Login, string Password);
public record LoginResponse(string Token, string Login, string FullName, List<string> Roles);
