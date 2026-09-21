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
- **Уникальность**: `Account.Login`, `EquipmentType.Name`, `EquipmentName.Name` (глобально, не
  в пределах типа), `EquipmentUnit.SerialNumber` — везде проверяется и в контроллере (понятная
  ошибка), и как индекс в БД.
- **Права доступа**: чтение — анонимно; создание/редактирование/удаление техники и
  локаций/справочников — роль Operator или Administrator; учётные записи — только
  Administrator. Есть защита от блокировки самого себя: нельзя удалить свою же учётную
  запись, нельзя оставить систему без единого администратора (см. `AccountsController`).
- **История изменений** пишется автоматически на уровне `AppDbContext`, не в контроллерах —
  при доработке новых полей это не требует ручных правок в каждом эндпоинте.
- **⚠️ Схема БД создаётся через `EnsureCreatedAsync()`, а не EF-миграциями** — временное
  решение. Если нужно менять схему без потери данных, сначала сгенерировать нормальную
  миграцию (`dotnet ef migrations add ...`) и заменить `EnsureCreatedAsync` на
  `MigrateAsync` в `DbInitializer.cs`.
- **Инвентарные карточки и обычный список Excel** — почти дословный порт из старого
  Winforms-проекта (github.com/ComissarCat/Hardware, `ExportManager.cs`) под EPPlus, включая
  специфичные для организации константы (ОКУД, ОКПО, название учреждения) — вынесены в
  конфиг `Export:OrganizationName`/`Export:OkpoCode` (appsettings.json / `.env`), не хардкод.
- Данные текущей БД **мигрированы** из той же старой системы одноразовым SQL-скриптом
  (buildings/cabinets/complects/devices → единая иерархия Locations + EquipmentUnits).

## Как это разворачивается

```bash
cp .env.example .env      # заполнить пароли/секреты
docker compose up --build -d
```
Backend слушает `:8080` (переменная `BACKEND_PORT`), frontend (nginx) — `:80`
(`FRONTEND_PORT`). `FRONTEND_API_BASE_URL` (адрес API, видимый браузеру) и `FRONTEND_ORIGIN`
(для CORS на бэкенде) должны соответствовать реальному адресу сервера, не `localhost`, если
разворачивается не локально.

## Тестирование перед коммитом

- Backend компилируется через `dotnet build` в `backend/EquipmentTracker.Api` — **важно
  проверять реально**, NuGet может быть недоступен в некоторых средах разработки.
- Frontend: `cd frontend && npm run build` (tsc + vite) — ловит опечатки/несуществующие
  импорты до деплоя.
