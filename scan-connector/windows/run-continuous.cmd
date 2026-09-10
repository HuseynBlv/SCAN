@echo off
setlocal
set "SCAN_ROOT=%~dp0.."

where java >nul 2>nul
if errorlevel 1 (
  echo Java was not found. Install an approved Java 21 runtime or add it to PATH.
  exit /b 3
)

if not exist "%SCAN_ROOT%\scan-connector.jar" (
  echo scan-connector.jar must be in the package root above the windows directory.
  exit /b 4
)

if not exist "%SCAN_ROOT%\connector.properties" (
  echo connector.properties must be in the package root above the windows directory.
  exit /b 5
)

java -jar "%SCAN_ROOT%\scan-connector.jar" --config "%SCAN_ROOT%\connector.properties"
exit /b %errorlevel%
