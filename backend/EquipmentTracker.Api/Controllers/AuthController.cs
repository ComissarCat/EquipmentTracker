using EquipmentTracker.Api.Data;
using EquipmentTracker.Api.Dto;
using EquipmentTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace EquipmentTracker.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly JwtService _jwt;
    private readonly CurrentUserService _currentUser;

    public AuthController(AppDbContext db, JwtService jwt, CurrentUserService currentUser)
    {
        _db = db;
        _jwt = jwt;
        _currentUser = currentUser;
    }

    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<ActionResult<LoginResponse>> Login(LoginRequest request)
    {
        var account = await _db.Accounts
            .Include(a => a.AccountRoles).ThenInclude(ar => ar.Role)
            .FirstOrDefaultAsync(a => a.Login == request.Login);

        if (account is null)
            return Unauthorized(new { message = "Неверный логин или пароль" });

        var hasher = new PasswordHasher<Models.Account>();
        var verify = hasher.VerifyHashedPassword(account, account.PasswordHash, request.Password);
        if (verify == PasswordVerificationResult.Failed)
            return Unauthorized(new { message = "Неверный логин или пароль" });

        var roles = account.AccountRoles.Select(ar => ar.Role.Name).ToList();
        var token = _jwt.GenerateToken(account, roles);

        return Ok(new LoginResponse(token, account.Login, account.FullName, roles));
    }

    // Актуальные данные текущего пользователя: фронтенд обновляет по ним роли, сохранённые при входе
    // (роли могли поменять, пока пользователь был в системе). Доступно и учётной записи без ролей.
    [Authorize(Policy = "Authenticated")]
    [HttpGet("me")]
    public async Task<ActionResult<CurrentUserResponse>> Me()
    {
        var accountId = _currentUser.AccountId;
        var account = await _db.Accounts
            .AsNoTracking()
            .Include(a => a.AccountRoles).ThenInclude(ar => ar.Role)
            .FirstOrDefaultAsync(a => a.Id == accountId);
        if (account is null) return Unauthorized();

        return new CurrentUserResponse(account.Login, account.FullName,
            account.AccountRoles.Select(ar => ar.Role.Name).ToList());
    }
}
