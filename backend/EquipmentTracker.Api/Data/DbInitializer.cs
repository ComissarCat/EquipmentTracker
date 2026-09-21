using EquipmentTracker.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace EquipmentTracker.Api.Data;

// Применяет миграции и создаёт стандартные роли и учётную запись администратора при первом запуске.
public static class DbInitializer
{
    public static async Task InitializeAsync(AppDbContext db, IConfiguration config, ILogger logger)
    {
        // Примечание: в этом шаблоне схема БД создаётся через EnsureCreatedAsync
        // (готовых файлов миграций EF Core в проекте нет — их нужно сгенерировать
        // один раз командой `dotnet ef migrations add InitialCreate`, см. README).
        // Если миграции присутствуют в проекте — замените строку ниже на
        // `await db.Database.MigrateAsync();`, чтобы использовать полноценные миграции.
        await db.Database.EnsureCreatedAsync();

        var operatorRole = await db.Roles.FirstOrDefaultAsync(r => r.Name == RoleNames.Operator);
        if (operatorRole is null)
        {
            operatorRole = new Role { Name = RoleNames.Operator };
            db.Roles.Add(operatorRole);
        }

        var adminRole = await db.Roles.FirstOrDefaultAsync(r => r.Name == RoleNames.Administrator);
        if (adminRole is null)
        {
            adminRole = new Role { Name = RoleNames.Administrator };
            db.Roles.Add(adminRole);
        }

        await db.SaveChangesAsync();

        var adminLogin = config["DefaultAdmin:Login"] ?? "admin";
        var adminExists = await db.Accounts.AnyAsync(a => a.Login == adminLogin);
        if (!adminExists)
        {
            var adminPassword = config["DefaultAdmin:Password"] ?? "admin123";
            var hasher = new PasswordHasher<Account>();

            var admin = new Account
            {
                Login = adminLogin,
                FullName = config["DefaultAdmin:FullName"] ?? "Администратор",
            };
            admin.PasswordHash = hasher.HashPassword(admin, adminPassword);
            db.Accounts.Add(admin);
            await db.SaveChangesAsync();

            db.AccountRoles.Add(new AccountRole { AccountId = admin.Id, RoleId = adminRole.Id });
            await db.SaveChangesAsync();

            logger.LogWarning(
                "Создана стандартная учётная запись администратора. Логин: {Login}. " +
                "ОБЯЗАТЕЛЬНО смените пароль после первого входа!", adminLogin);
        }
    }
}
