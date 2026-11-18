# DeskPanel на мини-ПК с Windows Home: пошаговая инструкция

Все команды выполняются из PowerShell, совместимы со встроенным Windows PowerShell 5.1. Начало — из обычной командной строки. Установка и настройка Windows/DeskPanel выполняются командами; подтверждения UAC, окно удалённого подключения и два действия в Fully остаются интерактивными.

Порядок: один раз подготовить мини-ПК → подключиться с ноутбука через RustDesk → продолжить установку на мини-ПК из удалённого окна → подключить ноутбук, ПК и телефон. Блоки выполняй по одному. При ошибке остановись на этом блоке.

## 1. На мини-ПК: открыть PowerShell

Открой командную строку и выполни:

```cmd
%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile
```

Если приглашение начинается с `PS`, PowerShell работает. Windows Home обычно уже содержит версию 5.1; PowerShell 7 для этой инструкции не требуется.

Проверь:

```powershell
$PSVersionTable.PSVersion
```

Если Windows сообщает, что файл не найден, проверь именно полный путь выше. Для установки отдельного PowerShell 7 используй официальный MSI из раздела Assets по адресу ниже: `win-x64.msi` для Intel/AMD x64 либо `win-arm64.msi` для ARM64. Архитектуру можно узнать в командной строке через `echo %PROCESSOR_ARCHITECTURE%` (`AMD64` / `ARM64`). Установщик запускается из командной строки: `msiexec.exe /i "полный-путь-к-скачанному.msi"`. Это резервный маршрут, для обычной Windows Home достаточно встроенного файла.

https://github.com/PowerShell/PowerShell/releases/latest

## 2. Удалённое управление: RustDesk

Windows Home не принимает подключения встроенного Remote Desktop/RDP. Используем RustDesk с прямым подключением внутри домашней сети. Установщик берём из официального GitHub-релиза, проверяем его SHA-256. На мини-ПК RustDesk будет работать как служба и принимать подключения по постоянному паролю.

### 2.1. Установить RustDesk на мини-ПК

В открытом PowerShell запусти окно администратора:

```powershell
Start-Process -FilePath powershell.exe -Verb RunAs -ArgumentList '-NoProfile'
```

Подтверди запрос Windows. Следующие блоки раздела 2 выполняй **в новом окне администратора**, под той же учётной записью, которой пользуешься на мини-ПК.

```powershell
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$taskArchitecture = (Get-CimInstance Win32_Processor | Select-Object -First 1).Architecture
$taskRustArch = switch ($taskArchitecture) {
    9 { 'x86_64' }
    12 { 'aarch64' }
    default { throw 'Эта инструкция рассчитана на Windows x64 или ARM64.' }
}

$taskRustVersion = '1.5.3'
$taskRelease = Invoke-RestMethod -Uri "https://api.github.com/repos/rustdesk/rustdesk/releases/tags/$taskRustVersion"
$taskAssetName = 'rustdesk-{0}-{1}.exe' -f $taskRustVersion, $taskRustArch
$taskAsset = @($taskRelease.assets | Where-Object { $_.name -eq $taskAssetName })
if ($taskAsset.Count -ne 1) { throw 'Официальный установщик не найден.' }
if ($taskAsset[0].digest -notmatch '^sha256:[0-9a-fA-F]{64}$') { throw 'У релиза нет проверяемой SHA-256.' }

$taskInstaller = Join-Path $env:TEMP $taskAssetName
Invoke-WebRequest -UseBasicParsing -Uri $taskAsset[0].browser_download_url -OutFile $taskInstaller
$taskActualHash = (Get-FileHash -LiteralPath $taskInstaller -Algorithm SHA256).Hash
$taskExpectedHash = $taskAsset[0].digest.Substring(7)
if ($taskActualHash -ne $taskExpectedHash) { throw 'Контрольная сумма не совпала. Установка остановлена.' }

$taskInstallProcess = Start-Process -FilePath $taskInstaller -ArgumentList '--silent-install' -WindowStyle Hidden -Wait -PassThru
if ($taskInstallProcess.ExitCode -ne 0) { throw 'Установщик RustDesk завершился с ошибкой.' }

$taskRustDesk = Join-Path $env:ProgramFiles 'RustDesk\rustdesk.exe'
if (!(Test-Path -LiteralPath $taskRustDesk)) { throw 'После установки не найден rustdesk.exe.' }
if (!(Get-Service -Name RustDesk -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath $taskRustDesk -ArgumentList '--install-service' -WindowStyle Hidden -Wait
}
Set-Service -Name RustDesk -StartupType Automatic
Start-Service -Name RustDesk
Get-Service -Name RustDesk | Select-Object Name, Status, StartType
```

