using System.Globalization;
using System.Text.RegularExpressions;
using EquipmentTracker.Api.Data;
using EquipmentTracker.Api.Dto;
using EquipmentTracker.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OfficeOpenXml;
using OfficeOpenXml.Style;
using OfficeOpenXml.Table;

namespace EquipmentTracker.Api.Controllers;

// Генерация Excel-отчётов по выбранной технике. Портировано с адаптацией под новую
// схему (единая иерархия Locations вместо отдельных таблиц Buildings/Cabinets/Complects)
// из исходного проекта: https://github.com/ComissarCat/Hardware (ExportManager.cs).
// Экспорт доступен любой роли (в т.ч. «Только чтение»); без входа — нет.
[ApiController]
[Route("api/export")]
[Authorize(Policy = "Viewer")]
public class ExportController : ControllerBase
{
    private const string XlsxContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    private static readonly Regex NonAlphaNumSpace = new(@"[^\p{L}\p{N}\s]");
    // Проект работает в InvariantGlobalization (в образе нет ICU), поэтому культура ru-RU недоступна —
    // сортировка идёт ordinal без учёта регистра.

    private readonly AppDbContext _db;
    private readonly IConfiguration _config;

    public ExportController(AppDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    // Простой список выбранной техники, с полной локацией в одном столбце.
    // Оформлен как "умная таблица" Excel (Table), шрифт Courier New 12pt — как в исходном проекте.
    [HttpPost("equipment-list")]
    public async Task<IActionResult> EquipmentList(ExportUnitIdsRequest request)
    {
        if (request.UnitIds.Count == 0)
            return BadRequest(new { message = "Список единиц техники пуст" });

        var units = await _db.EquipmentUnits
            .Include(u => u.EquipmentName).ThenInclude(n => n.EquipmentType)
            .Where(u => request.UnitIds.Contains(u.Id))
            .ToListAsync();

        var locationsById = await _db.Locations.AsNoTracking().ToDictionaryAsync(l => l.Id);

        using var package = new ExcelPackage();
        var worksheet = package.Workbook.Worksheets.Add("Техника");

        worksheet.Cells.Style.Font.Name = "Courier New";
        worksheet.Cells.Style.Font.Size = 12;
        worksheet.Cells.Style.WrapText = true;
        worksheet.Cells.Style.VerticalAlignment = ExcelVerticalAlignment.Top;

        worksheet.Cells[1, 1].Value = "Локация";
        worksheet.Cells[1, 2].Value = "Тип";
        worksheet.Cells[1, 3].Value = "Наименование";
        worksheet.Cells[1, 4].Value = "С/н";
        worksheet.Cells[1, 5].Value = "И/н";
        worksheet.Cells[1, 6].Value = "Примечание";

        var ordered = units
            .OrderBy(u => FullPath(u.LocationId, locationsById), StringComparer.OrdinalIgnoreCase)
            .ThenBy(u => u.SerialNumber, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var row = 2;
        foreach (var u in ordered)
        {
            worksheet.Cells[row, 1].Value = FullPath(u.LocationId, locationsById);
            worksheet.Cells[row, 2].Value = u.EquipmentName.EquipmentType.Name;
            worksheet.Cells[row, 3].Value = u.EquipmentName.Name;
            worksheet.Cells[row, 4].Value = u.SerialNumber;
            worksheet.Cells[row, 5].Value = u.InventoryNumber;
            worksheet.Cells[row, 6].Value = u.Note;
            row++;
        }

        var range = worksheet.Cells[1, 1, row - 1, 6];
        var table = worksheet.Tables.Add(range, "Техника");
        table.TableStyle = TableStyles.Light16;
        range.AutoFitColumns();

        var bytes = await package.GetAsByteArrayAsync();
        return File(bytes, XlsxContentType, $"spisok-tehniki-{DateTime.Now:yyyyMMdd-HHmm}.xlsx");
    }

    // Инвентарные карточки — по одному листу на "кабинет", оформление и настройки печати
    // (А5, альбомная, вписать в страницу) как в исходном проекте. Т.к. в новой схеме нет
    // жёстко заданных уровней "здание"/"кабинет", они переданы как глубина в дереве локаций
    // (см. InventoryCardsModal на фронтенде — определяется по двум примерам локаций).
    [HttpPost("inventory-cards")]
    public async Task<IActionResult> InventoryCards(InventoryCardsRequest request)
    {
        if (request.UnitIds.Count == 0)
            return BadRequest(new { message = "Список единиц техники пуст" });
        if (request.CabinetDepth != request.BuildingDepth + 1)
            return BadRequest(new { message = "«Кабинет» должен находиться на один уровень глубже «Здания»" });

        var units = await _db.EquipmentUnits
            .Include(u => u.EquipmentName).ThenInclude(n => n.EquipmentType)
            .Where(u => request.UnitIds.Contains(u.Id))
            .ToListAsync();

        var locationsById = await _db.Locations.AsNoTracking().ToDictionaryAsync(l => l.Id);

        // Группируем технику по паре (здание, кабинет), которой она принадлежит на указанной глубине
        var groups = new Dictionary<(int BuildingId, int CabinetId), CabinetGroup>();
        foreach (var u in units)
        {
            var chain = AncestorChain(u.LocationId, locationsById);
            if (chain.Count <= request.CabinetDepth) continue; // единица лежит не глубже уровня "кабинет" — пропускаем

            var building = chain[request.BuildingDepth];
            var cabinet = chain[request.CabinetDepth];
            var key = (building.Id, cabinet.Id);

            if (!groups.TryGetValue(key, out var group))
            {
                group = new CabinetGroup(building, cabinet);
                groups[key] = group;
            }

            var immediateParentName = locationsById.TryGetValue(u.LocationId, out var loc) ? loc.Name : string.Empty;
            group.Items.Add((u, immediateParentName));
        }

        if (groups.Count == 0)
            return BadRequest(new { message = "Ни одна из выбранных единиц техники не попадает под указанные уровни «здание»/«кабинет»" });

        var orgName = _config["Export:OrganizationName"] ?? string.Empty;
        var okpoCode = _config["Export:OkpoCode"] ?? string.Empty;

        using var package = new ExcelPackage();
        var usedSheetNames = new HashSet<string>();

        var orderedGroups = groups.Values
            .OrderBy(g => g.Building.Name, StringComparer.OrdinalIgnoreCase)
            .ThenBy(g => g.Cabinet.Name, StringComparer.OrdinalIgnoreCase);

        foreach (var group in orderedGroups)
            BuildCabinetWorksheet(package, group, orgName, okpoCode, usedSheetNames);

        var bytes = await package.GetAsByteArrayAsync();
        return File(bytes, XlsxContentType, $"inventarnye-kartochki-{DateTime.Now:yyyyMMdd-HHmm}.xlsx");
    }

    private sealed class CabinetGroup
    {
        public CabinetGroup(Location building, Location cabinet)
        {
            Building = building;
            Cabinet = cabinet;
        }

        public Location Building { get; }
        public Location Cabinet { get; }
        public List<(EquipmentUnit Unit, string ImmediateParentName)> Items { get; } = new();
    }

    private static void BuildCabinetWorksheet(ExcelPackage package, CabinetGroup group, string orgName, string okpoCode, HashSet<string> usedSheetNames)
    {
        var worksheetName = MakeSheetName($"{group.Building.Name} {group.Cabinet.Name}", usedSheetNames);
        var worksheet = package.Workbook.Worksheets.Add(worksheetName);

        worksheet.PrinterSettings.FitToPage = true;
        worksheet.PrinterSettings.FitToWidth = 1;
        worksheet.PrinterSettings.FitToHeight = 1;
        worksheet.PrinterSettings.Orientation = eOrientation.Landscape;
        worksheet.PrinterSettings.PaperSize = ePaperSize.A5;
        worksheet.PrinterSettings.HorizontalCentered = true;

        worksheet.Cells.Style.Font.Name = "Courier New";
        worksheet.Cells.Style.Font.Size = 8;
        worksheet.Cells.Style.WrapText = true;
        worksheet.Cells.Style.VerticalAlignment = ExcelVerticalAlignment.Top;

        worksheet.Columns[1].Width = 6.17;
        worksheet.Columns[2].Width = 18.67;
        worksheet.Columns[3].Width = 12.67;
        worksheet.Columns[4].Width = 12.17;
        worksheet.Columns[5].Width = 4.5;
        worksheet.Columns[6].Width = 7.67;
        worksheet.Columns[7].Width = 28.33;
        worksheet.Columns[8].Width = 2.67;
        worksheet.Columns[9].Width = 12.67;
        worksheet.Columns[10].Width = 7.67;
        worksheet.Columns[11].Width = 8.67;

        #region Шапка
        worksheet.Cells[1, 1, 1, 11].Merge = true;
        worksheet.Cells[1, 1].Value = "Инвентарный список нефинансовых активов";
        worksheet.Cells[1, 1].Style.Font.Size = 10;
        worksheet.Cells[1, 1].Style.Font.Bold = true;
        worksheet.Cells[1, 1].Style.HorizontalAlignment = ExcelHorizontalAlignment.Center;

        worksheet.Cells[2, 1].Value = $"{group.Building.Name} {group.Cabinet.Name}";

        worksheet.Cells[4, 1].Value = "Учреждение";
        worksheet.Cells[4, 3, 4, 8].Merge = true;
        worksheet.Cells[4, 3].Value = orgName;
        worksheet.Cells[4, 3, 4, 8].Style.Border.Bottom.Style = ExcelBorderStyle.Thin;

        worksheet.Cells[5, 4, 5, 8].Merge = true;
        worksheet.Cells[5, 1].Value = "Структурное подразделение";
        worksheet.Cells[5, 4, 5, 8].Style.Border.Bottom.Style = ExcelBorderStyle.Thin;

        worksheet.Cells[6, 4, 6, 8].Merge = true;
        worksheet.Cells[6, 1].Value = "Ответственное(-ые) лицо(-а)";
        worksheet.Cells[6, 4, 6, 8].Style.Border.Bottom.Style = ExcelBorderStyle.Thin;

        worksheet.Cells[2, 10, 2, 11].Merge = true;
        worksheet.Cells[2, 10].Value = "КОДЫ";
        worksheet.Cells[2, 10, 2, 11].Style.HorizontalAlignment = ExcelHorizontalAlignment.Center;

        worksheet.Cells[3, 10, 3, 11].Merge = true;
        worksheet.Cells[3, 10].Value = "0504034";
        worksheet.Cells[3, 10, 3, 11].Style.HorizontalAlignment = ExcelHorizontalAlignment.Center;

        worksheet.Cells[4, 10, 4, 11].Merge = true;
        worksheet.Cells[4, 10].Value = okpoCode;
        worksheet.Cells[4, 10, 4, 11].Style.HorizontalAlignment = ExcelHorizontalAlignment.Center;

        worksheet.Cells[5, 10].Value = DateTime.Now.ToString("dd.MM.yyyy", CultureInfo.InvariantCulture);
        worksheet.Cells[5, 10, 5, 11].Merge = true;
        worksheet.Cells[5, 10].Style.HorizontalAlignment = ExcelHorizontalAlignment.Center;

        worksheet.Cells[6, 10, 6, 11].Merge = true;

        worksheet.Cells[3, 9].Value = "Форма по ОКУД";
        worksheet.Cells[3, 9].Style.HorizontalAlignment = ExcelHorizontalAlignment.Right;

        worksheet.Cells[4, 9].Value = "по ОКПО";
        worksheet.Cells[4, 9].Style.HorizontalAlignment = ExcelHorizontalAlignment.Right;

        worksheet.Cells[5, 9].Value = "Дата";
        worksheet.Cells[5, 9].Style.HorizontalAlignment = ExcelHorizontalAlignment.Right;

        for (var i = 2; i <= 6; i++)
            for (var j = 10; j <= 11; j++)
            {
                var cell = worksheet.Cells[i, j];
                cell.Style.Border.Top.Style = ExcelBorderStyle.Thin;
                cell.Style.Border.Bottom.Style = ExcelBorderStyle.Thin;
                cell.Style.Border.Left.Style = ExcelBorderStyle.Thin;
                cell.Style.Border.Right.Style = ExcelBorderStyle.Thin;
            }
        worksheet.Cells[3, 10, 6, 11].Style.Border.BorderAround(ExcelBorderStyle.Medium);

        worksheet.Rows[1, 6].Style.WrapText = false;
        #endregion

        #region Шапка таблицы
        worksheet.Rows[8, 11].Style.HorizontalAlignment = ExcelHorizontalAlignment.Center;

        worksheet.Cells[8, 1].Value = "Номер\nп/п";
        worksheet.Cells[8, 1, 10, 1].Merge = true;

        worksheet.Cells[8, 2].Value = "Инвентарная\nкарточка";
        worksheet.Cells[8, 2, 9, 3].Merge = true;

        worksheet.Cells[10, 2].Value = "номер";
        worksheet.Cells[10, 3].Value = "дата";

        worksheet.Cells[8, 4].Value = "Заводской\nномер";
        worksheet.Cells[8, 4, 10, 4].Merge = true;

        worksheet.Cells[8, 5].Value = "Инвентарный\nномер";
        worksheet.Cells[8, 5, 10, 6].Merge = true;

        worksheet.Cells[8, 7].Value = "Полное наименование объекта";
        worksheet.Cells[8, 7, 10, 8].Merge = true;

        worksheet.Cells[8, 9].Value = "Выбытие (перемещение)";
        worksheet.Cells[8, 9, 8, 11].Merge = true;

        worksheet.Cells[9, 9].Value = "документ";
        worksheet.Cells[9, 9, 9, 10].Merge = true;

        worksheet.Cells[10, 9].Value = "дата";
        worksheet.Cells[10, 10].Value = "номер";

        worksheet.Cells[9, 11].Value = "причина\nвыбытия";
        worksheet.Cells[9, 11, 10, 11].Merge = true;

        worksheet.Cells[11, 1].Value = "1а";
        worksheet.Cells[11, 2].Value = "1";
        worksheet.Cells[11, 3].Value = "2";
        worksheet.Cells[11, 4].Value = "3";

        worksheet.Cells[11, 5, 11, 6].Merge = true;
        worksheet.Cells[11, 5].Value = "4";

        worksheet.Cells[11, 7, 11, 8].Merge = true;
        worksheet.Cells[11, 7].Value = "5";

        worksheet.Cells[11, 9].Value = "6";
        worksheet.Cells[11, 10].Value = "7";
        worksheet.Cells[11, 11].Value = "8";
        #endregion

        #region Тело таблицы
        var row = 12;
        var count = 1;

        // Внутри кабинета сортируем по ближайшей родительской локации (аналог "комплекта"),
        // затем по инвентарному и серийному номеру — так же, как в исходном проекте.
        var sortedItems = group.Items
            .OrderBy(it => it.ImmediateParentName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(it => it.Unit.InventoryNumber, StringComparer.OrdinalIgnoreCase)
            .ThenBy(it => it.Unit.SerialNumber, StringComparer.OrdinalIgnoreCase);

        foreach (var (unit, _) in sortedItems)
        {
            worksheet.Cells[row, 5, row, 6].Merge = true;
            worksheet.Cells[row, 7, row, 8].Merge = true;

            worksheet.Cells[row, 1].Value = count++;
            worksheet.Cells[row, 1].Style.HorizontalAlignment = ExcelHorizontalAlignment.Center;

            // Историческое правило исходного проекта: в столбец "номер инвентарной карточки"
            // попадают последние 5 символов инвентарного номера, если он начинается с "10134".
            if (unit.InventoryNumber != null && unit.InventoryNumber.StartsWith("10134") && unit.InventoryNumber.Length >= 5)
                worksheet.Cells[row, 2].Value = unit.InventoryNumber[^5..];

            worksheet.Cells[row, 4].Value = unit.SerialNumber;
            if (unit.InventoryNumber != null)
                worksheet.Cells[row, 5].Value = unit.InventoryNumber;

            worksheet.Cells[row, 7].Value = $"{unit.EquipmentName.EquipmentType.Name} {unit.EquipmentName.Name}";

            if (!string.IsNullOrEmpty(unit.InventoryNumber))
                worksheet.Row(row).Height = 22.5;

            row++;
        }
        row--;

        for (var i = 8; i <= row; i++)
            for (var j = 1; j <= 11; j++)
            {
                var cell = worksheet.Cells[i, j];
                cell.Style.Border.Top.Style = ExcelBorderStyle.Thin;
                cell.Style.Border.Bottom.Style = ExcelBorderStyle.Thin;
                cell.Style.Border.Left.Style = ExcelBorderStyle.Thin;
                cell.Style.Border.Right.Style = ExcelBorderStyle.Thin;
            }
        #endregion

        #region Днище таблицы
        row += 2;

        worksheet.Rows[row, row + 5].Style.WrapText = false;

        worksheet.Cells[row, 1].Value = "Исполнитель";

        worksheet.Cells[row, 3, row, 5].Merge = true;
        worksheet.Cells[row, 3, row, 5].Style.Border.Bottom.Style = ExcelBorderStyle.Thin;

        worksheet.Cells[row, 7].Style.Border.Bottom.Style = ExcelBorderStyle.Thin;

        worksheet.Cells[row, 9, row, 11].Merge = true;
        worksheet.Cells[row, 9, row, 11].Style.Border.Bottom.Style = ExcelBorderStyle.Thin;

        row++;

        worksheet.Cells[row, 3, row, 5].Merge = true;
        worksheet.Cells[row, 3].Value = "(должность)";
        worksheet.Cells[row, 3].Style.Font.Size = 7;
        worksheet.Cells[row, 3].Style.HorizontalAlignment = ExcelHorizontalAlignment.Center;

        worksheet.Cells[row, 7].Value = "(подпись)";
        worksheet.Cells[row, 7].Style.Font.Size = 7;
        worksheet.Cells[row, 7].Style.HorizontalAlignment = ExcelHorizontalAlignment.Center;

        worksheet.Cells[row, 9, row, 11].Merge = true;
        worksheet.Cells[row, 9].Value = "(расшифровка подписи)";
        worksheet.Cells[row, 9].Style.Font.Size = 7;
        worksheet.Cells[row, 9].Style.HorizontalAlignment = ExcelHorizontalAlignment.Center;

        row++;

        worksheet.Cells[row, 7].Style.Border.Bottom.Style = ExcelBorderStyle.Thin;

        worksheet.Cells[row, 9, row, 11].Merge = true;
        worksheet.Cells[row, 9, row, 11].Style.Border.Bottom.Style = ExcelBorderStyle.Thin;

        row++;

        worksheet.Cells[row, 7].Value = "(номер контактного телефона)";
        worksheet.Cells[row, 7].Style.Font.Size = 7;
        worksheet.Cells[row, 7].Style.HorizontalAlignment = ExcelHorizontalAlignment.Center;

        worksheet.Cells[row, 9, row, 11].Merge = true;
        worksheet.Cells[row, 9].Value = "(электронный адрес)";
        worksheet.Cells[row, 9].Style.Font.Size = 7;
        worksheet.Cells[row, 9].Style.HorizontalAlignment = ExcelHorizontalAlignment.Center;

        row++;

        worksheet.Cells[row, 1].Value = "\"_______\"____________________ 20___ г.";
        #endregion
    }

    // Полная цепочка локаций от корня до данной (включительно)
    private static List<Location> AncestorChain(int locationId, Dictionary<int, Location> byId)
    {
        var chain = new List<Location>();
        if (!byId.TryGetValue(locationId, out var cur)) return chain;
        while (true)
        {
            chain.Insert(0, cur);
            if (cur.ParentLocationId is null || !byId.TryGetValue(cur.ParentLocationId.Value, out var parent)) break;
            cur = parent;
        }
        return chain;
    }

    private static string FullPath(int locationId, Dictionary<int, Location> byId) =>
        string.Join(" → ", AncestorChain(locationId, byId).Select(l => l.Name));

    // Имя листа Excel: только буквы/цифры/пробелы (как в исходном проекте), не длиннее 31
    // символа (ограничение Excel) и гарантированно уникальное в пределах книги.
    private static string MakeSheetName(string raw, HashSet<string> used)
    {
        var cleaned = NonAlphaNumSpace.Replace(raw, "_").Trim();
        if (cleaned.Length == 0) cleaned = "Лист";
        if (cleaned.Length > 31) cleaned = cleaned[..31];

        if (used.Add(cleaned)) return cleaned;

        var suffix = 2;
        while (true)
        {
            var tail = $" ({suffix})";
            var baseLen = Math.Min(cleaned.Length, 31 - tail.Length);
            var candidate = cleaned[..baseLen] + tail;
            if (used.Add(candidate)) return candidate;
            suffix++;
        }
    }
}
