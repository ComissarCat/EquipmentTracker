# Учёт техники (EquipmentTracker)

Веб-приложение для учёта техники с иерархией локаций (здания → кабинеты → комплекты →
единицы техники), правами доступа, историей изменений и экспортом в Excel/QR.

## Стек

- **Backend**: ASP.NET Core 8 Web API, C#, EF Core (Npgsql), JWT-аутентификация, EPPlus 8
  (генерация Excel).
- **Frontend**: React 18 + TypeScript + Vite, react-router-dom, axios, qrcode (клиентская
  генерация QR как SVG).
- **БД**: PostgreSQL 16, в отдельном Docker-контейнере, без внешнего порта (изолирована).
- **Деплой**: docker-compose (три сервиса: db, backend, frontend/nginx), переменные — в `.env`
  (копия `.env.example`).

## Структура репозитория

```
backend/EquipmentTracker.Api/
  Models/          — Account, Role, AccountRole, Location, EquipmentType, EquipmentName,
                      EquipmentUnit, EditHistoryEntry
  Data/
    AppDbContext.cs     — DbContext; SaveChanges/SaveChangesAsync переопределены,
                           автоматически пишут историю изменений (кто/что/когда) для
                           Location/EquipmentType/EquipmentName/EquipmentUnit
    DbInitializer.cs    — сеет роли Operator/Administrator и дефолтного админа при старте
  Controllers/     — по одному на сущность + AuthController, HistoryController,
                      ExportController (Excel-отчёты через EPPlus)
  Dto/, Services/  — DTO-рекорды, JwtService, CurrentUserService
  Program.cs       — DI, JWT, CORS, политики авторизации "Operator"/"Administrator",
                      лицензия EPPlus (ExcelPackage.License.SetNonCommercialOrganization)

frontend/src/
  pages/           — MainPage (главная, две панели), ExportPage, EquipmentUnitDetailPage,
                      CatalogsPage, AdminAccountsPage, HistoryPage, LoginPage
  components/       — TreeExplorer (дерево с drag-and-drop и мультивыбором Shift/Ctrl),
                      ExportTree (дерево с чекбоксами), QrPrintView, InventoryCardsModal
  utils/           — locationTree.ts (обход иерархии локаций), download.ts
  api/client.ts    — axios-инстанс с JWT-интерцептором
```

## Ключевые архитектурные решения (важно не сломать при доработках)

- **Locations — единая таблица** для всей иерархии (здание/кабинет/комплект — в старом
  проекте были отдельными таблицами; тут это просто `Location` с `ParentLocationId`,
  произвольная глубина вложенности).
- **`EquipmentUnit.LocationId` обязателен** (не nullable) — у единицы техники всегда есть
  текущая локация. Это осознанно изменили в процессе разработки, не делать nullable обратно.
- **Справочники ремонта**: `RepairOperation` (название) и `SparePart` (название + `Quantity`).
  Права на количество: Operator — только пополнение (`POST /api/spare-parts/{id}/add-stock`,
  Amount > 0) и начальное количество при создании; Administrator — прямая установка
  (`PUT /{id}/quantity`, любое значение, в т.ч. отрицательное) и удаление. Все изменения попадают в историю. Таблицы создаёт миграция `AddRepairCatalogs`.
- **Ремонты** (`Repair` + `RepairOperationItem`, `RepairsController`,
  `POST/GET /api/equipment-units/{id}/repairs`): фиксирует Operator+, обязательна ≥1 операция
  (части и примечание опциональны). Автор хранится снимком (`AccountLogin`). Удаление единицы
  техники каскадно удаляет её ремонты; операции, использованные в ремонтах, удалить нельзя.
- **Списания расходных частей — ОДНА таблица `SparePartWriteOff`** (SparePartId, Quantity,
  RepairId ИЛИ IssueId; CHECK гарантирует ровно одно основание). Основания: `Repair` и
  `SparePartIssue` (выдача не в ремонт: дата, кому — текст, кем — аккаунт снимком;
  `POST /api/spare-part-issues`). Вся логика списания — в `Services/SparePartWriteOffs`
  (общая для ремонта и выдачи): в одной транзакции, наличие НЕ проверяется — остаток может стать
  отрицательным (так задумано). История списаний — `GET /api/spare-part-write-offs`
  (фильтры: часть/основание/даты, постранично), страница «Списания» (Operator+). Administrator может
  изменить строку (`PUT`, часть/количество > 0) или отменить (`DELETE`): разница/всё списанное
  возвращается на склад; выдача без строк удаляется. Часть, по которой
  есть списания, удалить нельзя. В самих `Repair`/`SparePartIssue` истории редактирования нет —
  она есть у `SparePart` (там видно изменение остатка).
  Administrator также может изменить/удалить ремонт (`PUT/DELETE /api/equipment-units/{id}/repairs/{repairId}`)
  и выдачу (`GET/PUT/DELETE /api/spare-part-issues/{id}`): части заменяются целиком, остатки меняются
  на разницу «было − стало» (логика — `SparePartWriteOffs.ReplaceAsync/ReturnAll`, общая для обоих);
  удаление возвращает всё списанное. Автор и `CreatedUtc` не меняются, кто/когда правил —
  `ModifiedUtc/ModifiedByLogin` у `Repair` и `SparePartIssue`.
