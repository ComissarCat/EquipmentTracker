using EquipmentTracker.Api.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace EquipmentTracker.Api.Data;

// Применяет миграции (см. BaselineLegacyDatabaseAsync для БД, созданных без них) и создаёт стандартные роли и учётную запись администратора при первом запуске.
public static class DbInitializer
{
    public static async Task InitializeAsync(AppDbContext db, IConfiguration config, ILogger logger)
    {
        await BaselineLegacyDatabaseAsync(db, logger);
        await db.Database.MigrateAsync();

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

        if (!await db.Roles.AnyAsync(r => r.Name == RoleNames.Viewer))
            db.Roles.Add(new Role { Name = RoleNames.Viewer });

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

    // БД, созданная раньше через EnsureCreated, уже содержит таблицы первой миграции, но не имеет
    // таблицы __EFMigrationsHistory — MigrateAsync попытался бы создать всё заново и упал.
    // Помечаем первую миграцию (InitialCreate) применённой, данные не затрагиваются; остальные
    // миграции применит MigrateAsync. На новой пустой БД и на БД, уже переведённой на миграции,
    // метод ничего не делает.
    private static async Task BaselineLegacyDatabaseAsync(AppDbContext db, ILogger logger)
    {
        if ((await db.Database.GetAppliedMigrationsAsync()).Any()) return;

        var legacyExists = await db.Database
            .SqlQueryRaw<bool>("""
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = current_schema() AND table_name = 'Accounts') AS "Value"
                """)
            .SingleAsync();
        if (!legacyExists) return;

        var baselineId = db.Database.GetMigrations().First();
        var history = db.GetService<IHistoryRepository>();
        await db.Database.ExecuteSqlRawAsync(history.GetCreateIfNotExistsScript());
        var version = typeof(DbContext).Assembly.GetName().Version!.ToString(3);
        await db.Database.ExecuteSqlRawAsync(history.GetInsertScript(new HistoryRow(baselineId, version)));

        logger.LogWarning("Обнаружена БД, созданная без миграций: миграция {Migration} помечена применённой.", baselineId);
    }
}
