using EquipmentTracker.Api.Data;
using EquipmentTracker.Api.Dto;
using EquipmentTracker.Api.Models;
using EquipmentTracker.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EquipmentTracker.Api.Controllers;

// Выдача расходных частей, не связанных с ремонтом (например, компакт-диски).
// Списание идёт по тем же правилам, что и при ремонте (SparePartWriteOffs): в одной транзакции,
// без проверки наличия. Просмотр выдач — через историю списаний (SparePartWriteOffsController).
[ApiController]
[Route("api/spare-part-issues")]
public class SparePartIssuesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly CurrentUserService _currentUser;

    public SparePartIssuesController(AppDbContext db, CurrentUserService currentUser)
    {
        _db = db;
        _currentUser = currentUser;
        _db.CurrentAccountId = currentUser.AccountId;
        _db.CurrentAccountLogin = currentUser.Login;
    }

    [Authorize(Policy = "Operator")]
    [HttpPost]
    public async Task<ActionResult<SparePartIssueDto>> Create(CreateSparePartIssueRequest request)
    {
        var recipient = request.Recipient?.Trim();
        if (string.IsNullOrWhiteSpace(recipient))
            return BadRequest(new { message = "Укажите, кому выдано" });

        if (request.Parts is null || request.Parts.Count == 0)
            return BadRequest(new { message = "Укажите хотя бы одну выдаваемую расходную часть" });

        var (writeOffs, error) = await SparePartWriteOffs.PrepareAsync(_db, request.Parts);
        if (error is not null)
            return BadRequest(new { message = error });

        var issue = new SparePartIssue
        {
            Date = request.Date ?? DateOnly.FromDateTime(DateTime.UtcNow),
            Recipient = recipient,
            AccountId = _currentUser.AccountId,
            AccountLogin = _currentUser.Login,
            CreatedUtc = DateTime.UtcNow
        };
        SparePartWriteOffs.Apply(issue.WriteOffs, writeOffs);

        _db.SparePartIssues.Add(issue);
        await _db.SaveChangesAsync(); // выдача и списание — одной транзакцией

        return Ok(new SparePartIssueDto(
            issue.Id,
            issue.Date,
            issue.Recipient,
            issue.AccountLogin,
            issue.CreatedUtc,
            issue.WriteOffs.Select(w => new WriteOffPartDto(w.SparePartId, w.SparePart.Name, w.Quantity))
                .OrderBy(p => p.Name).ToList()));
    }
}
