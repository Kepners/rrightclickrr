@echo off
setlocal

echo ========================================
echo Building RRightclickrr Shell Extension
echo ========================================

:: Check for Visual Studio
where cl >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Visual Studio C++ compiler not found!
    echo Please run this from a Visual Studio Developer Command Prompt
    echo Or install Visual Studio Build Tools with C++ workload
    exit /b 1
)

:: Create build directory
if not exist build mkdir build
cd build

:: Configure with CMake
echo.
echo Configuring with CMake...
cmake -G "Visual Studio 16 2019" -A x64 ..
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
