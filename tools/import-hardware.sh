#!/bin/sh
# Одноразовый перенос данных из MySQL-дампа старого проекта Hardware в БД EquipmentTracker:
#   devicetypes  → EquipmentTypes
#   devicenames  → EquipmentNames
#   buildings → cabinets → complects → вложенные Locations (здание → кабинет → комплект)
#   devices      → EquipmentUnits (Serial, Inventory, Notes; поставщик не переносится — такого поля нет)
#
# Скрипт только печатает SQL в stdout, сам в БД ничего не пишет. Запуск на сервере из корня репозитория:
#   sh tools/import-hardware.sh dump-hardware.sql \
#     | docker compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
# (перед этим стоит сделать резервную копию). Всё выполняется одной транзакцией: при любой ошибке
# в БД не попадёт ничего.
#
# Импорт дополняет существующие данные и безопасен при повторном запуске:
#   - типы и наименования сопоставляются по названию (без учёта регистра и пробелов по краям);
#     уже существующие не дублируются;
#   - здание ищется среди корневых локаций, кабинет — внутри здания, комплект — внутри кабинета;
#   - техника, чей серийный номер уже есть в БД, пропускается (список выводится в NOTICE).
# Для созданных записей пишется история («Создание», автор — «импорт из Hardware»).
set -eu

