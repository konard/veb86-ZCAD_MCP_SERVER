# Анализ существующего HTTPServer ZCAD

Проверено 17.11.2026 по исходникам
[`veb86/zcadvelecAI@cf9027df9d39b29854bf162608623f7b13150a67`](https://github.com/veb86/zcadvelecAI/tree/cf9027df9d39b29854bf162608623f7b13150a67/cad_source/zcad/velec/IPCserver).
Это анализ исходного кода, а не испытание запущенного ZCAD. README каталога
описывает прежде всего **TCP IPC**, а Flask-пример не является HTTPServer ZCAD.

## Реальный контракт

| Возможность | Исходный код | Использование в MCP |
| --- | --- | --- |
| `HTTPStart [host] [port]`, `HTTPStop`, `HTTPStatus`; defaults `127.0.0.1:5000` | [`uzvhttpserver.pas`](https://github.com/veb86/zcadvelecAI/blob/cf9027df9d39b29854bf162608623f7b13150a67/cad_source/zcad/velec/IPCserver/uzvhttpserver.pas) | ZCAD запускается отдельно |
| `GET /ipc` → 200, `{"status":"ok","message":"ZCAD HTTP server is available"}` | [`HandleRequest`](https://github.com/veb86/zcadvelecAI/blob/cf9027df9d39b29854bf162608623f7b13150a67/cad_source/zcad/velec/IPCserver/uzvhttpserver.pas#L467) | `zcad_health`, не проверяет очередь/чертёж |
| `POST /ipc`, JSON `{"id":"UUID","cmd":"LINE","args":[0,0,100,100],"token":"optional"}` | [`HTTPIPCExecuteJSON`](https://github.com/veb86/zcadvelecAI/blob/cf9027df9d39b29854bf162608623f7b13150a67/cad_source/zcad/velec/IPCserver/uzvhttpipc.pas#L991) | `zcad_execute`, точные позиционные args |
| Успех: `{"id":"UUID","status":"ok","result":"строка"}`; пустой result может отсутствовать | [ответ](https://github.com/veb86/zcadvelecAI/blob/cf9027df9d39b29854bf162608623f7b13150a67/cad_source/zcad/velec/IPCserver/uzvhttpipc.pas#L919) | Строка сохраняется без повторного JSON-декодирования |
| Ошибка: `{"id":"UUID","status":"error","error":"описание"}`; ранние ошибки могут иметь пустой id | [ошибки](https://github.com/veb86/zcadvelecAI/blob/cf9027df9d39b29854bf162608623f7b13150a67/cad_source/zcad/velec/IPCserver/uzvhttpipc.pas#L870) | MCP `isError: true` |

Ошибки команд обычно имеют HTTP 200. Пустое POST-тело → 400; иной метод
`/ipc` → 405; неизвестный маршрут → 404; исключение → 500. Проверяются
HTTP-статус и JSON-конверт. Есть `OPTIONS` (204), `/widgets`, `/widgets/*`,
`/grist/*` (включая poll/ack). Эти GUI/Grist-маршруты не являются универсальным
CAD API. Мост не использует их или вымышленные `/api/*`, TCP/Flask fallback.

## Выполнение и параллельность

`TFPHttpServer.Threaded := True`. Dispatcher нормализует имя команды, находит
handler и помещает объект с клоном args в очередь с `TCriticalSection`.
HTTP-поток ждёт `TEvent` максимум **30000 мс**.
[`uzcmainform.pas:1396`](https://github.com/veb86/zcadvelecAI/blob/cf9027df9d39b29854bf162608623f7b13150a67/cad_source/zcad/gui/uzcmainform.pas#L1396)
вызывает `HTTPIPCProcessPendingCommands` из GUI idle: очередь действительно
подключена к главному потоку. MCP не заменяет эту очередь.

После timeout объект остаётся в очереди и **может выполниться позже**. Отмена
fetch или отключение клиента этого не меняют. Поэтому автоповторов в мосте нет;
timeout/cancel сообщают о неопределённом исходе. Default timeout моста 35 с
позволяет получить ответ о 30-секундном timeout ZCAD.

Текущий `/ipc` возвращает целиком один JSON. Нет пагинации/ссылок на результаты.
Адаптер читает HTTP chunks с лимитом размера; chunked encoding не создаёт
пагинацию. Большие массивы мост сам не запрашивает.

## Проверенные ограничения

1. [`zcad.pas:333–340`](https://github.com/veb86/zcadvelecAI/blob/cf9027df9d39b29854bf162608623f7b13150a67/cad_source/zcad.pas#L333)
   подключает HTTP server/dispatcher, geometry, insertdev, testgrist.
   system/file/text/batch в этом списке отсутствуют. Файл модуля не доказывает
   наличие его команд в конкретной сборке.
2. [`uzvhttpcmdsystem.pas:111`](https://github.com/veb86/zcadvelecAI/blob/cf9027df9d39b29854bf162608623f7b13150a67/cad_source/zcad/velec/IPCserver/uzvhttpcmdsystem.pas#L111),
   file/text вызывают `HTTPIPCRegisterCommand`, но dispatcher экспортирует
   `RegisterHTTPIPCCommand` без такого alias. Простое подключение этих модулей
   потребует upstream правки. Работающий PING в текущей конфигурации не доказан.
3. LINE/CIRCLE/INSERT_DEV имеют handlers; ARC/POLYLINE в
   [`uzvhttpcmdgeometry.pas:507–559`](https://github.com/veb86/zcadvelecAI/blob/cf9027df9d39b29854bf162608623f7b13150a67/cad_source/zcad/velec/IPCserver/uzvhttpcmdgeometry.pas#L507)
   возвращают «not implemented yet». Нельзя реализовать их внутри MCP.
4. Нет version/discovery/schema, job status, cancel, idempotency. Повтор id
   не предотвращает повторное выполнение. Очередь не ограничена, обработка
   всей очереди за tick может задержать GUI.
5. Token читается/сохраняется, но HTTP dispatcher его не проверяет. CORS `*`
   не авторизация; в HTTP-лог выводятся тела запросов/ответов. TCP token не
   доказывает защищённость HTTP API.
6. Batch-состояние глобальное. SAVE вызывает QSave, имя аргумента не меняет путь;
   сообщения SAVE/EXPORT не доказывают реальный успех завершения записи файла.
7. В `HTTPIPCExecuteJSON` неверный тип args выходит после создания Cmd до
   освобождения HTTP-ссылки: возможная утечка. Мост передаёт массив, но это
   не исправление dispatcher для прочих клиентов.
8. Shutdown требует испытания живой сборкой: запрос остановки HTTP не доказывает
   ожидание всех handlers перед уничтожением queue/locks.

Health и точный POST pass-through применимы без изменений кода ZCAD для реально
зарегистрированных команд. Для полного PING-сценария нужна запущенная сборка
с PING. Такой сборки/endpoint в среде разработки нет; тесты используют HTTP fixture.

[Отдельное ТЗ](httpserver-spec.md) передано на согласование с PR #2.
Статус: **проект, не утверждено**. ZCAD не изменён. Предложенные маршруты
мост не вызывает. Live-приёмка остаётся незавершённой до фактического прогона.
