@echo off
setlocal
set "SCAN_ROOT=%~dp0.."

if "%~1"=="" (
  echo Usage: validate-caspos.cmd C:\path\to\CloudSale-export.xlsx
  exit /b 2
)

where java >nul 2>nul
if errorlevel 1 (
  echo Java was not found. Install an approved Java 21 runtime or add it to PATH.
  exit /b 3
)

if not exist "%SCAN_ROOT%\scan-connector.jar" (
  echo scan-connector.jar must be in the package root above the windows directory.
  exit /b 4
)

java -jar "%SCAN_ROOT%\scan-connector.jar" --validate-caspos "%~1"
exit /b %errorlevel%
