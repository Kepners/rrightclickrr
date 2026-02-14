@echo off
setlocal

set CMAKE="C:\Program Files\CMake\bin\cmake.exe"
set VSWHERE="C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe"
set VS_INSTALL=
set VSDEVCMD=

echo Setting up Visual Studio environment...
if exist %VSWHERE% (
    for /f "usebackq delims=" %%i in (`%VSWHERE% -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set VS_INSTALL=%%i
)

if not defined VS_INSTALL (
    echo Could not find Visual Studio Build Tools with C++ workload.
    exit /b 1
)

set VSDEVCMD=%VS_INSTALL%\Common7\Tools\VsDevCmd.bat
call "%VSDEVCMD%" > nul 2>&1
if %errorlevel% neq 0 (
    echo Failed to initialize Visual Studio command environment.
    exit /b 1
)

echo Changing to shell-extension directory...
cd /d "c:\Users\kepne\OneDrive\Documents\GitHub\rrightclickrr\shell-extension"

echo Cleaning build directory...
if exist build rd /s /q build
mkdir build
cd build

echo Running CMake...
%CMAKE% -G "Visual Studio 17 2022" -A x64 ..
if %errorlevel% neq 0 (
    echo CMake failed!
    pause
    exit /b 1
)

echo Building...
%CMAKE% --build . --config Release
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b 1
)

echo.
echo Checking output...
if exist Release\RRightclickrrShell.dll (
    echo SUCCESS: DLL created!
    if not exist ..\dist mkdir ..\dist
    copy /Y Release\RRightclickrrShell.dll ..\dist\
    copy /Y Release\RRightclickrrShell.dll ..\RRightclickrrShell.dll
    echo.
    echo DLL copied to shell-extension\ for sparse package
) else (
    echo FAILED: No DLL found
    pause
)
