using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Unicode;
using EquipmentTracker.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace EquipmentTracker.Api.Data;

public class AppDbContext : DbContext
{
    // Без этого System.Text.Json по умолчанию экранирует кириллицу как \uXXXX —
    // это валидный JSON, но нечитаемый в интерфейсе истории изменений.
    private static readonly JsonSerializerOptions HistoryJsonOptions = new()
    {
        Encoder = JavaScriptEncoder.Create(UnicodeRanges.BasicLatin, UnicodeRanges.Cyrillic)
    };

    // Заполняется извне (из контроллера через middleware) перед SaveChanges,
    // чтобы знать, кто выполняет изменение, для записи в историю.
    public int? CurrentAccountId { get; set; }
    public string CurrentAccountLogin { get; set; } = "система";

    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<AccountRole> AccountRoles => Set<AccountRole>();
    public DbSet<Location> Locations => Set<Location>();
    public DbSet<EquipmentType> EquipmentTypes => Set<EquipmentType>();
    public DbSet<EquipmentName> EquipmentNames => Set<EquipmentName>();
    public DbSet<EquipmentUnit> EquipmentUnits => Set<EquipmentUnit>();
    public DbSet<RepairOperation> RepairOperations => Set<RepairOperation>();
    public DbSet<SparePart> SpareParts => Set<SparePart>();
    public DbSet<Repair> Repairs => Set<Repair>();
    public DbSet<SparePartWriteOff> SparePartWriteOffs => Set<SparePartWriteOff>();
    public DbSet<SparePartIssue> SparePartIssues => Set<SparePartIssue>();
    public DbSet<Inventory> Inventories => Set<Inventory>();
    public DbSet<InventoryConfirmation> InventoryConfirmations => Set<InventoryConfirmation>();
    public DbSet<InventoryUnresolvedUnit> InventoryUnresolvedUnits => Set<InventoryUnresolvedUnit>();
    public DbSet<EditHistoryEntry> HistoryEntries => Set<EditHistoryEntry>();

    // Типы сущностей, для которых ведётся история редактирования
    private static readonly HashSet<Type> TrackedTypes = new()
    {
        typeof(Location),
        typeof(EquipmentType),
        typeof(EquipmentName),
        typeof(EquipmentUnit),
        typeof(RepairOperation),
        typeof(SparePart)
    };

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Account>()
            .HasIndex(a => a.Login)
            .IsUnique();

        modelBuilder.Entity<Role>()
            .HasIndex(r => r.Name)
            .IsUnique();

        modelBuilder.Entity<AccountRole>()
            .HasKey(ar => new { ar.AccountId, ar.RoleId });

        modelBuilder.Entity<AccountRole>()
            .HasOne(ar => ar.Account)
            .WithMany(a => a.AccountRoles)
            .HasForeignKey(ar => ar.AccountId);

        modelBuilder.Entity<AccountRole>()
            .HasOne(ar => ar.Role)
            .WithMany(r => r.AccountRoles)
            .HasForeignKey(ar => ar.RoleId);

