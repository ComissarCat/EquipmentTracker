using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EquipmentTracker.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddRepairIssueModifiedInfo : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ModifiedByLogin",
                table: "SparePartIssues",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ModifiedUtc",
                table: "SparePartIssues",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ModifiedByLogin",
                table: "Repairs",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ModifiedUtc",
                table: "Repairs",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ModifiedByLogin",
                table: "SparePartIssues");

            migrationBuilder.DropColumn(
                name: "ModifiedUtc",
                table: "SparePartIssues");

            migrationBuilder.DropColumn(
                name: "ModifiedByLogin",
                table: "Repairs");

            migrationBuilder.DropColumn(
                name: "ModifiedUtc",
                table: "Repairs");
        }
    }
}
