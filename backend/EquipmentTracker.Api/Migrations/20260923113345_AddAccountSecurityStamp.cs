using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EquipmentTracker.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddAccountSecurityStamp : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Существующим учётным записям — пустая метка: она совпадает с уже выданными токенами
            // (в них метки нет), поэтому после обновления никого не выбрасывает из системы.
            // При первой смене пароля метка станет случайной.
            migrationBuilder.AddColumn<string>(
                name: "SecurityStamp",
                table: "Accounts",
                type: "text",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SecurityStamp",
                table: "Accounts");
        }
    }
}