        modelBuilder.Entity<Location>()
            .HasOne(l => l.ParentLocation)
            .WithMany(l => l.ChildLocations)
            .HasForeignKey(l => l.ParentLocationId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<EquipmentName>()
            .HasOne(en => en.EquipmentType)
            .WithMany(et => et.EquipmentNames)
            .HasForeignKey(en => en.EquipmentTypeId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<EquipmentUnit>()
            .HasOne(eu => eu.EquipmentName)
            .WithMany(en => en.EquipmentUnits)
            .HasForeignKey(eu => eu.EquipmentNameId)
            .OnDelete(DeleteBehavior.Restrict);

        // Локация обязательна (LocationId не nullable) — удаление локации с техникой
        // запрещено на уровне контроллера, поэтому здесь Restrict как страховка на уровне БД.
        modelBuilder.Entity<EquipmentUnit>()
            .HasOne(eu => eu.Location)
            .WithMany(l => l.EquipmentUnits)
            .HasForeignKey(eu => eu.LocationId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<EquipmentUnit>()
            .HasIndex(eu => eu.SerialNumber)
            .IsUnique();

        modelBuilder.Entity<EquipmentType>()
            .HasIndex(t => t.Name)
            .IsUnique();

        modelBuilder.Entity<EquipmentName>()
            .HasIndex(n => n.Name)
            .IsUnique();

        modelBuilder.Entity<RepairOperation>()
            .HasIndex(o => o.Name)
            .IsUnique();

        modelBuilder.Entity<SparePart>()
            .HasIndex(p => p.Name)
            .IsUnique();

        // Ремонты: удаление единицы техники удаляет её ремонты; справочные записи, использованные
        // в ремонтах, удалить нельзя (Restrict + проверка в контроллерах).
        modelBuilder.Entity<Repair>()
            .HasOne(r => r.EquipmentUnit)
            .WithMany()
            .HasForeignKey(r => r.EquipmentUnitId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Repair>()
            .HasIndex(r => new { r.EquipmentUnitId, r.Date });

        modelBuilder.Entity<RepairOperationItem>()
            .HasKey(i => new { i.RepairId, i.RepairOperationId });
        modelBuilder.Entity<RepairOperationItem>()
            .HasOne(i => i.Repair).WithMany(r => r.Operations)
            .HasForeignKey(i => i.RepairId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<RepairOperationItem>()
            .HasOne(i => i.RepairOperation).WithMany()
            .HasForeignKey(i => i.RepairOperationId).OnDelete(DeleteBehavior.Restrict);

        // Единая таблица списаний расходных частей: основание — ремонт ИЛИ выдача.
        // Удаление основания удаляет его строки списания (остаток при этом не восстанавливается);
        // часть, по которой есть списания, удалить нельзя (Restrict + проверка в контроллере).
        modelBuilder.Entity<SparePartWriteOff>()
            .HasOne(w => w.SparePart).WithMany()
            .HasForeignKey(w => w.SparePartId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<SparePartWriteOff>()
            .HasOne(w => w.Repair).WithMany(r => r.WriteOffs)
            .HasForeignKey(w => w.RepairId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<SparePartWriteOff>()
            .HasOne(w => w.Issue).WithMany(i => i.WriteOffs)
            .HasForeignKey(w => w.IssueId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<SparePartWriteOff>()
            .ToTable(t => t.HasCheckConstraint(
                "CK_SparePartWriteOffs_Source",
                "(\"RepairId\" IS NOT NULL AND \"IssueId\" IS NULL) OR (\"RepairId\" IS NULL AND \"IssueId\" IS NOT NULL)"));

        modelBuilder.Entity<SparePartIssue>()
            .HasIndex(i => i.Date);

        // Инвентаризация: одновременно активна не более одной — гарантируется уникальным
        // частичным индексом по IsActive (даже при гонке двух запусков вторая не сохранится).
        modelBuilder.Entity<Inventory>()
            .HasIndex(i => i.IsActive)
            .IsUnique()
            .HasFilter("\"IsActive\"");

        modelBuilder.Entity<InventoryConfirmation>()
            .HasKey(c => new { c.InventoryId, c.EquipmentUnitId });
        modelBuilder.Entity<InventoryConfirmation>()
            .HasOne(c => c.Inventory).WithMany(i => i.Confirmations)
            .HasForeignKey(c => c.InventoryId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<InventoryConfirmation>()
            .HasOne(c => c.EquipmentUnit).WithMany()
            .HasForeignKey(c => c.EquipmentUnitId).OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<InventoryUnresolvedUnit>()
            .HasOne(u => u.Inventory).WithMany(i => i.UnresolvedUnits)
            .HasForeignKey(u => u.InventoryId).OnDelete(DeleteBehavior.Cascade);
    }

    public override int SaveChanges()
    {
        var pending = BuildHistoryEntries();
        var result = base.SaveChanges();
        FinalizeAndPersistHistory(pending);
        return result;
    }

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        var pending = BuildHistoryEntries();
        var result = await base.SaveChangesAsync(cancellationToken);
        await FinalizeAndPersistHistoryAsync(pending, cancellationToken);
        return result;
    }

    private void FinalizeAndPersistHistory(List<(EditHistoryEntry Entry, Microsoft.EntityFrameworkCore.ChangeTracking.EntityEntry Tracked)> pending)
    {
        if (pending.Count == 0) return;
        foreach (var (histEntry, tracked) in pending)
        {
            if (histEntry.Action == EditAction.Created)
                histEntry.EntityId = (int)tracked.Property("Id").CurrentValue!;
        }
        HistoryEntries.AddRange(pending.Select(p => p.Entry));
        base.SaveChanges();
    }

    private async Task FinalizeAndPersistHistoryAsync(List<(EditHistoryEntry Entry, Microsoft.EntityFrameworkCore.ChangeTracking.EntityEntry Tracked)> pending, CancellationToken ct)
    {
        if (pending.Count == 0) return;
        foreach (var (histEntry, tracked) in pending)
        {
            if (histEntry.Action == EditAction.Created)
                histEntry.EntityId = (int)tracked.Property("Id").CurrentValue!;
        }
        HistoryEntries.AddRange(pending.Select(p => p.Entry));
        await base.SaveChangesAsync(ct);
    }

    // Формирует записи истории на основе ChangeTracker ДО фактического сохранения,
    // т.к. после SaveChanges состояние Deleted/OriginalValue уже недоступно.
    // Id для Added-сущностей проставляется позже, после первого SaveChanges.
    private List<(EditHistoryEntry Entry, Microsoft.EntityFrameworkCore.ChangeTracking.EntityEntry Tracked)> BuildHistoryEntries()
    {
        var result = new List<(EditHistoryEntry, Microsoft.EntityFrameworkCore.ChangeTracking.EntityEntry)>();
        ChangeTracker.DetectChanges();

        foreach (var entry in ChangeTracker.Entries())
        {
            var entityType = entry.Entity.GetType();
            if (!TrackedTypes.Contains(entityType)) continue;
            if (entry.State is EntityState.Unchanged or EntityState.Detached) continue;

            var action = entry.State switch
            {
                EntityState.Added => EditAction.Created,
                EntityState.Modified => EditAction.Updated,
                EntityState.Deleted => EditAction.Deleted,
                _ => (EditAction?)null
            };
            if (action is null) continue;

            Dictionary<string, object?> payload;
            if (action == EditAction.Updated)
            {
                payload = new Dictionary<string, object?>();
                foreach (var prop in entry.Properties.Where(p => p.IsModified))
                {
                    payload[prop.Metadata.Name] = new
                    {
                        old = prop.OriginalValue,
                        @new = prop.CurrentValue
                    };
                }
                if (payload.Count == 0) continue; // нет реальных изменений
            }
            else
            {
                payload = entry.Properties.ToDictionary(p => p.Metadata.Name, p => p.CurrentValue);
            }

            var entityIdValue = entry.Property("Id").CurrentValue;

            var histEntry = new EditHistoryEntry
            {
                EntityType = entityType.Name,
                EntityId = action == EditAction.Created ? 0 : (entityIdValue is int idVal ? idVal : 0),
                Action = action.Value,
                ChangesJson = JsonSerializer.Serialize(payload, HistoryJsonOptions),
                AccountId = CurrentAccountId,
                AccountLogin = CurrentAccountLogin,
                TimestampUtc = DateTime.UtcNow
            };

            result.Add((histEntry, entry));
        }

        return result;
    }
}
