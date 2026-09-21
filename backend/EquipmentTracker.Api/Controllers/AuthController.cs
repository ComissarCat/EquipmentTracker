using EquipmentTracker.Api.Data;
using EquipmentTracker.Api.Dto;
using EquipmentTracker.Api.Services;
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

    public AuthController(AppDbContext db, JwtService jwt)
    {
        _db = db;
        _jwt = jwt;
    }

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
}