Ожидается `Running` и `Automatic`. Версия 1.5.3 и имена файлов проверены при подготовке инструкции; автоматического скачивания произвольного изменившегося релиза здесь нет.

### 2.2. Задать пароль и включить прямое подключение

Задай отдельный длинный пароль для RustDesk. В этом блоке разрешены латинские буквы, цифры, `_` и `-`, минимум 20 символов — это исключает проблемы передачи кавычек и пробелов из PowerShell 5.1. Сохрани его в своём менеджере паролей. Ввод скрыт, в команду пароль вставлять не нужно.

```powershell
$taskSecurePassword = Read-Host 'Новый пароль RustDesk, минимум 20 символов' -AsSecureString
$taskPasswordPointer = [IntPtr]::Zero
$taskPlainPassword = $null
try {
    $taskPasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecurePassword)
    $taskPlainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPasswordPointer)
    if ($taskPlainPassword -notmatch '^[A-Za-z0-9_-]{20,128}$') {
        throw 'Нужны 20-128 символов: латиница, цифры, _ или -.'
    }
    $taskPasswordResult = (& $taskRustDesk --password $taskPlainPassword | Out-String).Trim()
    if ($taskPasswordResult -notmatch 'Done!') { throw 'RustDesk не подтвердил сохранение пароля.' }
} finally {
    $taskPlainPassword = $null
    $taskPasswordResult = $null
    if ($taskPasswordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPasswordPointer)
    }
    $taskSecurePassword.Dispose()
}

& $taskRustDesk --option approve-mode password
& $taskRustDesk --option verification-method use-permanent-password
& $taskRustDesk --option direct-server Y
& $taskRustDesk --option direct-access-port 21118
```

Это даёт доступ к мини-ПК по заданному паролю без принятия каждого подключения человеком у его экрана. RustDesk передаёт пароль своему CLI на время команды; введённое значение не попадает в историю PowerShell.

### 2.3. Открыть доступ из домашней сети

В том же окне администратора:

```powershell
Get-NetConnectionProfile | Format-Table InterfaceIndex, InterfaceAlias, Name, NetworkCategory
$taskHomeInterface = [int](Read-Host 'InterfaceIndex домашнего Ethernet или Wi-Fi из таблицы')
$taskProfile = Get-NetConnectionProfile -InterfaceIndex $taskHomeInterface
if ($taskProfile.NetworkCategory -eq 'DomainAuthenticated') { throw 'Выбери домашнее подключение.' }
Set-NetConnectionProfile -InterfaceIndex $taskHomeInterface -NetworkCategory Private

$taskRustRule = @{
    Name = 'DeskPanel-RustDesk-LAN'
    DisplayName = 'DeskPanel: RustDesk LAN 21118'
    Direction = 'Inbound'
    Action = 'Allow'
    Protocol = 'TCP'
    LocalPort = 21118
    Program = $taskRustDesk
    Profile = 'Private'
    RemoteAddress = 'LocalSubnet'
}
if (Get-NetFirewallRule -Name $taskRustRule.Name -ErrorAction SilentlyContinue) {
    $taskRustRule.Remove('DisplayName')
    Set-NetFirewallRule @taskRustRule -Enabled True | Out-Null
} else {
    New-NetFirewallRule @taskRustRule | Out-Null
}
Restart-Service -Name RustDesk

$taskMiniPcAddresses = @(Get-NetIPAddress -InterfaceIndex $taskHomeInterface -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -ne '127.0.0.1' })
$taskMiniPcAddresses | Select-Object InterfaceAlias, IPAddress
Get-NetTCPConnection -State Listen -LocalPort 21118 -ErrorAction SilentlyContinue | Select-Object LocalAddress, LocalPort
```

