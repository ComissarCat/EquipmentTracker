using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace EquipmentTracker.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddInventory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Inventories",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    StartedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    StartedByAccountId = table.Column<int>(type: "integer", nullable: true),
                    StartedByLogin = table.Column<string>(type: "text", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    EndedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    EndedByLogin = table.Column<string>(type: "text", nullable: true),
                    FinalTotalUnits = table.Column<int>(type: "integer", nullable: true),
                    FinalConfirmedUnits = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Inventories", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "InventoryConfirmations",
                columns: table => new
                {
                    InventoryId = table.Column<int>(type: "integer", nullable: false),
                    EquipmentUnitId = table.Column<int>(type: "integer", nullable: false),
                    ConfirmedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ConfirmedByLogin = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryConfirmations", x => new { x.InventoryId, x.EquipmentUnitId });
                    table.ForeignKey(
                        name: "FK_InventoryConfirmations_EquipmentUnits_EquipmentUnitId",
                        column: x => x.EquipmentUnitId,
                        principalTable: "EquipmentUnits",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_InventoryConfirmations_Inventories_InventoryId",
                        column: x => x.InventoryId,
                        principalTable: "Inventories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "InventoryUnresolvedUnits",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    InventoryId = table.Column<int>(type: "integer", nullable: false),
                    EquipmentUnitId = table.Column<int>(type: "integer", nullable: true),
                    TypeName = table.Column<string>(type: "text", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    SerialNumber = table.Column<string>(type: "text", nullable: false),
                    InventoryNumber = table.Column<string>(type: "text", nullable: true),
                    Note = table.Column<string>(type: "text", nullable: true),
                    LocationPath = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryUnresolvedUnits", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InventoryUnresolvedUnits_Inventories_InventoryId",
                        column: x => x.InventoryId,
                        principalTable: "Inventories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Inventories_IsActive",
                table: "Inventories",
                column: "IsActive",
                unique: true,
                filter: "\"IsActive\"");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryConfirmations_EquipmentUnitId",
                table: "InventoryConfirmations",
                column: "EquipmentUnitId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryUnresolvedUnits_InventoryId",
                table: "InventoryUnresolvedUnits",
                column: "InventoryId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "InventoryConfirmations");

            migrationBuilder.DropTable(
                name: "InventoryUnresolvedUnits");

            migrationBuilder.DropTable(
                name: "Inventories");
        }
    }
}
