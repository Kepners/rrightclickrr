@echo off
setlocal

set CMAKE="C:\Program Files\CMake\bin\cmake.exe"

echo Setting up Visual Studio environment...
call "C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat" > nul 2>&1

echo Changing to shell-extension directory...
cd /d "c:\Users\kepne\OneDrive\Documents\GitHub\rrightclickrr\shell-extension"

echo Cleaning build directory...
if exist build rd /s /q build
mkdir build
cd build

echo Running CMake...
%CMAKE% -G "Visual Studio 16 2019" -A x64 ..
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