Запиши IPv4 мини-ПК. Например, `192.168.0.150` — только пример; дальше вводи адрес из своей таблицы. При отсутствии слушателя подожди несколько секунд и повтори последнюю команду. Порты в роутере для этой схемы открывать не требуется.

### 2.4. Подключиться с ноутбука

На ноутбуке установи RustDesk тем же **блоком 2.1**. Пароль, службу приёма и прямой доступ хоста ты уже настроил на мини-ПК.

В обычном PowerShell **на ноутбуке**:

```powershell
$taskRustDesk = Join-Path $env:ProgramFiles 'RustDesk\rustdesk.exe'
$taskMiniPcIp = (Read-Host 'IPv4 мини-ПК из предыдущего шага').Trim()
Test-NetConnection -ComputerName $taskMiniPcIp -Port 21118
& $taskRustDesk --connect ('{0}:21118' -f $taskMiniPcIp)
```

Ожидается `TcpTestSucceeded : True`. Откроется окно подключения: введи постоянный пароль RustDesk. При прямом подключении используй IP и порт, а не публичный RustDesk ID. После появления рабочего стола мини-ПК оставшиеся шаги установки выполняй в PowerShell **внутри его удалённого рабочего стола**.

Если экран чёрный, сначала оставь монитор мини-ПК подключённым и включённым. Работа полностью без дисплея зависит от видеодрайвера; виртуальный дисплей или HDMI-заглушка могут потребоваться отдельно. Сначала проверь обычную рабочую сессию.

## 3. На мини-ПК: установить Git и Node.js

Вернись в обычный PowerShell под пользователем, который будет запускать хаб. Проверь:

```powershell
winget --version
```

Если `winget` не найден, попробуй зарегистрировать уже установленный App Installer:

```powershell
Add-AppxPackage -RegisterByFamilyName -MainPackage Microsoft.DesktopAppInstaller_8wekyb3d8bbwe
```

Открой новое обычное окно PowerShell и снова проверь `winget --version`. Если App Installer отсутствует полностью, нужен его официальный установщик и зависимости; не продолжай установку командой, которая сейчас не распознаётся. Официальный маршрут восстановления WinGet:

https://learn.microsoft.com/windows/package-manager/winget/

Установи пакеты:

```powershell
winget install --id Git.Git --exact --source winget --accept-source-agreements --accept-package-agreements
winget install --id OpenJS.NodeJS.LTS --exact --source winget --accept-source-agreements --accept-package-agreements
```

Если программа уже установлена, проверь её версию. После установки закрой это окно и открой новое обычное окно PowerShell, чтобы подхватить PATH:

```powershell
git --version
node --version
npm.cmd --version
```

Node.js должен быть не ниже 22.13. Используется `npm.cmd`, чтобы политика запуска PowerShell-скриптов не мешала `npm.ps1`.

## 4. На мини-ПК: скачать DeskPanel

