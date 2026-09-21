using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace EquipmentTracker.Api.Data;

// Нужна только инструментам `dotnet ef` (создание миграций): подключение к БД при этом не
// открывается, строка подключения формальная. В рантайме не используется.
public class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql("Host=localhost;Database=design_time")
            .Options;
        return new AppDbContext(options);
    }
}
