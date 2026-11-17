# ТЗ для отдельного ИИ-программиста: HTTP API ZCAD

Статус: **проект для согласования владельцем, не утверждён**.
Передано на согласование в [PR #2](https://github.com/veb86/ZCAD_MCP_SERVER/pull/2).
Не приступать к доработке HTTPServer до утверждения. Реализация — собственная
ветка `veb86/zcadvelecAI` и отдельный PR. В MCP PR входит только документ.
Предложенные новые маршруты не реализованы и не используются мостом.

## Основание и архитектура

[Анализ с исходниками](httpserver-analysis.md) выявил отсутствие надёжного
discovery/PING, изоляции задач, определённого исхода timeout, структурированных
результатов и bounds. Существующие `/ipc`, widgets и Grist сохранить.
HTTP worker только валидирует/ставит задачу в очередь/читает состояние;
drawing и команды исполняет исключительно GUI-поток. MCP остаётся внешним клиентом.

## Этап A: минимальная совместимость

- Унифицировать регистрацию: исправить вызовы system/file/text на
  `RegisterHTTPIPCCommand` или согласовать публичный alias.
- Подключить system/PING в поддерживаемой сборке. Сохранить контракт:
  `POST /ipc {id,cmd:"PING",args:[]}` → `{id,status:"ok",result:"pong"}`.
- Проверить GUI idle → queue → handler → event → response с тем же id.
- Освобождать Cmd на всех ранних выходах, включая неверные args; документировать
  существующий timeout без ложной гарантии отмены.
- Проверить остановку/повторный запуск с активными запросами.

Приёмка A: чистая сборка; `npm run smoke` из MCP проходит на живом ZCAD без
правки MCP; неизвестная команда возвращает error; текущие клиенты не ломаются.

## Этап B: предлагаемый API для утверждения

Все тела UTF-8 JSON, `Content-Type: application/json`, ID — непрозрачная строка.
Маршруты ниже не являются текущим контрактом.

| Метод/маршрут | Формат |
| --- | --- |
| `GET /api/v1/health` | `{status:"ok",apiVersion:"1",queue:{depth,capacity},ready:true}`; различать HTTP и GUI readiness |
| `GET /api/v1/commands` | `{commands:[{name,inputSchema,readOnly,available}],nextCursor:null}`; только реальные handlers, stubs недоступны |
| `POST /api/v1/commands` | `{id,command:"PING",args:[],timeoutMs:30000}` → 202 `{id,jobId,state:"queued",statusUrl}` |
| `GET /api/v1/jobs/{jobId}` | `{id,jobId,state:"queued|running|succeeded|failed|cancelled|expired",result?,error?}` |
| `DELETE /api/v1/jobs/{jobId}` | 200 `{jobId,state:"cancelled"}` только после удаления из очереди; running без безопасной отмены → 409 |
| `GET /api/v1/jobs/{jobId}/result?cursor=...&limit=...` | `{items:[],nextCursor:null,total?}`; стабильный snapshot, bounds байт/элементов |

Малый result — JSON-значение, не JSON внутри строки; большой — resultRef и
страницы. Не пересылать весь drawing для сводки/страницы. Для файлов при
необходимости отдельно согласовать streaming download endpoint/media type.
Chunked encoding не заменяет пагинацию и bounds.

Ошибка: `{id?,error:{code:"UNKNOWN_COMMAND",message:"...",details?}}`.
HTTP 400 — синтаксис/схема, 401/403 — auth/доступ, 404 — неизвестный job,
409 — конфликт/невозможность cancel/повтор id с другими args, 413 — размер,
429 — очередь заполнена, 500 — server error, 503 — GUI недоступен/shutdown.
Уже принятая задача хранит операционную ошибку в состоянии failed.
Не возвращать stack trace и секреты.

## Асинхронность, очередь, таймауты, параллельность

- Ограничить body, клиентов, очередь, хранение и размер результатов.
  Предложение для согласования: body 1 МиБ, очередь 100, deadline 30 с, TTL 10 мин.
- Обрабатывать очередь в GUI порциями с бюджетом времени за tick, сохраняя
  порядок. Запретить доступ к drawing из workers.
- Разделить connect/read timeout, ожидание очереди, execution deadline и TTL.
  Deadline до старта → expired без исполнения. Для running без безопасного
  прерывания сохранить фактический исход и явно обозначить отсутствие отмены.
  Disconnect HTTP не означает cancel задачи.
- `id` + principal дают idempotency в пределах TTL: одинаковый запрос возвращает
  исходный job, другие args с тем же id → 409; после TTL документировать предел.
- Защитить state/results locks; на исключениях/ранних выходах освобождать ссылки.
- Изолировать глобальный batch по job/клиенту либо отклонять конфликтующие
  операции. Проверять реальный результат SAVE/EXPORT, а не только вызов команды.
- Shutdown: прекратить приём, вернуть 503 новым задачам, определить queued/running
  исходы, дождаться workers до уничтожения queue/locks.
- Проверять token/права до enqueue, loopback по умолчанию, CORS allowlist.
  Не логировать secrets/полные drawing payloads; metadata debug выключен по умолчанию.

## Затрагиваемые модули

- `IPCserver/uzvhttpserver.pas`: routes, HTTP статусы, auth, bounds, lifecycle.
- `IPCserver/uzvhttpipc.pas`: registry/schema, queue/jobs, ID, cancel, ownership.
- `IPCserver/uzvhttpcmdsystem.pas`: PING/health/capabilities.
- `uzvhttpcmdfile.pas`, `uzvhttpcmdtext.pas`: регистрация и действительные результаты.
- `uzvhttpcmdgeometry.pas`, `uzvhttpcmdinsertdev.pas`, `uzvhttpcmdbatch.pas`:
  capabilities/изоляция; ARC/POLYLINE не заявлять готовыми до реализации в ZCAD.
- `cad_source/zcad.pas`: подключение утверждённых handlers.
- `zcad/gui/uzcmainform.pas`: обработка queue в GUI с бюджетом времени.
- Upstream tests, HTTP API docs/config; TCP IPC/Flask/widgets/Grist не ломать.

## Приёмка B

1. Чистая сборка и реальные integration tests ZCAD; MCP SDK client получает
   tools, вызывает PING, получает коррелированный pong.
2. Безопасная CAD-операция на временном drawing подтверждена состоянием drawing;
   SAVE/EXPORT — фактическим содержимым файла и результатом исполнения.
3. Параллельные ID не смешивают ответы; повтор ID не создаёт вторую геометрию;
   конфликтные batches и заполненная очередь дают явные ошибки.
4. Схема/auth/malformed JSON/исключения/no drawing/GUI not ready, timeout до/после
   старта, cancel/disconnect покрыты конечными тестами с deadlines.
5. На ограниченных входах проверить memory/ownership/TTL и страницы без пропусков
   и дублей; не выполнять неограниченные stress-прогоны.
6. Shutdown под нагрузкой и restart без deadlock/use-after-free, GUI отвечает.
7. Старые `/ipc`, widgets, Grist и TCP clients проходят regression tests.

Утвердить этапы, routes, limits и auth до реализации. Документ не разрешает
изменения ZCAD в рамках MCP-проекта.