```powershell
$ErrorActionPreference = 'Stop'
$taskDocuments = [Environment]::GetFolderPath('MyDocuments')
$taskProjects = Join-Path $taskDocuments 'Личные проекты'
$taskPanel = Join-Path $taskProjects 'DeskPanel'
New-Item -ItemType Directory -Path $taskProjects -Force | Out-Null
if (Test-Path -LiteralPath $taskPanel) { throw 'Папка DeskPanel уже существует. Используй раздел обновления в конце инструкции.' }

git clone --branch codex/initial-panel https://github.com/Thetrial94/Deskpanel.git $taskPanel
if ($LASTEXITCODE -ne 0) { throw 'Git clone не завершился.' }
Set-Location -LiteralPath $taskPanel
npm.cmd ci --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw 'Зависимости не установились.' }
npm.cmd test -- --test-concurrency=1
if ($LASTEXITCODE -ne 0) { throw 'Проверки не прошли.' }
npm.cmd run check
if ($LASTEXITCODE -ne 0) { throw 'Проверка синтаксиса не прошла.' }
```

Все дальнейшие команды DeskPanel выполняются из этой папки. При открытии нового окна вернуться в неё можно так:

```powershell
$taskPanel = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Личные проекты\DeskPanel'
Set-Location -LiteralPath $taskPanel
```

## 5. На мини-ПК: питание и порт панели

В **окне администратора** под тем же пользователем:

```powershell
powercfg.exe /change standby-timeout-ac 0
powercfg.exe /change hibernate-timeout-ac 0
powercfg.exe /change monitor-timeout-ac 10

$taskNodePath = (Get-Command node.exe -CommandType Application | Select-Object -First 1).Source
$taskPanelRule = @{
    Name = 'DeskPanel-LAN-4317'
    DisplayName = 'DeskPanel LAN 4317'
    Direction = 'Inbound'
    Action = 'Allow'
    Protocol = 'TCP'
    LocalPort = 4317
    Program = $taskNodePath
    Profile = 'Private'
    RemoteAddress = 'LocalSubnet'
}
if (Get-NetFirewallRule -Name $taskPanelRule.Name -ErrorAction SilentlyContinue) {
    $taskPanelRule.Remove('DisplayName')
    Set-NetFirewallRule @taskPanelRule -Enabled True | Out-Null
} else {
    New-NetFirewallRule @taskPanelRule | Out-Null
}
```

Сон и автоматическая гибернация при питании от сети отключены, монитор может гаснуть через 10 минут. Это не выключает мини-ПК. Сеть должна иметь профиль `Private`, выбранный в шаге 2.3.

## 6. На мини-ПК: включить хаб и автозапуск

В **обычном PowerShell**, из папки DeskPanel:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-hub.ps1
if ($LASTEXITCODE -ne 0) { throw 'Хаб не настроился.' }

powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\deskpanel.ps1 -Action Status
Invoke-RestMethod -Uri 'http://127.0.0.1:4317/api/health' | Select-Object ok, app
```

Ожидается `Autostart=True`, `SupervisorRunning=True` и `ok=True`, `app=deskpanel`. Вначале `State` может быть `starting`; через несколько секунд повтори проверку, ожидается `running`.

Скрипт включает автозапуск **при входе этого пользователя в Windows**, а не службу до входа. После перезагрузки нужно войти в эту учётную запись, в том числе через RustDesk. Блокировка Windows или закрытие удалённого окна работу хаба не останавливает. При завершении сеанса пользователя хаб остановится до следующего входа.

## 7. На мини-ПК: подключить календарь и Яндекс Дом через PowerShell

Загрузи подготовленные функции в текущее окно. Загрузка только определяет команды, настройки пока не меняет:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
. .\scripts\hub-console.ps1
Set-DeskPanelName -Name 'Мини-ПК'
```

Политика меняется только на время текущего процесса. Если рабочая политика Windows запрещает запуск даже в этом режиме, её требуется согласованно разрешить; инструкция не меняет машинные политики.

Календарь:

```powershell
Set-DeskPanelCalendar
```

