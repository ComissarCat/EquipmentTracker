using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace EquipmentTracker.Api.Migrations
{
    /// <inheritdoc />
    public partial class UnifySparePartWriteOffs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SparePartIssues",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    Recipient = table.Column<string>(type: "text", nullable: false),
                    AccountId = table.Column<int>(type: "integer", nullable: true),
                    AccountLogin = table.Column<string>(type: "text", nullable: false),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SparePartIssues", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SparePartWriteOffs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    SparePartId = table.Column<int>(type: "integer", nullable: false),
                    Quantity = table.Column<int>(type: "integer", nullable: false),
                    RepairId = table.Column<int>(type: "integer", nullable: true),
                    IssueId = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SparePartWriteOffs", x => x.Id);
                    table.CheckConstraint("CK_SparePartWriteOffs_Source", "(\"RepairId\" IS NOT NULL AND \"IssueId\" IS NULL) OR (\"RepairId\" IS NULL AND \"IssueId\" IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_SparePartWriteOffs_Repairs_RepairId",
                        column: x => x.RepairId,
                        principalTable: "Repairs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SparePartWriteOffs_SparePartIssues_IssueId",
                        column: x => x.IssueId,
                        principalTable: "SparePartIssues",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SparePartWriteOffs_SpareParts_SparePartId",
                        column: x => x.SparePartId,
                        principalTable: "SpareParts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SparePartIssues_Date",
                table: "SparePartIssues",
                column: "Date");

            migrationBuilder.CreateIndex(
                name: "IX_SparePartWriteOffs_IssueId",
                table: "SparePartWriteOffs",
                column: "IssueId");

            migrationBuilder.CreateIndex(
                name: "IX_SparePartWriteOffs_RepairId",
                table: "SparePartWriteOffs",
                column: "RepairId");

            migrationBuilder.CreateIndex(
                name: "IX_SparePartWriteOffs_SparePartId",
                table: "SparePartWriteOffs",
                column: "SparePartId");

            // Переносим уже зафиксированные списания ремонтов в единую таблицу и только потом
            // удаляем старую — данные не теряются.
            migrationBuilder.Sql("""
                INSERT INTO "SparePartWriteOffs" ("SparePartId", "Quantity", "RepairId")
                SELECT "SparePartId", "Quantity", "RepairId" FROM "RepairPartItem";
                """);

            migrationBuilder.DropTable(
                name: "RepairPartItem");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "RepairPartItem",
                columns: table => new
                {
                    RepairId = table.Column<int>(type: "integer", nullable: false),
                    SparePartId = table.Column<int>(type: "integer", nullable: false),
                    Quantity = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RepairPartItem", x => new { x.RepairId, x.SparePartId });
                    table.ForeignKey(
                        name: "FK_RepairPartItem_Repairs_RepairId",
                        column: x => x.RepairId,
                        principalTable: "Repairs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_RepairPartItem_SpareParts_SparePartId",
                        column: x => x.SparePartId,
                        principalTable: "SpareParts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_RepairPartItem_SparePartId",
                table: "RepairPartItem",
                column: "SparePartId");

            // Возвращаем списания ремонтов в старую таблицу (выдачи в ней хранить негде — теряются);
            // если одна часть списана в ремонте несколькими строками, суммируем.
            migrationBuilder.Sql("""
                INSERT INTO "RepairPartItem" ("RepairId", "SparePartId", "Quantity")
                SELECT "RepairId", "SparePartId", SUM("Quantity") FROM "SparePartWriteOffs"
                WHERE "RepairId" IS NOT NULL GROUP BY "RepairId", "SparePartId";
                """);

            migrationBuilder.DropTable(
                name: "SparePartWriteOffs");

            migrationBuilder.DropTable(
                name: "SparePartIssues");
        }
    }
}