if [ $# -ne 1 ] || [ ! -f "$1" ]; then
    echo "Использование: $0 <дамп Hardware (mysqldump)>" >&2
    exit 1
fi

cat <<'SQL'
\set ON_ERROR_STOP 1
BEGIN;

-- mysqldump экранирует кавычки и спецсимволы обратной косой чертой (\' \" \\ \n)
SET LOCAL standard_conforming_strings = off;
SET LOCAL escape_string_warning = off;

CREATE TEMP TABLE old_buildings   (id int PRIMARY KEY, name text NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE old_cabinets    (id int PRIMARY KEY, name text NOT NULL, building_id int NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE old_complects   (id int PRIMARY KEY, name text NOT NULL, cabinet_id int NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE old_devicetypes (id int PRIMARY KEY, name text NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE old_devicenames (id int PRIMARY KEY, name text NOT NULL, device_type_id int NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE old_devices     (id int PRIMARY KEY, serial text NOT NULL, inventory text, device_name_id int NOT NULL,
                                   complect_id int NOT NULL, device_provider_id int NOT NULL, notes text) ON COMMIT DROP;
SQL

# Порядок столбцов временных таблиц совпадает с таблицами дампа, поэтому INSERT ... VALUES берутся как есть
grep -E '^INSERT INTO `(buildings|cabinets|complects|devicetypes|devicenames|devices)` VALUES' "$1" \
    | sed -E 's/^INSERT INTO `([a-z]+)`/INSERT INTO old_\1/'

cat <<'SQL'

SET LOCAL standard_conforming_strings = on;

UPDATE old_buildings   SET name = btrim(name);
UPDATE old_cabinets    SET name = btrim(name);
UPDATE old_complects   SET name = btrim(name);
UPDATE old_devicetypes SET name = btrim(name);
UPDATE old_devicenames SET name = btrim(name);
UPDATE old_devices SET serial    = btrim(serial),
                       inventory = NULLIF(btrim(inventory), ''),
                       notes     = NULLIF(btrim(notes), '');

CREATE TEMP TABLE import_author ON COMMIT DROP AS SELECT 'импорт из Hardware'::text AS login, now() AS ts;

-- ---------- Типы ----------
WITH ins AS (
    INSERT INTO "EquipmentTypes" ("Name")
    SELECT o.name FROM old_devicetypes o
    WHERE NOT EXISTS (SELECT 1 FROM "EquipmentTypes" t WHERE lower(btrim(t."Name")) = lower(o.name))
    ORDER BY o.id
    RETURNING "Id", "Name")
INSERT INTO "HistoryEntries" ("EntityType", "EntityId", "Action", "ChangesJson", "AccountLogin", "TimestampUtc")
SELECT 'EquipmentType', ins."Id", 0, json_build_object('Id', ins."Id", 'Name', ins."Name")::text, a.login, a.ts
FROM ins CROSS JOIN import_author a;

CREATE TEMP TABLE map_type ON COMMIT DROP AS
SELECT DISTINCT ON (o.id) o.id AS old_id, t."Id" AS new_id
FROM old_devicetypes o JOIN "EquipmentTypes" t ON lower(btrim(t."Name")) = lower(o.name)
ORDER BY o.id, t."Id";

-- ---------- Наименования (уникальны глобально, поэтому существующее берётся как есть, даже если его тип другой) ----------
WITH ins AS (
    INSERT INTO "EquipmentNames" ("Name", "EquipmentTypeId")
    SELECT o.name, mt.new_id FROM old_devicenames o JOIN map_type mt ON mt.old_id = o.device_type_id
    WHERE NOT EXISTS (SELECT 1 FROM "EquipmentNames" n WHERE lower(btrim(n."Name")) = lower(o.name))
    ORDER BY o.id
    RETURNING "Id", "Name", "EquipmentTypeId")
INSERT INTO "HistoryEntries" ("EntityType", "EntityId", "Action", "ChangesJson", "AccountLogin", "TimestampUtc")
SELECT 'EquipmentName', ins."Id", 0,
       json_build_object('Id', ins."Id", 'EquipmentTypeId', ins."EquipmentTypeId", 'Name', ins."Name")::text, a.login, a.ts
FROM ins CROSS JOIN import_author a;

CREATE TEMP TABLE map_name ON COMMIT DROP AS
SELECT DISTINCT ON (o.id) o.id AS old_id, n."Id" AS new_id
FROM old_devicenames o JOIN "EquipmentNames" n ON lower(btrim(n."Name")) = lower(o.name)
ORDER BY o.id, n."Id";

DO $$
DECLARE r record;
BEGIN
    FOR r IN
        SELECT o.name, ot.name AS old_type, t."Name" AS new_type
        FROM old_devicenames o
        JOIN old_devicetypes ot ON ot.id = o.device_type_id
        JOIN map_name mn ON mn.old_id = o.id
        JOIN "EquipmentNames" n ON n."Id" = mn.new_id
        JOIN "EquipmentTypes" t ON t."Id" = n."EquipmentTypeId"
        WHERE lower(btrim(t."Name")) <> lower(ot.name)
    LOOP
        RAISE NOTICE 'Наименование "%" уже есть в БД с типом "%" (в Hardware — "%"), тип оставлен прежним',
            r.name, r.new_type, r.old_type;
    END LOOP;
END $$;

-- ---------- Локации: здания → кабинеты → комплекты ----------
-- Общая вставка уровня: создаёт недостающие дочерние локации и пишет историю
CREATE TEMP TABLE level_src (old_id int, name text, parent_id int) ON COMMIT DROP;
CREATE TEMP TABLE map_building (old_id int PRIMARY KEY, new_id int NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE map_cabinet  (old_id int PRIMARY KEY, new_id int NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE map_complect (old_id int PRIMARY KEY, new_id int NOT NULL) ON COMMIT DROP;

CREATE FUNCTION pg_temp.import_level() RETURNS TABLE (old_id int, new_id int) LANGUAGE sql AS $f$
    WITH ins AS (
        INSERT INTO "Locations" ("Name", "ParentLocationId")
        SELECT DISTINCT ON (s.name, s.parent_id) s.name, s.parent_id FROM level_src s
        WHERE NOT EXISTS (SELECT 1 FROM "Locations" l
                          WHERE l."ParentLocationId" IS NOT DISTINCT FROM s.parent_id
                            AND lower(btrim(l."Name")) = lower(s.name))
        ORDER BY s.name, s.parent_id, s.old_id
        RETURNING "Id", "Name", "ParentLocationId"),
    hist AS (
        INSERT INTO "HistoryEntries" ("EntityType", "EntityId", "Action", "ChangesJson", "AccountLogin", "TimestampUtc")
        SELECT 'Location', ins."Id", 0,
               json_build_object('Id', ins."Id", 'Name', ins."Name", 'ParentLocationId', ins."ParentLocationId")::text,
               a.login, a.ts
        FROM ins CROSS JOIN import_author a)
    -- Созданные строки ещё не видны в этом же запросе, поэтому сопоставление — и с ins, и с уже существовавшими
    SELECT DISTINCT ON (s.old_id) s.old_id, l.id
    FROM level_src s
    JOIN (SELECT "Id" AS id, "Name" AS name, "ParentLocationId" AS parent_id FROM ins
          UNION ALL
          SELECT "Id", "Name", "ParentLocationId" FROM "Locations") l
      ON l.parent_id IS NOT DISTINCT FROM s.parent_id AND lower(btrim(l.name)) = lower(s.name)
    ORDER BY s.old_id, l.id;
$f$;

INSERT INTO level_src SELECT id, name, NULL FROM old_buildings;
INSERT INTO map_building SELECT * FROM pg_temp.import_level();

TRUNCATE level_src;
INSERT INTO level_src SELECT c.id, c.name, mb.new_id FROM old_cabinets c JOIN map_building mb ON mb.old_id = c.building_id;
INSERT INTO map_cabinet SELECT * FROM pg_temp.import_level();

TRUNCATE level_src;
INSERT INTO level_src SELECT k.id, k.name, mc.new_id FROM old_complects k JOIN map_cabinet mc ON mc.old_id = k.cabinet_id;
INSERT INTO map_complect SELECT * FROM pg_temp.import_level();

-- ---------- Единицы техники ----------
DO $$
DECLARE skipped text[];
BEGIN
    SELECT array_agg(d.serial ORDER BY d.id) INTO skipped FROM old_devices d
    WHERE EXISTS (SELECT 1 FROM "EquipmentUnits" u WHERE lower(btrim(u."SerialNumber")) = lower(d.serial));
    IF skipped IS NOT NULL THEN
        RAISE NOTICE 'Пропущено единиц техники, чьи серийные номера уже есть в БД: % (первые: %)',
            cardinality(skipped), array_to_string(skipped[1:20], ', ');
    END IF;
END $$;

WITH ins AS (
    INSERT INTO "EquipmentUnits" ("EquipmentNameId", "SerialNumber", "InventoryNumber", "Note", "LocationId")
    SELECT mn.new_id, d.serial, d.inventory, d.notes, mk.new_id
    FROM old_devices d
    JOIN map_name mn ON mn.old_id = d.device_name_id
    JOIN map_complect mk ON mk.old_id = d.complect_id
    WHERE NOT EXISTS (SELECT 1 FROM "EquipmentUnits" u WHERE lower(btrim(u."SerialNumber")) = lower(d.serial))
    ORDER BY d.id
    RETURNING "Id", "EquipmentNameId", "InventoryNumber", "LocationId", "Note", "SerialNumber")
INSERT INTO "HistoryEntries" ("EntityType", "EntityId", "Action", "ChangesJson", "AccountLogin", "TimestampUtc")
SELECT 'EquipmentUnit', ins."Id", 0,
       json_build_object('Id', ins."Id", 'EquipmentNameId', ins."EquipmentNameId", 'InventoryNumber', ins."InventoryNumber",
                         'LocationId', ins."LocationId", 'Note', ins."Note", 'SerialNumber', ins."SerialNumber")::text,
       a.login, a.ts
FROM ins CROSS JOIN import_author a;

-- ---------- Итог ----------
SELECT 'Типы' AS "Что", (SELECT count(*) FROM old_devicetypes) AS "В дампе",
       (SELECT count(*) FROM "HistoryEntries" h, import_author a
        WHERE h."EntityType" = 'EquipmentType' AND h."AccountLogin" = a.login AND h."TimestampUtc" = a.ts) AS "Создано"
UNION ALL
SELECT 'Наименования', (SELECT count(*) FROM old_devicenames),
       (SELECT count(*) FROM "HistoryEntries" h, import_author a
        WHERE h."EntityType" = 'EquipmentName' AND h."AccountLogin" = a.login AND h."TimestampUtc" = a.ts)
UNION ALL
SELECT 'Локации (здания + кабинеты + комплекты)',
       (SELECT count(*) FROM old_buildings) + (SELECT count(*) FROM old_cabinets) + (SELECT count(*) FROM old_complects),
       (SELECT count(*) FROM "HistoryEntries" h, import_author a
        WHERE h."EntityType" = 'Location' AND h."AccountLogin" = a.login AND h."TimestampUtc" = a.ts)
UNION ALL
SELECT 'Единицы техники', (SELECT count(*) FROM old_devices),
       (SELECT count(*) FROM "HistoryEntries" h, import_author a
        WHERE h."EntityType" = 'EquipmentUnit' AND h."AccountLogin" = a.login AND h."TimestampUtc" = a.ts);

COMMIT;
SQL