В скрытый ввод вставь прежнюю приватную ссылку экспорта ICS. Это ссылка подписки на календарь, а не адрес страницы. Значение не сохраняется в истории команд. Если корпоративному календарю нужен доступ к внутренней сети, он должен быть доступен с мини-ПК.

Яндекс Дом:

```powershell
Set-DeskPanelYandexHome
```

В скрытый ввод вставь OAuth-токен с правами `iot:view` и `iot:control`. Здесь нужен **токен**, а не ClientID или Client Secret. Можно использовать уже выданный тебе действующий токен; если его значение не сохранено у тебя, понадобится получить доступный токен штатным способом. Скрипты не извлекают его из защищённого хранилища другого компьютера.

Проверь:

```powershell
Get-DeskPanelSummary | Format-Table -AutoSize
```

У календаря и Дома ожидается `connected`. Ноль событий или устройств сам по себе не означает сбой; Дом в интерфейсе показывает только «Квартиру». `configuration saved` означает сохранение настроек, а реальную загрузку подтверждает `connected` в проверке.

Подключения шифруются Windows DPAPI для текущего пользователя на мини-ПК. Файл с ноутбука для переноса не подходит.

## 8. Подготовить ноутбук и ПК с Claude

На каждом из двух компьютеров нужен свой запущенный DeskPanel. На ноутбуке это уже настроено; на ПК сначала сохрани локальные изменения, затем получи текущую общую ветку. Из существующей папки проекта:

```powershell
git status --short
```

Если вывод не пустой, сохрани и объедини изменения до обновления. Для чистого дерева, находясь в `codex/initial-panel`:

```powershell
git branch --show-current
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\deskpanel.ps1 -Action Stop
git pull --ff-only origin codex/initial-panel
if ($LASTEXITCODE -ne 0) { throw 'Не удалось обновить ветку. Сервер можно вернуть командой Start.' }
npm.cmd ci --ignore-scripts
if ($LASTEXITCODE -ne 0) { throw 'Зависимости не установились.' }
```

На **ПК с Claude**, если требуется сбор лимитов через statusLine, выполни:

```powershell
node .\scripts\install-claude-hooks.mjs
```

На каждом из двух компьютеров включи/возобнови автозапуск:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\deskpanel.ps1 -Action Install
Invoke-RestMethod -Uri 'http://127.0.0.1:4317/api/health' | Select-Object ok, app
```

Если сервер только запускается, повтори проверку через несколько секунд. Перезапусти сессии Claude после изменения обработчиков; лимиты появятся после первого ответа и при поддержке этих полей установленной версией Claude Code.

Домашнее подключение на каждом компьютере должно иметь профиль `Private`, а Node.js должен принимать TCP 4317 от локальной сети. При необходимости повтори шаг 5 с правилом брандмауэра на этом компьютере; параметры питания из того шага предназначены для постоянно включённого мини-ПК.

Узнать адрес каждого компьютера:

```powershell
Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway } |
    Select-Object InterfaceAlias, @{Name='IPv4';Expression={$_.IPv4Address.IPAddress}}
```

Используй адрес домашнего Ethernet/Wi-Fi, а не VPN-адаптера. Запиши адрес ноутбука и ПК. Адреса вида `192.168.0.115` в прежних сообщениях могли измениться.

## 9. Привязать оба компьютера к хабу

Коды одноразовые и действуют три минуты. Следующие действия повтори отдельно для ноутбука и ПК.

### 9.1. Ноутбук → Codex

В обычном PowerShell **на ноутбуке**, из папки DeskPanel:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
. .\scripts\hub-console.ps1
New-DeskPanelPairCode
```

В PowerShell **на мини-ПК** (локально или через RustDesk), где загружены функции шага 7:

```powershell
$taskLaptopIp = (Read-Host 'IPv4 ноутбука').Trim()
Add-DeskPanelComputer -Name 'Ноутбук' -NodeUrl ('http://{0}:4317' -f $taskLaptopIp) -Agent codex
```

Введи код, показанный на ноутбуке.

