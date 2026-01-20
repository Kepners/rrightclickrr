@echo off
call "C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat"
cd /d "%~dp0"
if exist build rmdir /s /q build
mkdir build
cd build
cmake -G "Visual Studio 17 2022" -A x64 ..
cmake --build . --config Release
echo.
echo Build complete!
if exist Release\RRightclickrrShell.dll (
    echo DLL created successfully
    copy /Y Release\RRightclickrrShell.dll ..\dist\
) else (
    echo ERROR: DLL not created!
)
