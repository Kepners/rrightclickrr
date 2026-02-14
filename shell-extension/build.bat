@echo off
setlocal

echo ========================================
echo Building RRightclickrr Shell Extension
echo ========================================

:: Check for Visual Studio
where cl >nul 2>&1
if %errorlevel% neq 0 (
    set VSWHERE="C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe"
    set VS_INSTALL=

    if exist %VSWHERE% (
        for /f "usebackq delims=" %%i in (`%VSWHERE% -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set VS_INSTALL=%%i
    )

    if not defined VS_INSTALL (
        echo ERROR: Visual Studio C++ compiler not found!
        echo Please install Visual Studio Build Tools with C++ workload
        exit /b 1
    )

    call "%VS_INSTALL%\Common7\Tools\VsDevCmd.bat" >nul 2>&1
    where cl >nul 2>&1
    if %errorlevel% neq 0 (
        echo ERROR: Failed to initialize Visual Studio C++ toolchain
        exit /b 1
    )
)

:: Create build directory
if not exist build mkdir build
cd build

:: Configure with CMake
echo.
echo Configuring with CMake...
cmake -G "Visual Studio 17 2022" -A x64 ..
if %errorlevel% neq 0 (
    echo ERROR: CMake configuration failed!
    exit /b 1
)

:: Build Release version
echo.
echo Building Release...
cmake --build . --config Release
if %errorlevel% neq 0 (
    echo ERROR: Build failed!
    exit /b 1
)

:: Copy DLL to output
echo.
echo Copying DLL...
if not exist ..\dist mkdir ..\dist
copy /Y Release\RRightclickrrShell.dll ..\dist\

echo.
echo ========================================
echo Build successful!
echo Output: shell-extension\dist\RRightclickrrShell.dll
echo ========================================

cd ..