### 9.2. Стационарный ПК → Claude

В PowerShell **на ПК с Claude**, из папки DeskPanel:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
. .\scripts\hub-console.ps1
New-DeskPanelPairCode
```

В PowerShell **на мини-ПК**:

```powershell
$taskDesktopIp = (Read-Host 'IPv4 ПК с Claude').Trim()
Add-DeskPanelComputer -Name 'ПК' -NodeUrl ('http://{0}:4317' -f $taskDesktopIp) -Agent claude
Get-DeskPanelComputers | Format-Table -AutoSize
Get-DeskPanelSummary | Format-Table -AutoSize
```

Введи код с ПК. У каждого агента в `Source` должен быть свой компьютер. `awaiting_events` означает, что нужно открыть соответствующего агента и получить события, а не менять привязку музыки. Привязка хаба не устанавливает обработчики агента.

## 10. Выбрать компьютер для музыки

На мини-ПК:

```powershell
Select-DeskPanelMusic -Name 'Ноутбук'
```

Или:

```powershell
Select-DeskPanelMusic -Name 'ПК'
```

Это сохраняет только источник музыки. Codex остаётся на ноутбуке, Claude — на ПК. Яндекс Музыка RS с уже настроенным мостом должна работать на выбранном включённом компьютере. Затем переключать музыку можно сохранёнными кнопками на телефоне.

## 11. Подключить телефон к адресу мини-ПК

На мини-ПК:

```powershell
New-DeskPanelPairCode
```

Далее **на телефоне**: в Fully открой его настройки и задай `Web Content Settings → Start URL` равным `http://IPv4-мини-ПК:4317`, затем открой Start URL. В DeskPanel → Настройки → Доступ с телефона введи выданный код. Если он истёк, выполни команду ещё раз.

Это два действия на Android. PowerShell на компьютере без отдельного подключения телефона не управляет настройками Fully. Здесь сохраняется ручное открытие Fully; разрешение «Поверх других приложений» не требуется.

Адрес теперь другой, поэтому браузер создаст для него отдельные настройки. Выбранные модули обзора, порядок экранов, таймеры и cookie прежнего адреса автоматически на новый не переносятся. Прежняя панель и её данные остаются по старому адресу.

## 12. Проверить результат

1. На телефоне открыты погода, календарь и «Квартира» через мини-ПК.
2. При двух включённых компьютерах видны одновременно Codex и Claude. Пульт переключается кнопками, музыка направляется на выбранный компьютер.
3. Останови DeskPanel на ноутбуке его командой `Stop`: исчезнут только Codex и управление ноутбуком. Claude, календарь и Дом продолжат работать. Верни ноутбук командой `Start`.
4. Повтори с ПК: недоступны только Claude и управление ПК. Верни его командой `Start`.
5. Закрой окно RustDesk: панель должна продолжить работу. Не выбирай «Выйти из учётной записи» Windows.
6. При удобном перерыве перезагрузи мини-ПК командой `Restart-Computer`, подключись через RustDesk и войди в того же пользователя Windows. Через несколько секунд проверь `Get-DeskPanelSummary` и телефон. Во время перезагрузки панель временно недоступна.

Команды остановки и запуска, из папки DeskPanel **на соответствующем компьютере**:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\deskpanel.ps1 -Action Stop
```

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\deskpanel.ps1 -Action Start
```

Адреса устройств пока используются числовые IPv4. Чтобы они сохранялись после перезагрузок роутера, желательно закрепить DHCP-адреса мини-ПК, ноутбука и ПК в роутере. Универсальной PowerShell-команды для неизвестной модели роутера нет. Эта инструкция не переводит сетевые адаптеры на случайные статические адреса. При смене IP хаба обнови Start URL телефона, при смене IP компьютера потребуется обновить его привязку.

## 13. Обновления и диагностика

### Обновить хаб