- **Инвентаризация** (`Inventory`, `InventoryConfirmation`, `InventoryUnresolvedUnit`,
  `InventoriesController`, `Services/InventoryQueries`): одна идущая одновременно — уникальный
  частичный индекс по `Inventory.IsActive`. Пока идёт — «всего/подтверждено» считаются по живым данным
  (новая техника = неподтверждённая, удаление техники каскадно убирает её подтверждение). При остановке
  (Administrator) итоги замораживаются: `FinalTotalUnits/FinalConfirmedUnits` + снимок неподтверждённой
  техники (без FK на технику). Подтверждает Operator+ (`POST /api/inventories/active/confirm`, единицы и/или
  локации целиком); отмена — `POST /api/inventories/active/unconfirm` (Operator+, только идущая). Индикация во фронтенде — `useActiveInventory`, `TreeExplorer.confirmedUnitIds`.
  Выгрузка неподтверждённой техники — `GET /api/export/inventories/{id}/unresolved` (общий
  `BuildListWorkbook` с экспортом списка техники).
- **Уникальность**: `Account.Login`, `EquipmentType.Name`, `EquipmentName.Name` (глобально, не
  в пределах типа), `EquipmentUnit.SerialNumber` — везде проверяется и в контроллере (понятная
  ошибка), и как индекс в БД.
- **Права доступа**: анонимного доступа НЕТ — `FallbackPolicy`/`DefaultPolicy` в `Program.cs` =
  политика "Viewer" (любая из ролей Viewer/Operator/Administrator), поэтому эндпоинт без атрибута
  тоже закрыт; открыт только `AuthController.Login` (`[AllowAnonymous]`). Роль `Viewer` («Только
  чтение») — просмотр всех страниц и экспорт; изменения — Operator или Administrator (политика
  "Operator"); учётные записи, прямая установка остатка, удаление частей, правка/отмена списаний —
  только Administrator. Новые контроллеры не должны получать `[AllowAnonymous]`. Есть защита от
  блокировки самого себя: нельзя удалить свою же учётную запись, нельзя оставить систему без
  единого администратора (см. `AccountsController`). Роли в JWT — только снимок: при каждом
  запросе `JwtBearerEvents.OnTokenValidated` (`Program.cs`) сверяет токен с БД и подставляет
  актуальные роли, так что снятие/выдача ролей действует сразу. Смена пароля меняет
  `Account.SecurityStamp` (claim `stamp`) — старые токены отзываются. Фронтенд при загрузке
  обновляет роли через `GET /api/auth/me` (политика "Authenticated" — доступна и без ролей). Общий список ремонтов —
  `GET /api/repairs` (`AllRepairsController`, поиск ILIKE по словам, только просмотр).
- **История изменений** пишется автоматически на уровне `AppDbContext`, не в контроллерах —
  при доработке новых полей это не требует ручных правок в каждом эндпоинте. Изменение и
  история сохраняются двумя `SaveChanges` в одной транзакции (своей или уже открытой вызывающим).
- **Инвентаризация и конкуренция**: подтверждение/отмена держат `FOR SHARE` на строке идущей
  инвентаризации, остановка — `FOR UPDATE`, поэтому итоги не «плывут» от подтверждений во время остановки.
- **Схема БД — EF-миграции** (`Migrations/`), применяются через `MigrateAsync()` в
  `DbInitializer`. БД, созданная ранее через `EnsureCreated`, автоматически «базлайнится»:
  `InitialCreate` помечается применённой без изменения данных (`BaselineLegacyDatabaseAsync`).
  Менять модель — только с новой миграцией (`dotnet ef migrations add ...`); для `dotnet ef`
  есть `DesignTimeDbContextFactory` (подключение к БД не требуется).
- **Инвентарные карточки и обычный список Excel** — почти дословный порт из старого
  Winforms-проекта (github.com/ComissarCat/Hardware, `ExportManager.cs`) под EPPlus, включая
  специфичные для организации константы (ОКУД, ОКПО, название учреждения) — вынесены в
  конфиг `Export:OrganizationName`/`Export:OkpoCode` (appsettings.json / `.env`), не хардкод.
- Данные текущей БД **мигрированы** из той же старой системы одноразовым SQL-скриптом
  (buildings/cabinets/complects/devices → единая иерархия Locations + EquipmentUnits).

## Резервное копирование

Сервис `backup` в docker-compose (`/backup`: Dockerfile, backup.sh, entrypoint.sh): раз в сутки
pg_dump → gzip → age (шифрование ПУБЛИЧНЫМ ключом из `BACKUP_AGE_PUBLIC_KEY`, приватный ключ
хранится вне сервера) → том `backup-data` + выгрузка на Яндекс Диск по WebDAV (rclone, конфиг
целиком из env: `BACKUP_WEBDAV_*`, папка — `BACKUP_REMOTE_DIR`). Настройка/восстановление — в
README. Если BACKUP_* не заданы вовсе — контейнер простаивает (штатно), при частичной настройке падает с понятной ошибкой. При сбое запланированной копии шлётся письмо (`notify.sh`, SMTP из `BACKUP_SMTP_*`,
получатели `BACKUP_NOTIFY_TO`), после восстановления — письмо «снова работает». Скрипты `*.sh` должны быть с LF (`.gitattributes`), иначе в контейнере ломается shebang.

## Как это разворачивается

```bash
cp .env.example .env      # заполнить пароли/секреты
docker compose up --build -d
```
Наружу публикуется только frontend (nginx) на `:80` (`FRONTEND_PORT`). Backend (`:8080`)
доступен лишь внутри docker-сети: nginx проксирует `/api/` на `backend:8080`, браузер работает
с одним origin, поэтому адрес сервера нигде прописывать не нужно, а CORS в проде не задействован.
В dev (`npm run dev`) то же делает прокси Vite на `localhost:8080`.

## Тестирование перед коммитом

- Backend компилируется через `dotnet build` в `backend/EquipmentTracker.Api` — **важно
  проверять реально**, NuGet может быть недоступен в некоторых средах разработки.
- Frontend: `cd frontend && npm run build` (tsc + vite) — ловит опечатки/несуществующие
  импорты до деплоя.
