using System.Security.Claims;
using System.Text;
using EquipmentTracker.Api.Data;
using EquipmentTracker.Api.Models;
using EquipmentTracker.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using OfficeOpenXml;

// Некоммерческая лицензия EPPlus (используется для генерации Excel-отчётов и инвентарных
// карточек) — обязательна к установке до создания первого ExcelPackage, иначе с
// подключённым отладчиком выбрасывается исключение.
ExcelPackage.License.SetNonCommercialOrganization("Equipment Tracker");

var builder = WebApplication.CreateBuilder(args);

// --- Конфигурация БД (PostgreSQL) ---
var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? throw new InvalidOperationException("Строка подключения 'Default' не задана");

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));

// --- JWT-аутентификация ---
var jwtSecret = builder.Configuration["Jwt:Secret"]
    ?? throw new InvalidOperationException("Jwt:Secret не задан");
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "EquipmentTracker";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "EquipmentTracker";

builder.Services.AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtIssuer,
            ValidateAudience = true,
            ValidAudience = jwtAudience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1)
        };

        // Роли в токене — лишь снимок на момент входа. При каждом запросе сверяем токен с БД:
        // удалённая учётная запись или сменённый пароль (другая SecurityStamp) — токен недействителен;
        // роли берутся актуальные, так что снятие/выдача ролей действует сразу, без повторного входа.
        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = async context =>
            {
                var principal = context.Principal!;
                if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var accountId))
                {
                    context.Fail("Некорректный токен");
                    return;
                }

                var db = context.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
                var account = await db.Accounts
                    .AsNoTracking()
                    .Where(a => a.Id == accountId)
                    .Select(a => new { a.SecurityStamp, Roles = a.AccountRoles.Select(ar => ar.Role.Name).ToList() })
                    .FirstOrDefaultAsync(context.HttpContext.RequestAborted);

                // Токены, выданные до появления метки, её не содержат — у таких учётных записей
                // метка после миграции пустая, они совпадут до первой смены пароля.
                var tokenStamp = principal.FindFirstValue(JwtService.SecurityStampClaim) ?? string.Empty;
                if (account is null || account.SecurityStamp != tokenStamp)
                {
                    context.Fail("Токен отозван");
                    return;
                }

                var identity = (ClaimsIdentity)principal.Identity!;
                foreach (var claim in identity.FindAll(identity.RoleClaimType).ToList())
                    identity.RemoveClaim(claim);
                identity.AddClaims(account.Roles.Select(r => new Claim(identity.RoleClaimType, r)));
            }
        };
    });

// Политики авторизации: Operator доступен также Administrator-ам (роль включает оператора)
builder.Services.AddAuthorization(options =>
{
    // Любая из известных ролей: «Только чтение», Оператор или Администратор.
    // Это и политика по умолчанию, и запасная (FallbackPolicy) — эндпоинты без атрибута авторизации
    // тоже требуют входа. Анонимно доступен только вход ([AllowAnonymous] у AuthController.Login).
    var viewerPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .RequireRole(RoleNames.Viewer, RoleNames.Operator, RoleNames.Administrator)
        .Build();
    options.AddPolicy("Viewer", viewerPolicy);
    options.DefaultPolicy = viewerPolicy;
    options.FallbackPolicy = viewerPolicy;

    // Только факт входа, без требования роли — для /api/auth/me, чтобы учётная запись, у которой
    // сняли все роли, могла узнать об этом (а не получать 403).
    options.AddPolicy("Authenticated", policy => policy.RequireAuthenticatedUser());

    options.AddPolicy("Operator", policy =>
        policy.RequireRole(RoleNames.Operator, RoleNames.Administrator));
    options.AddPolicy("Administrator", policy =>
        policy.RequireRole(RoleNames.Administrator));
});

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<CurrentUserService>();
builder.Services.AddSingleton<JwtService>();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Description = "JWT токен: Bearer {token}",
        Name = "Authorization",
        In = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.ApiKey,
        Scheme = "Bearer"
    });
    c.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
    {
        {
            new Microsoft.OpenApi.Models.OpenApiSecurityScheme
            {
                Reference = new Microsoft.OpenApi.Models.OpenApiReference
                {
                    Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

// --- CORS для отдельного фронтенд-контейнера ---
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? new[] { "http://localhost:5173", "http://localhost:8080" };

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy.WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

// Применяем миграции и сеем стандартные роли/администратора при старте контейнера
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    await DbInitializer.InitializeAsync(db, app.Configuration, logger);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