На мини-ПК из папки DeskPanel, при чистом дереве `git status --short`:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\deskpanel.ps1 -Action Stop
try {
    git pull --ff-only origin codex/initial-panel
    if ($LASTEXITCODE -ne 0) { throw 'Git pull не завершился.' }
    npm.cmd ci --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw 'Зависимости не установились.' }
    npm.cmd test -- --test-concurrency=1
    if ($LASTEXITCODE -ne 0) { throw 'Тесты не прошли.' }
    npm.cmd run check
    if ($LASTEXITCODE -ne 0) { throw 'Проверка синтаксиса не прошла.' }
} finally {
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\deskpanel.ps1 -Action Start
}
```

После обновления перезагрузи страницу на телефоне. Секреты и привязки хранятся отдельно от репозитория и при обычном pull сохраняются.

### Панель недоступна

На мини-ПК:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\deskpanel.ps1 -Action Status
Invoke-RestMethod -Uri 'http://127.0.0.1:4317/api/health'
Get-NetTCPConnection -LocalPort 4317 -State Listen -ErrorAction SilentlyContinue
```

На ноутбуке:

```powershell
$taskMiniPcIp = (Read-Host 'IPv4 мини-ПК').Trim()
Test-NetConnection -ComputerName $taskMiniPcIp -Port 4317
```

Локальная проверка работает, а сетевой тест нет — проверь домашний IP, профиль `Private`, правило брандмауэра и изоляцию Wi-Fi. Гостевая сеть часто изолирует устройства. `port_busy` означает другой процесс на 4317; не останавливай неизвестный процесс вслепую. При ошибке кода привязки получи новый на нужном компьютере; после пяти неверных попыток сервер ограничивает попытки на 10 минут.

Повторно загрузить функции после открытия нового PowerShell:

```powershell
$taskPanel = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Личные проекты\DeskPanel'
Set-Location -LiteralPath $taskPanel
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
. .\scripts\hub-console.ps1
```

### Отключить удалённое управление при необходимости

На мини-ПК из PowerShell администратора:

```powershell
Stop-Service -Name RustDesk
Set-Service -Name RustDesk -StartupType Disabled
Disable-NetFirewallRule -Name 'DeskPanel-RustDesk-LAN'
```

После этого удалённая сессия оборвётся. Сам DeskPanel продолжает работать. Для восстановления: `Set-Service -Name RustDesk -StartupType Automatic`, `Start-Service -Name RustDesk`, `Enable-NetFirewallRule -Name 'DeskPanel-RustDesk-LAN'` на самом мини-ПК.

## Источники и границы проверки

Проверены актуальные команды и контракт API DeskPanel, синтаксис PowerShell-блоков, консольные функции с тестовым сервером и синтетическими секретами. Реальная установка RustDesk, сетевые правила, питание и перезагрузка твоего мини-ПК этой инструкцией пока не выполнены. Полная работоспособность хаба проверяется шагом 12 после установки.

- Microsoft: Remote Desktop и поддерживаемые редакции Windows — https://learn.microsoft.com/windows-server/remote/remote-desktop-services/remotepc/remote-desktop-allow-access
- Microsoft: WinGet — https://learn.microsoft.com/windows/package-manager/winget/install
- Microsoft: питание — https://learn.microsoft.com/windows-hardware/design/device-experiences/powercfg-command-line-options
- Microsoft: брандмауэр — https://learn.microsoft.com/powershell/module/netsecurity/new-netfirewallrule
- RustDesk: CLI и установка — https://rustdesk.com/docs/en/client/
- RustDesk: развёртывание службы — https://rustdesk.com/docs/en/self-host/client-deployment/
- RustDesk: прямой доступ и режим пароля — https://rustdesk.com/docs/en/self-host/client-configuration/advanced-settings/
- Официальные исходники CLI релиза — https://github.com/rustdesk/rustdesk/blob/1.5.3/src/core_main.rs
