using System.Security.Claims;

namespace EquipmentTracker.Api.Services;

// Достаёт данные о текущем пользователе из HttpContext (заполняется JWT middleware),
// используется контроллерами для записи в историю изменений (кто внёс изменение).
public class CurrentUserService
{
    private readonly IHttpContextAccessor _httpContextAccessor;

    public CurrentUserService(IHttpContextAccessor httpContextAccessor)
    {
        _httpContextAccessor = httpContextAccessor;
    }

    public bool IsAuthenticated => _httpContextAccessor.HttpContext?.User.Identity?.IsAuthenticated ?? false;

    public int? AccountId
    {
        get
        {
            var idStr = _httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.NameIdentifier);
            return int.TryParse(idStr, out var id) ? id : null;
        }
    }

    public string Login => _httpContextAccessor.HttpContext?.User.FindFirstValue(ClaimTypes.Name) ?? "аноним";
}
